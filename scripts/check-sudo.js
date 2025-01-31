const { spawnSync } = require('child_process');

if (process.platform !== 'win32' && process.getuid() !== 0 && !process.env.DOCKER) {
    const result = spawnSync('sudo', ['-v'], { stdio: 'inherit' });
    if (result.status !== 0) {
        console.error('Failed to obtain sudo privileges');
        process.exit(1);
    }
}