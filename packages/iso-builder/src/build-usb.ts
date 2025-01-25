import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.join(__dirname, '../build');
const USB_DIR = path.join(BUILD_DIR, 'usb');

interface UsbOptions {
  device: string;
  label?: string;
  persistence?: boolean;
  persistenceSize?: number;
}

async function setupUsbEnvironment() {
  const spinner = ora('Setting up USB build environment').start();
  try {
    await fs.remove(USB_DIR);
    await fs.ensureDir(USB_DIR);
    spinner.succeed('USB build environment setup complete');
  } catch (error) {
    spinner.fail(`Failed to setup USB environment: ${error}`);
    throw error;
  }
}

async function verifyDevice(device: string) {
  const spinner = ora('Verifying USB device').start();
  try {
    const { stdout } = await execa('lsblk', ['-d', '-n', '-o', 'NAME,TYPE,RM', device]);
    const [, type, removable] = stdout.split(/\s+/);

    if (type !== 'disk' || removable !== '1') {
      throw new Error(`${device} is not a removable disk`);
    }

    spinner.succeed('USB device verified');
  } catch (error) {
    spinner.fail(`Device verification failed: ${error}`);
    throw error;
  }
}

async function createPartitions(device: string, persistence: boolean, persistenceSize: number) {
  const spinner = ora('Creating partitions').start();
  try {
    // Clear existing partition table
    await execa('sgdisk', ['-Z', device]);

    // Create EFI partition
    await execa('sgdisk', ['-n', '1:0:+512M', '-t', '1:EF00', device]);

    // Create main system partition
    if (persistence) {
      await execa('sgdisk', ['-n', '2:0:-' + persistenceSize + 'G', '-t', '2:8300', device]);
      // Create persistence partition
      await execa('sgdisk', ['-n', '3:0:0', '-t', '3:8300', device]);
    } else {
      await execa('sgdisk', ['-n', '2:0:0', '-t', '2:8300', device]);
    }

    spinner.succeed('Partitions created');
  } catch (error) {
    spinner.fail(`Failed to create partitions: ${error}`);
    throw error;
  }
}

async function formatPartitions(device: string, label: string, persistence: boolean) {
  const spinner = ora('Formatting partitions').start();
  try {
    // Format EFI partition
    await execa('mkfs.fat', ['-F', '32', '-n', 'EFI', `${device}1`]);

    // Format main system partition
    await execa('mkfs.ext4', ['-L', label || 'NestOS', `${device}2`]);

    if (persistence) {
      // Format persistence partition
      await execa('mkfs.ext4', ['-L', 'persistence', `${device}3`]);
    }

    spinner.succeed('Partitions formatted');
  } catch (error) {
    spinner.fail(`Failed to format partitions: ${error}`);
    throw error;
  }
}

async function copySystem(device: string, persistence: boolean) {
  const spinner = ora('Copying system files').start();
  try {
    const mountPoint = path.join(USB_DIR, 'mount');
    await fs.ensureDir(mountPoint);

    // Mount system partition
    await execa('mount', [`${device}2`, mountPoint]);

    // Copy ISO contents
    await execa('cp', ['-a', path.join(BUILD_DIR, 'iso', '*'), mountPoint]);

    if (persistence) {
      // Setup persistence
      const persistenceMount = path.join(USB_DIR, 'persistence');
      await fs.ensureDir(persistenceMount);
      await execa('mount', [`${device}3`, persistenceMount]);
      await fs.writeFile(
        path.join(persistenceMount, 'persistence.conf'),
        '/ union\n'
      );
      await execa('umount', [persistenceMount]);
    }

    // Unmount system partition
    await execa('umount', [mountPoint]);

    spinner.succeed('System files copied');
  } catch (error) {
    spinner.fail(`Failed to copy system files: ${error}`);
    throw error;
  }
}

async function makeBootable(device: string) {
  const spinner = ora('Making USB bootable').start();
  try {
    const efiMount = path.join(USB_DIR, 'efi');
    await fs.ensureDir(efiMount);

    // Mount EFI partition
    await execa('mount', [`${device}1`, efiMount]);

    // Install GRUB for EFI
    await execa('grub-install', [
      '--target=x86_64-efi',
      '--efi-directory=' + efiMount,
      '--boot-directory=' + path.join(efiMount, 'boot'),
      '--removable'
    ]);

    // Unmount EFI partition
    await execa('umount', [efiMount]);

    spinner.succeed('USB made bootable');
  } catch (error) {
    spinner.fail(`Failed to make USB bootable: ${error}`);
    throw error;
  }
}

export async function buildUsb(options: UsbOptions) {
  console.log(chalk.blue('Starting NestOS USB build process...'));

  const { device, label, persistence = false, persistenceSize = 4 } = options;

  try {
    await setupUsbEnvironment();
    await verifyDevice(device);
    await createPartitions(device, persistence, persistenceSize);
    await formatPartitions(device, label || 'NestOS', persistence);
    await copySystem(device, persistence);
    await makeBootable(device);

    console.log(chalk.green('\nUSB build completed successfully!'));
    console.log(chalk.white(`Device ${device} is now bootable with NestOS`));

    if (persistence) {
      console.log(chalk.white(`Persistence partition of ${persistenceSize}GB created`));
    }
  } catch (error) {
    console.error(chalk.red('\nUSB build failed:'), error);
    process.exit(1);
  }
}