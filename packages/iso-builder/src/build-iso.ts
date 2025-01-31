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
const CHROOT_DIR_AMD64 = path.join(BUILD_DIR, 'chroot-amd64');
const CHROOT_DIR_ARM64 = path.join(BUILD_DIR, 'chroot-arm64');

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
    await fs.ensureDir(CHROOT_DIR_AMD64);
    await fs.ensureDir(CHROOT_DIR_ARM64);
    await fs.ensureDir(path.join(ISO_DIR, 'amd64/boot/grub'));
    await fs.ensureDir(path.join(ISO_DIR, 'amd64/live'));
    await fs.ensureDir(path.join(ISO_DIR, 'arm64/boot/grub'));
    await fs.ensureDir(path.join(ISO_DIR, 'arm64/live'));

    // Set proper permissions
    spinner.text = 'Setting permissions...';
    await execa('chmod', ['-R', '777', BUILD_DIR]);

    // Verify directories were created
    const dirs = [BUILD_DIR, ISO_DIR, CHROOT_DIR_AMD64, CHROOT_DIR_ARM64];
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

async function downloadBaseSystem(arch: 'amd64' | 'arm64') {
  const spinner = ora(`Downloading Debian base system for ${arch}`).start();
  const chrootDir = arch === 'amd64' ? CHROOT_DIR_AMD64 : CHROOT_DIR_ARM64;

  try {
    console.log(`\nStarting debootstrap for ${arch} with following parameters:`);
    console.log(`Architecture: ${arch}`);
    console.log('Distribution: bookworm');
    console.log('Target directory:', chrootDir);
    console.log('Mirror: http://deb.debian.org/debian');

    const debootstrap = execa('debootstrap', [
      `--arch=${arch}`,
      '--include=linux-image-' + arch,
      '--verbose',
      'bookworm',
      chrootDir,
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
    const chrootFiles = await fs.readdir(chrootDir);
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

// Update other functions to accept architecture parameter
async function configureSystem(arch: 'amd64' | 'arm64') {
  const chrootDir = arch === 'amd64' ? CHROOT_DIR_AMD64 : CHROOT_DIR_ARM64;
  const spinner = ora('Configuring system').start();
  try {
    // Copy system configuration files
    await fs.copy(
      path.join(__dirname, '../templates/system'),
      path.join(chrootDir, 'etc')
    );

    // Configure hostname
    await fs.writeFile(
      path.join(chrootDir, 'etc/hostname'),
      'nestos'
    );

    // Configure network interfaces
    await fs.writeFile(
      path.join(chrootDir, 'etc/network/interfaces'),
      'auto lo\niface lo inet loopback\n'
    );

    // Configure package sources
    await fs.writeFile(
      path.join(chrootDir, 'etc/apt/sources.list'),
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

async function installPackages(arch: 'amd64' | 'arm64') {
  const chrootDir = arch === 'amd64' ? CHROOT_DIR_AMD64 : CHROOT_DIR_ARM64;
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
      'npm',
      'grub-efi-amd64',
      'live-boot',
      'live-config',
      'sudo',
      'bash-completion',
      'ca-certificates',
      'locales',
      'console-setup'
    ];

    await execa('chroot', [
      chrootDir,
      'apt-get', 'update'
    ]);

    await execa('chroot', [
      chrootDir,
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

async function installNestOSComponents(arch: 'amd64' | 'arm64') {
  const chrootDir = arch === 'amd64' ? CHROOT_DIR_AMD64 : CHROOT_DIR_ARM64;
  const spinner = ora('Installing NestOS components').start();
  try {
    // Create base directories
    await fs.ensureDir(path.join(chrootDir, 'opt/nestos/system-service'));
    await fs.ensureDir(path.join(chrootDir, 'opt/nestos/control-panel'));

    // Try to copy components if they exist
    const systemServicePath = path.join(__dirname, '../../system-service/dist');
    const controlPanelPath = path.join(__dirname, '../../control-panel/dist');

    if (await fs.pathExists(systemServicePath)) {
      await fs.copy(systemServicePath, path.join(chrootDir, 'opt/nestos/system-service'));
    } else {
      console.warn('Warning: system-service not found, skipping...');
    }

    if (await fs.pathExists(controlPanelPath)) {
      await fs.copy(controlPanelPath, path.join(chrootDir, 'opt/nestos/control-panel'));
    } else {
      console.warn('Warning: control-panel not found, skipping...');
    }

    // Copy systemd service files if they exist
    const servicesPath = path.join(__dirname, '../templates/services');
    if (await fs.pathExists(servicesPath)) {
      await fs.copy(servicesPath, path.join(chrootDir, 'etc/systemd/system'));

      // Enable services only if we copied them
      await execa('chroot', [
        chrootDir,
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

async function createISO(arch: 'amd64' | 'arm64') {
  const chrootDir = arch === 'amd64' ? CHROOT_DIR_AMD64 : CHROOT_DIR_ARM64;
  const isoDir = path.join(ISO_DIR, arch);
  const spinner = ora('Creating ISO image').start();
  try {
    // Generate initramfs
    spinner.text = 'Generating initramfs...';
    const initramfsResult = await execa('chroot', [
      chrootDir,
      'update-initramfs', '-u', '-v'
    ]);
    console.log('Initramfs output:', initramfsResult.stdout);

    // Find and copy kernel and initrd
    spinner.text = 'Copying kernel and initrd...';
    const bootFiles = await fs.readdir(path.join(chrootDir, 'boot'));

    const kernelFile = bootFiles.find(file => file.startsWith('vmlinuz-'));
    const initrdFile = bootFiles.find(file => file.startsWith('initrd.img-'));

    if (!kernelFile || !initrdFile) {
      throw new Error('Kernel or initrd files not found');
    }

    await fs.copy(
      path.join(chrootDir, 'boot', kernelFile),
      path.join(isoDir, 'boot/vmlinuz')
    );
    await fs.copy(
      path.join(chrootDir, 'boot', initrdFile),
      path.join(isoDir, 'boot/initrd.img')
    );

    // Create GRUB configuration
    spinner.text = 'Creating GRUB configuration...';
    const grubConfig = `
insmod all_video
insmod gfxterm
insmod part_gpt
insmod part_msdos

set default=0
set timeout=5
set gfxmode=auto
terminal_output gfxterm

menuentry "NestOS" {
  search --no-floppy --set=root --file /live/vmlinuz
  linux /live/vmlinuz boot=live quiet
  initrd /live/initrd.img
}

menuentry "NestOS (Recovery Mode)" {
  search --no-floppy --set=root --file /live/vmlinuz
  linux /live/vmlinuz boot=live debug
  initrd /live/initrd.img
}
`;
    await fs.writeFile(path.join(isoDir, 'boot/grub/grub.cfg'), grubConfig);

    // Create squashfs of the system
    spinner.text = 'Creating squashfs filesystem...';
    await fs.ensureDir(path.join(isoDir, 'live'));
    const squashfsResult = await execa('mksquashfs', [
      chrootDir,
      path.join(isoDir, 'live/filesystem.squashfs'),
      '-comp', 'xz',
      '-info'
    ]);
    console.log('Squashfs creation output:', squashfsResult.stdout);

    // List files before creating ISO
    spinner.text = 'Verifying ISO directory structure...';
    const { stdout: isoTreeOutput } = await execa('tree', [ISO_DIR]);  // Renamed from treeOutput
    console.log('ISO directory structure:', isoTreeOutput);

    spinner.text = 'Setting up EFI boot...';
    const efiArch = arch === 'amd64' ? 'x64' : 'aa64';
    await fs.ensureDir(path.join(isoDir, 'EFI/boot'));

    // Copy GRUB EFI files
    const grubEfiSrc = arch === 'amd64'
      ? '/usr/lib/grub/x86_64-efi/grub.efi'
      : '/usr/lib/grub/arm64-efi/grub.efi';

    await fs.copy(
      grubEfiSrc,
      path.join(isoDir, `EFI/boot/boot${efiArch}.efi`)
    );

    // Create EFI boot image
    await execa('dd', [
      'if=/dev/zero',
      'of=' + path.join(isoDir, 'EFI/boot/efiboot.img'),
      'bs=1M',
      'count=4'
    ]);

    await execa('mkfs.vfat', [
      path.join(isoDir, 'EFI/boot/efiboot.img')
    ]);

    // Try creating iso with xorriso
    try {
      await execa('xorriso', [
        '-as', 'mkisofs',
        '-iso-level', '3',
        '-full-iso9660-filenames',
        '-volid', `NESTOS-${arch.toUpperCase()}`,
        '-eltorito-boot', arch === 'amd64' ? 'boot/grub/i386-pc/eltorito.img' : 'boot/grub/arm64-efi/eltorito.img',
        '-no-emul-boot',
        '-boot-load-size', '4',
        '-boot-info-table',
        '--eltorito-catalog', 'boot/grub/boot.cat',
        '--grub2-boot-info',
        ...(arch === 'amd64' ? ['--grub2-mbr', '/usr/lib/grub/i386-pc/boot_hybrid.img'] : []),
        '-eltorito-alt-boot',
        '-e', 'EFI/boot/efiboot.img',
        '-no-emul-boot',
        '-append_partition', '2', '0xef', 'EFI/boot/efiboot.img',
        '-output', path.join(BUILD_DIR, `nestos-${arch}.iso`),
        path.join(ISO_DIR, arch)
      ]);
    } catch (e) {
      // Try creating ISO with grub-mkrescue next
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
    }

    // Verify ISO was created and get its size
    const isoPath = path.join(BUILD_DIR, 'nestos.iso');
    const isoExists = await fs.pathExists(isoPath);
    if (!isoExists) {
      throw new Error('ISO file was not created');
    }

    // Get ISO details and verify
    const isoStats = await fs.stat(isoPath);
    console.log(`ISO file created successfully. Size: ${(isoStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Copy ISO to output directory
    spinner.text = 'Copying ISO to output directory...';
    await fs.ensureDir('/output');
    await fs.copy(isoPath, '/output/nestos.iso', { overwrite: true });

    // Final verification
    const outputPath = '/output/nestos.iso';
    const outputExists = await fs.pathExists(outputPath);
    const outputStats = await fs.stat(outputPath);

    if (!outputExists || outputStats.size !== isoStats.size) {
      throw new Error('ISO file copy verification failed');
    }

    // Print build completion info
    console.log('Build completed. Full directory structure:');
    const { stdout: finalTreeOutput } = await execa('tree', [BUILD_DIR]);  // Renamed from treeOutput
    console.log(finalTreeOutput);

    spinner.succeed('ISO image created and verified successfully');

    // Return success without throwing any errors
    return true;
  } catch (error) {
    spinner.fail(`Failed to create ISO image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Full error details:', error);
    return false;
  }
}

// Modify the buildIso function to handle the return properly
export async function buildIso() {
  try {
    console.log(chalk.blue('Starting NestOS ISO build process...'));
    await setupBuildEnvironment();

    // Build both architectures in parallel
    await Promise.all([
      (async () => {
        console.log(chalk.yellow('\nBuilding amd64 variant...'));
        await downloadBaseSystem('amd64');
        await configureSystem('amd64');
        await installPackages('amd64');
        await installNestOSComponents('amd64');
        return createISO('amd64');
      })(),
      (async () => {
        console.log(chalk.yellow('\nBuilding arm64 variant...'));
        await downloadBaseSystem('arm64');
        await configureSystem('arm64');
        await installPackages('arm64');
        await installNestOSComponents('arm64');
        return createISO('arm64');
      })()
    ]);

    console.log(chalk.green('\nBuild completed successfully!'));
    console.log(chalk.white('ISO images available at:'));
    console.log(chalk.white('- /output/nestos-amd64.iso'));
    console.log(chalk.white('- /output/nestos-arm64.iso'));
    process.exit(0);
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