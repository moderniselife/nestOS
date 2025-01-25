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
    await fs.remove(BUILD_DIR);
    await fs.ensureDir(ISO_DIR);
    await fs.ensureDir(CHROOT_DIR);
    spinner.succeed('Build environment setup complete');
  } catch (error) {
    spinner.fail(`Failed to setup build environment: ${error}`);
    throw error;
  }
}

async function downloadBaseSystem() {
  const spinner = ora('Downloading Debian base system').start();
  try {
    await execa('debootstrap', [
      '--arch=amd64',
      '--variant=minbase',
      'bookworm',
      CHROOT_DIR,
      'http://deb.debian.org/debian'
    ]);
    spinner.succeed('Base system downloaded');
  } catch (error) {
    spinner.fail(`Failed to download base system: ${error}`);
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
    spinner.fail(`Failed to configure system: ${error}`);
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
    spinner.fail(`Failed to install packages: ${error}`);
    throw error;
  }
}

async function installNestOSComponents() {
  const spinner = ora('Installing NestOS components').start();
  try {
    // Copy built system service
    await fs.copy(
      path.join(__dirname, '../../system-service/dist'),
      path.join(CHROOT_DIR, 'opt/nestos/system-service')
    );

    // Copy built control panel
    await fs.copy(
      path.join(__dirname, '../../control-panel/dist'),
      path.join(CHROOT_DIR, 'opt/nestos/control-panel')
    );

    // Copy systemd service files
    await fs.copy(
      path.join(__dirname, '../templates/services'),
      path.join(CHROOT_DIR, 'etc/systemd/system')
    );

    // Enable services
    await execa('chroot', [
      CHROOT_DIR,
      'systemctl', 'enable',
      'nestos-system.service',
      'nestos-control-panel.service'
    ]);

    spinner.succeed('NestOS components installed');
  } catch (error) {
    spinner.fail(`Failed to install NestOS components: ${error}`);
    throw error;
  }
}

async function createISO() {
  const spinner = ora('Creating ISO image').start();
  try {
    // Generate initramfs
    await execa('chroot', [
      CHROOT_DIR,
      'update-initramfs', '-u'
    ]);

    // Copy kernel and initrd to ISO directory
    await fs.ensureDir(path.join(ISO_DIR, 'boot/grub'));
    await fs.copy(
      path.join(CHROOT_DIR, 'boot/vmlinuz-*'),
      path.join(ISO_DIR, 'boot/vmlinuz')
    );
    await fs.copy(
      path.join(CHROOT_DIR, 'boot/initrd.img-*'),
      path.join(ISO_DIR, 'boot/initrd.img')
    );

    // Create GRUB configuration
    await fs.writeFile(
      path.join(ISO_DIR, 'boot/grub/grub.cfg'),
      `
set timeout=5
set default=0

menuentry "NestOS" {
  linux /boot/vmlinuz root=/dev/ram0 quiet
  initrd /boot/initrd.img
}
`
    );

    // Create squashfs of the system
    await execa('mksquashfs', [
      CHROOT_DIR,
      path.join(ISO_DIR, 'live/filesystem.squashfs'),
      '-comp', 'xz'
    ]);

    // Create ISO
    await execa('grub-mkrescue', [
      '-o', path.join(BUILD_DIR, 'nestos.iso'),
      ISO_DIR,
      '--verbose'
    ]);

    spinner.succeed('ISO image created successfully');
    
    // Verify ISO was created
    const isoExists = await fs.pathExists(path.join(BUILD_DIR, 'nestos.iso'));
    if (!isoExists) {
      throw new Error('ISO file was not created');
    }
  } catch (error) {
    spinner.fail(`Failed to create ISO image: ${error}`);
    console.error('Full error:', error);
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