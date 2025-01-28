import { existsSync } from 'fs';

export const checkPrivileges = (): void => {
    const isRoot = process.getuid?.() === 0;
    const inContainer = existsSync('/.dockerenv');

    if (!isRoot && !inContainer) {
        console.error('\x1b[31mError: NestOS requires root privileges or must be run in a Docker container.\x1b[0m');
        console.error('\x1b[33mPlease run with sudo or use docker-compose.\x1b[0m');
        process.exit(1);
    }
};