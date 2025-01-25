import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { execa } from 'execa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILD_DIR = path.join(__dirname, '../build');
const TEMP_DIRS = [
  path.join(BUILD_DIR, 'iso'),
  path.join(BUILD_DIR, 'chroot'),
  path.join(BUILD_DIR, 'usb')
];

async function cleanBuildDirectories() {
  const spinner = ora('Cleaning build directories').start();
  
  try {
    // Remove build directory and all contents
    await fs.remove(BUILD_DIR);
    
    // Recreate empty build directory
    await fs.ensureDir(BUILD_DIR);
    
    spinner.succeed('Build directories cleaned');
  } catch (error) {
    spinner.fail(`Failed to clean build directories: ${error}`);
    throw error;
  }
}

async function cleanTempFiles() {
  const spinner = ora('Cleaning temporary files').start();
  
  try {
    // Clean any mounted filesystems
    for (const dir of TEMP_DIRS) {
      try {
        await fs.access(dir);
        // If directory exists, try to unmount it (ignore errors)
        await execa('umount', ['-f', dir]).catch(() => {});
      } catch {
        // Directory doesn't exist, skip
        continue;
      }
    }
    
    spinner.succeed('Temporary files cleaned');
  } catch (error) {
    spinner.fail(`Failed to clean temporary files: ${error}`);
    throw error;
  }
}

export async function main() {
  console.log(chalk.blue('Starting cleanup process...'));
  
  try {
    await cleanTempFiles();
    await cleanBuildDirectories();
    
    console.log(chalk.green('\nCleanup completed successfully!'));
  } catch (error) {
    console.error(chalk.red('\nCleanup failed:'), error);
    process.exit(1);
  }
}

// When run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}