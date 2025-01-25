#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { buildUsb } from './build-usb.js';
import { buildIso } from './build-iso.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('nasos-builder')
  .description('NASOS ISO and USB image builder')
  .version(pkg.version);

program
  .command('iso')
  .description('Build NASOS ISO image')
  .option('-o, --output <path>', 'Output path for the ISO file')
  .action(async (options) => {
    try {
      console.log(chalk.blue('Starting ISO build process...'));
      await buildIso();
      if (options.output) {
        const defaultPath = path.join(__dirname, '../build/nasos.iso');
        await fs.copy(defaultPath, options.output);
        console.log(chalk.green(`ISO image copied to: ${options.output}`));
      }
    } catch (error) {
      console.error(chalk.red('ISO build failed:'), error);
      process.exit(1);
    }
  });

program
  .command('usb')
  .description('Create bootable USB drive')
  .requiredOption('-d, --device <path>', 'USB device path (e.g., /dev/sdb)')
  .option('-l, --label <name>', 'USB drive label', 'NASOS')
  .option('-p, --persistence', 'Enable persistence', false)
  .option('-s, --persistence-size <size>', 'Persistence partition size in GB', '4')
  .action(async (options) => {
    try {
      await buildUsb({
        device: options.device,
        label: options.label,
        persistence: options.persistence,
        persistenceSize: parseInt(options.persistenceSize)
      });
    } catch (error) {
      console.error(chalk.red('USB build failed:'), error);
      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean build artifacts')
  .action(async () => {
    try {
      const { main: clean } = await import('./clean.js');
      await clean();
    } catch (error) {
      console.error(chalk.red('Cleanup failed:'), error);
      process.exit(1);
    }
  });

// Add some examples
program.addHelpText('after', `
Examples:
  $ nasos-builder iso                           # Build ISO image
  $ nasos-builder iso -o /path/to/nasos.iso     # Build ISO and save to specific location
  $ nasos-builder usb -d /dev/sdb               # Create bootable USB
  $ nasos-builder usb -d /dev/sdb -p            # Create bootable USB with persistence
  $ nasos-builder clean                         # Clean build artifacts
`);

// Parse command line arguments
program.parse();

// If no arguments provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}