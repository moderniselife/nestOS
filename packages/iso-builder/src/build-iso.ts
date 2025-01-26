#!/usr/bin/env node
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.join(__dirname, '../build');
const ISO_DIR = path.join(BUILD_DIR, 'iso');
const CHROOT_DIR = path.join(BUILD_DIR, 'chroot');

async function setupBuildEnvironment() {
  const spinner = ora('Setting up build environment').start();
  try {
    // Remove existing build directory if it exists
    if (await fs.pathExists(BUILD_DIR)) {
      spinner.text = 'Cleaning build directory...';
      try {
        // Instead of removing, clean the contents
        const files = await fs.readdir(BUILD_DIR);
        for (const file of files) {
          const filePath = path.join(BUILD_DIR, file);
          await fs.remove(filePath);
        }
      } catch (cleanError) {
        console.warn('Warning: Could not clean build directory, continuing anyway...');
      }
    } else {
      // If directory doesn't exist, create it
      await fs.ensureDir(BUILD_DIR);
    }

    // Create build directories with proper permissions
    spinner.text = 'Creating build directories...';
    await fs.ensureDir(ISO_DIR);
    await fs.ensureDir(CHROOT_DIR);
    await fs.ensureDir(path.join(ISO_DIR, 'boot/grub'));
    await fs.ensureDir(path.join(ISO_DIR, 'live'));

    // Set proper permissions
    spinner.text = 'Setting permissions...';
    await execa('chmod', ['-R', '777', BUILD_DIR]);

    // Verify directories were created
    const dirs = [BUILD_DIR, ISO_DIR, CHROOT_DIR];
    for (const dir of dirs) {
      if (!await fs.pathExists(dir)) {
        throw new Error(`Failed to create directory: ${dir}`);
      }
    }

    spinner.succeed('Build environment setup complete');

    // Log directory structure
    console.log('\nBuild directory structure:');
    const { stdout } = await execa('tree', [BUILD_DIR]);
    console.log(stdout);
  } catch (error) {
    spinner.fail(`Failed to setup build environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error:', error);
    throw error;
  }
}

async function downloadBaseSystem() {
  const spinner = ora('Downloading Debian base system').start();
  try {
    console.log('\nStarting debootstrap with following parameters:');
    console.log('Architecture: amd64');
    console.log('Variant: minbase');
    console.log('Distribution: bookworm');
    console.log('Target directory:', CHROOT_DIR);
    console.log('Mirror: http://deb.debian.org/debian');

    // First check if debootstrap is available
    try {
      await execa('which', ['debootstrap']);
    } catch (error) {
      throw new Error('debootstrap is not installed or not in PATH');
    }

    // Check if target directory is writable
    try {
      await fs.access(CHROOT_DIR, fs.constants.W_OK);
    } catch (error) {
      throw new Error(`Target directory ${CHROOT_DIR} is not writable`);
    }

    // Run debootstrap with verbose output
    const debootstrap = execa('debootstrap', [
      '--arch=amd64',
      '--variant=minbase',
      '--verbose',
      'bookworm',
      CHROOT_DIR,
      'http://deb.debian.org/debian'
    ]);

    // Stream output in real-time
    if (debootstrap.stdout) {
      debootstrap.stdout.pipe(process.stdout);
    }
    if (debootstrap.stderr) {
      debootstrap.stderr.pipe(process.stderr);
    }

    await debootstrap;

    // Verify the chroot was created properly
    const chrootFiles = await fs.readdir(CHROOT_DIR);
    console.log('\nFiles in chroot directory:', chrootFiles);

    if (!chrootFiles.includes('bin') || !chrootFiles.includes('etc')) {
      throw new Error('Chroot directory is missing essential system directories');
    }

    spinner.succeed('Base system downloaded');
  } catch (error) {
    spinner.fail(`Failed to download base system: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('\nFull error details:');
    if (error && typeof error === 'object') {
      const err = error as { [key: string]: unknown };
      if ('stdout' in err) console.error('Command output:', err.stdout);
      if ('stderr' in err) console.error('Command error:', err.stderr);
    }
    throw error;
  }
}

async function configureSystem() {
  const spinner = ora('Configuring system').start();
  try {
    // Copy system configuration files
    await fs.copy(
      path.join(__dirname, '../templates/system'),
      path.join(CHROOT_DIR, 'etc')
    );

    // Configure hostname
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/hostname'),
      'nestos'
    );

    // Configure network interfaces
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/network/interfaces'),
      'auto lo\niface lo inet loopback\n'
    );

    // Configure package sources
    await fs.writeFile(
      path.join(CHROOT_DIR, 'etc/apt/sources.list'),
      'deb http://deb.debian.org/debian bookworm main contrib non-free\n' +
      'deb http://security.debian.org/debian-security bookworm-security main contrib non-free\n'
    );

    spinner.succeed('System configured');
  } catch (error) {
    spinner.fail(`Failed to configure system: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error:', error);
    throw error;
  }
}

async function installPackages() {
  const spinner = ora('Installing required packages').start();
  try {
    const packages = [
      'linux-image-amd64',
      'systemd-sysv',
      'grub-pc',
      'network-manager',
      'openssh-server',
      'curl',
      'docker.io',
      'mdadm',
      'smartmontools',
      'samba',
      'nfs-kernel-server',
      'nodejs',
      'npm'
    ];

    await execa('chroot', [
      CHROOT_DIR,
      'apt-get', 'update'
    ]);

    await execa('chroot', [
      CHROOT_DIR,
      'apt-get', 'install', '-y',
      ...packages
    ]);

    spinner.succeed('Packages installed');
  } catch (error) {
    spinner.fail(`Failed to install packages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error:', error);
    throw error;
  }
}

async function installNestOSComponents() {
  const spinner = ora('Installing NestOS components').start();
  try {
    // Create base directories
    await fs.ensureDir(path.join(CHROOT_DIR, 'opt/nestos/system-service'));
    await fs.ensureDir(path.join(CHROOT_DIR, 'opt/nestos/control-panel'));

    // Try to copy components if they exist
    const systemServicePath = path.join(__dirname, '../../system-service/dist');
    const controlPanelPath = path.join(__dirname, '../../control-panel/dist');

    if (await fs.pathExists(systemServicePath)) {
      await fs.copy(systemServicePath, path.join(CHROOT_DIR, 'opt/nestos/system-service'));
    } else {
      console.warn('Warning: system-service not found, skipping...');
    }

    if (await fs.pathExists(controlPanelPath)) {
      await fs.copy(controlPanelPath, path.join(CHROOT_DIR, 'opt/nestos/control-panel'));
    } else {
      console.warn('Warning: control-panel not found, skipping...');
    }

    // Copy systemd service files if they exist
    const servicesPath = path.join(__dirname, '../templates/services');
    if (await fs.pathExists(servicesPath)) {
      await fs.copy(servicesPath, path.join(CHROOT_DIR, 'etc/systemd/system'));
      
      // Enable services only if we copied them
      await execa('chroot', [
        CHROOT_DIR,
        'systemctl', 'enable',
        'nestos-system.service',
        'nestos-control-panel.service'
      ]);
    } else {
      console.warn('Warning: service templates not found, skipping...');
    }

    spinner.succeed('NestOS components installed (with warnings)');
  } catch (error) {
    spinner.fail(`Failed to install NestOS components: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error:', error);
    throw error;
  }
}

async function createISO() {
  const spinner = ora('Creating ISO image').start();
  try {
    // Generate initramfs
    spinner.text = 'Generating initramfs...';
    const initramfsResult = await execa('chroot', [
      CHROOT_DIR,
      'update-initramfs', '-u', '-v'
    ]);
    console.log('Initramfs output:', initramfsResult.stdout);

    // Find and copy kernel and initrd
    spinner.text = 'Copying kernel and initrd...';
    const bootFiles = await fs.readdir(path.join(CHROOT_DIR, 'boot'));

    const kernelFile = bootFiles.find(file => file.startsWith('vmlinuz-'));
    const initrdFile = bootFiles.find(file => file.startsWith('initrd.img-'));

    if (!kernelFile || !initrdFile) {
      throw new Error('Kernel or initrd files not found');
    }

    await fs.copy(
      path.join(CHROOT_DIR, 'boot', kernelFile),
      path.join(ISO_DIR, 'boot/vmlinuz')
    );
    await fs.copy(
      path.join(CHROOT_DIR, 'boot', initrdFile),
      path.join(ISO_DIR, 'boot/initrd.img')
    );

    // Create GRUB configuration
    spinner.text = 'Creating GRUB configuration...';
    const grubConfig = `
set timeout=5
set default=0

menuentry "NestOS" {
  linux /boot/vmlinuz root=/dev/ram0 quiet
  initrd /boot/initrd.img
}
`;
    await fs.writeFile(path.join(ISO_DIR, 'boot/grub/grub.cfg'), grubConfig);

    // Create squashfs of the system
    spinner.text = 'Creating squashfs filesystem...';
    await fs.ensureDir(path.join(ISO_DIR, 'live'));
    const squashfsResult = await execa('mksquashfs', [
      CHROOT_DIR,
      path.join(ISO_DIR, 'live/filesystem.squashfs'),
      '-comp', 'xz',
      '-info'
    ]);
    console.log('Squashfs creation output:', squashfsResult.stdout);

    // List files before creating ISO
    spinner.text = 'Verifying ISO directory structure...';
    const { stdout: treeOutput } = await execa('tree', [ISO_DIR]);
    console.log('ISO directory structure:', treeOutput);

    // Try creating ISO with grub-mkrescue first
    try {
      spinner.text = 'Creating ISO with grub-mkrescue...';
      const grubResult = await execa('grub-mkrescue', [
        '-o', path.join(BUILD_DIR, 'nestos.iso'),
        ISO_DIR,
        '--verbose'
      ]);
      console.log('GRUB mkrescue output:', grubResult.stdout);
    } catch (grubError) {
      console.warn('grub-mkrescue failed, falling back to genisoimage...');
      console.error('grub-mkrescue error:', grubError);

      // Fallback to genisoimage
      spinner.text = 'Creating ISO with genisoimage...';
      await execa('genisoimage', [
        '-o', path.join(BUILD_DIR, 'nestos.iso'),
        '-b', 'boot/grub/i386-pc/eltorito.img',
        '-no-emul-boot',
        '-boot-load-size', '4',
        '-boot-info-table',
        '-R',
        '-J',
        '-v',
        '-T',
        ISO_DIR
      ]);

      // Make ISO bootable with isohybrid
      spinner.text = 'Making ISO bootable with isohybrid...';
      await execa('isohybrid', [
        path.join(BUILD_DIR, 'nestos.iso')
      ]);
    }

    // Verify ISO was created and get its size
    const isoExists = await fs.pathExists(path.join(BUILD_DIR, 'nestos.iso'));
    if (!isoExists) {
      throw new Error('ISO file was not created');
    }

    const isoStats = await fs.stat(path.join(BUILD_DIR, 'nestos.iso'));
    console.log(`ISO file created successfully. Size: ${(isoStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Add this at the end of the try block, before the spinner.succeed
    // Copy ISO to output directory
    spinner.text = 'Copying ISO to output directory...';
    await fs.ensureDir('/output');
    await fs.copy(
      path.join(BUILD_DIR, 'nestos.iso'),
      '/output/nestos.iso'
    );

    spinner.succeed('ISO image created successfully');
  } catch (error) {
    spinner.fail(`Failed to create ISO image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error details:');

    if (error && typeof error === 'object') {
      // Safe type assertion since we checked it's an object
      const err = error as { [key: string]: unknown };
      if ('stdout' in err) console.error('Command output:', err.stdout);
      if ('stderr' in err) console.error('Command error:', err.stderr);
    }

    throw error;
  }
}

export async function buildIso() {
  console.log(chalk.blue('Starting NestOS ISO build process...'));

  try {
    await setupBuildEnvironment();
    await downloadBaseSystem();
    await configureSystem();
    await installPackages();
    await installNestOSComponents();
    await createISO();

    console.log(chalk.green('\nBuild completed successfully!'));
    console.log(chalk.white(`ISO image available at: ${path.join(BUILD_DIR, 'nestos.iso')}`));
  } catch (error) {
    console.error(chalk.red('\nBuild failed:'), error);
    process.exit(1);
  }
}

// Add this at the end of the file
if (import.meta.url === `file://${__filename}`) {
  buildIso().catch((error) => {
    console.error('Failed to build ISO:', error);
    process.exit(1);
  });
}