import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import Docker from 'dockerode';
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

const executeDockerCommand = async (command: string, pluginId: string, pluginDir: string): Promise<void> => {
  // Common Docker command patterns
  const pullMatch = command.match(/docker\s+pull\s+([^\s]+)/);
  const runMatch = command.match(/docker\s+run\s+(.*)/);
  const composeMatch = command.match(/docker[\s-]compose\s+(up|down|restart|stop)\s*(.*)/);

  if (pullMatch) {
    const image = pullMatch[1];
    await new Promise((resolve, reject) => {
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) reject(err);
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          resolve(undefined);
        });
      });
    });
  } else if (runMatch) {
    const args = runMatch[1];
    const nameMatch = args.match(/--name\s+([^\s]+)/);
    const imageMatch = args.match(/([^\s]+)$/);

    if (nameMatch && imageMatch) {
      const containerConfig: Docker.ContainerCreateOptions = {
        Image: imageMatch[1],
        name: nameMatch[1],
      };

      const container = await docker.createContainer(containerConfig);
      await container.start();
    }
  } else if (composeMatch) {
    const [, action] = composeMatch;

    // Read docker-compose.yml
    const composeFile = await fs.readFile(path.join(pluginDir, 'docker-compose.yml'), 'utf-8');
    const composeConfig = yaml.parse(composeFile);

    let envVars: { [key: string]: string } = {};
    try {
      const envFile = await fs.readFile(path.join(pluginDir, '.env'), 'utf-8');
      envVars = envFile.split('\n').reduce((acc: any, line) => {
        const [key, value] = line.split('=');
        if (key && value) acc[key.trim()] = value.trim();
        return acc;
      }, {});

      // Read and merge config.json if it exists
      const configPath = path.join(process.cwd(), 'plugins', pluginId, 'config.json');
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        // Merge config into envVars, config takes precedence
        envVars = { ...envVars, ...config };
      } catch (error) {
        // config.json doesn't exist or can't be read, continue with just .env vars
      }
    } catch (error) {
      // .env file doesn't exist or can't be read
    }

    console.log('Env Vars: ', envVars);

    // Get existing containers
    const containers = await docker.listContainers({ all: true });
    const projectName = pluginId;  // Use pluginId as project name for better identification

    switch (action) {
      case 'up':
        // Create and start containers for each service
        for (const [serviceName, serviceConfig] of Object.entries(composeConfig.services)) {
          const config = serviceConfig as any;
          const containerName = `${projectName}_${serviceName}`;

          // Check if container already exists
          const existingContainer = containers.find(c =>
            c.Names.includes(`/${containerName}`)
          );

          if (existingContainer) {
            const container = docker.getContainer(existingContainer.Id);
            if (existingContainer.State !== 'running') {
              await container.start();
            }
            continue;
          }

          // Process environment variables with defaults
          const processEnvValue = (value: string): string => {
            const matches = value.match(/\${([^}]+)}/g);
            if (!matches) return value;

            return matches.reduce((acc, match) => {
              const envVar = match.slice(2, -1);
              const [varName, defaultValue] = envVar.split(':-');
              const envValue = envVars[varName] || defaultValue || '';
              return acc.replace(match, envValue);
            }, value);
          };

          // Process environment array
          const envArray = config.environment?.map((env: string) => {
            if (typeof env === 'string') {
              const [key, value] = env.split('=');
              return `${key}=${processEnvValue(value)}`;
            }
            return env;
          }) || [];

          // Process ports with environment variables
          const portBindings: any = {};
          if (config.ports) {
            config.ports.forEach((p: string) => {
              const portMapping = processEnvValue(p);
              const [host, container] = portMapping.replace(/['"]/g, '').split(':');
              const containerPort = `${container}/tcp`;
              portBindings[containerPort] = [{ HostPort: host }];
            });
          }

          // Process volumes with environment variables
          const volumeBindings = config.volumes?.map((v: string) => {
            const volumeMapping = processEnvValue(v);
            const [host, container] = volumeMapping.split(':');
            return `${path.resolve(pluginDir, host)}:${container}`;
          }) || [];

          const containerConfig: Docker.ContainerCreateOptions = {
            Image: config.image,
            name: containerName,
            Env: envArray,
            HostConfig: {
              Binds: volumeBindings,
              PortBindings: portBindings,
              RestartPolicy: { Name: config.restart || 'no' }
            }
          };

          // Pull image if needed
          await new Promise((resolve, reject) => {
            docker.pull(config.image, (err: Error | null, stream: NodeJS.ReadableStream) => {
              if (err) reject(err);
              docker.modem.followProgress(stream, (err: Error | null) => {
                if (err) reject(err);
                resolve(undefined);
              });
            });
          });

          // Create and start container
          const container = await docker.createContainer(containerConfig);
          await container.start();
        }
        break;

      case 'down':
      case 'stop':
        // Stop and optionally remove containers
        for (const container of containers) {
          if (container.Labels['com.docker.compose.project'] === projectName) {
            const containerObj = docker.getContainer(container.Id);
            await containerObj.stop();
            if (action === 'down') {
              await containerObj.remove();
            }
          }
        }
        break;

      case 'restart':
        // Restart containers
        for (const container of containers) {
          if (container.Labels['com.docker.compose.project'] === projectName) {
            const containerObj = docker.getContainer(container.Id);
            await containerObj.restart();
          }
        }
        break;
    }
  }
};

interface UpdateSettings {
  autoUpdate: boolean;
  schedule: 'hourly' | 'daily' | null;
}

const updateSettingsSchema = z.object({
  autoUpdate: z.boolean(),
  schedule: z.enum(['hourly', 'daily']).nullable()
});

// interface BackupSettings {
//   enabled: boolean;
//   location: string;
//   retention: number;
// }

const backupSettingsSchema = z.object({
  enabled: z.boolean(),
  location: z.string(),
  retention: z.number().min(1).max(365)
});


const execAsync = promisify(exec);

const logsSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        logs: { type: 'string' }
      },
      required: ['logs']
    }
  }
};

const performanceTestSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        cpu: {
          type: 'object',
          properties: {
            singleCore: { type: 'number' },
            multiCore: { type: 'number' },
            loadAverage: {
              type: 'array',
              items: { type: 'number' }
            }
          },
          required: ['singleCore', 'multiCore', 'loadAverage']
        },
        memory: {
          type: 'object',
          properties: {
            readSpeed: { type: 'number' },
            writeSpeed: { type: 'number' },
            latency: { type: 'number' }
          },
          required: ['readSpeed', 'writeSpeed', 'latency']
        },
        disk: {
          type: 'object',
          properties: {
            readSpeed: { type: 'number' },
            writeSpeed: { type: 'number' },
            iops: { type: 'number' }
          },
          required: ['readSpeed', 'writeSpeed', 'iops']
        },
        nestos: {
          type: 'object',
          properties: {
            version: { type: 'string' },
            build: { type: 'string' },
            commit: { type: 'string' },
            branch: { type: 'string' },
            docker: { type: 'string' },
            dockerCompose: { type: 'string' }
          },
        }
      },
      required: ['cpu', 'memory', 'disk']
    }
  }
};

const updateApplySchema = {
  body: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['system', 'nestos', 'all'] }
    },
    required: ['target']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      }
    }
  }
};

const systemInfoSchema = z.object({
  detailed: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional().default(false))
});

const systemSettingsSchema = {
  body: {
    type: 'object',
    properties: {
      hostname: { type: 'string' },
      timezone: { type: 'string' }
    },
    required: ['hostname', 'timezone']
  },
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        message: { type: 'string' }
      }
    }
  }
};

// const pluginsSchema = {
//   response: {
//     200: {
//       type: 'array',
//       items: {
//         type: 'object',
//         properties: {
//           id: { type: 'string' },
//           name: { type: 'string' },
//           description: { type: 'string' },
//           version: { type: 'string' },
//           author: { type: 'string' },
//           repository: { type: 'string' },
//           icon: { type: 'string' },
//           installed: { type: 'boolean' },
//           category: { type: 'string' },
//           tags: {
//             type: 'array',
//             items: { type: 'string' }
//           }
//         }
//       }
//     }
//   }
// };


// Add near the top with other imports and helpers
const runPrivilegedCommand = async (command: string): Promise<{ stdout: string; stderr: string }> => {
  // Check if running in container or as root
  const isRoot = process.getuid?.() === 0;
  const inContainer = fs.access('/.dockerenv').then(() => true).catch(() => false);

  if (isRoot || await inContainer) {
    // In container or root, run directly
    return execAsync(command);
  }

  // Check for SUDO_PASSWORD environment variable
  const sudoPass = process.env.SUDO_PASSWORD;
  if (sudoPass) {
    // Use sudo with password from env
    return execAsync(`echo "${sudoPass}" | sudo -S ${command}`);
  }

  // Try without password (if sudo NOPASSWD is configured)
  return execAsync(`sudo ${command}`);
};

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  // Get system information
  fastify.get('/info', async (request) => {
    const { detailed } = systemInfoSchema.parse(request.query);

    const [cpu, mem, os, system] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.system()
    ]);

    // Calculate uptime from process if not available from OS
    const systemUptime = os.uptime ?? Math.floor(process.uptime());

    // Add this helper function at the top of the file with other imports
    const getNestOSInfo = async () => {
      // Get git information
      const getGitInfo = async () => {
        try {
          const [commitHash, branch] = await Promise.all([
            execAsync('git rev-parse HEAD').then(res => res.stdout.trim()),
            execAsync('git rev-parse --abbrev-ref HEAD').then(res => res.stdout.trim())
          ]);
          return { commitHash, branch };
        } catch (error) {
          console.error('Error getting git info:', error);
          return { commitHash: '', branch: '' };
        }
      };

      // Get docker versions
      const getDockerInfo = async () => {
        try {
          const dockerVersion = await execAsync('docker --version')
            .then(res => res.stdout.match(/Docker version ([0-9.]+)/)?.[1] || '')
            .catch(() => '');

          const dockerComposeVersion = await execAsync('docker compose version')
            .then(res => res.stdout.match(/Docker Compose version ([0-9.]+)/)?.[1] || '')
            .catch(() => '');

          return { dockerVersion, dockerComposeVersion };
        } catch (error) {
          console.error('Error getting docker info:', error);
          return { dockerVersion: '', dockerComposeVersion: '' };
        }
      };

      try {
        // Get package.json version
        const packageJsonPath = path.resolve(process.cwd(), 'package.json');
        const packageJson = await fs.readFile(packageJsonPath, 'utf-8')
          .then(data => JSON.parse(data))
          .catch(() => ({ version: '0.0.0' }));

        // Get build number (using timestamp if not available)
        const buildNumber = process.env.BUILD_NUMBER || Math.floor(Date.now() / 1000).toString();

        // Get git and docker info concurrently
        const [gitInfo, dockerInfo] = await Promise.all([
          getGitInfo(),
          getDockerInfo()
        ]);

        return {
          version: packageJson.version,
          build: buildNumber,
          commit: gitInfo.commitHash,
          branch: gitInfo.branch,
          docker: dockerInfo.dockerVersion,
          dockerCompose: dockerInfo.dockerComposeVersion
        };
      } catch (error) {
        console.error('Error getting NestOS info:', error);
        // Return default values if anything fails
        return {
          version: process.env.npm_package_version || '0.0.0',
          build: Math.floor(Date.now() / 1000).toString(),
          commit: '',
          branch: '',
          docker: '',
          dockerCompose: ''
        };
      }
    };

    const nestosInfo = await getNestOSInfo();

    const basicInfo = {
      hostname: os.hostname,
      platform: os.platform,
      distro: os.distro,
      release: os.release,
      arch: os.arch,
      uptime: systemUptime,
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores
      },
      memory: {
        total: mem.total,
        free: mem.free,
        used: mem.used,
        active: mem.active,
        available: mem.available
      },
      nestos: nestosInfo
    };

    if (!detailed) {
      return basicInfo;
    }

    const [load, services, dockerInfo] = await Promise.all([
      si.currentLoad(),
      si.services('*'),
      si.dockerInfo()
    ]);

    return {
      ...basicInfo,
      system: {
        manufacturer: system.manufacturer,
        model: system.model,
        serial: system.serial
      },
      load: {
        avgLoad: load.avgLoad ?? load.currentLoad,
        currentLoad: load.currentLoad,
        cpuLoad: load.cpus.map(cpu => cpu.load)
      },
      services: services.map(service => ({
        name: service.name,
        running: service.running,
        startmode: service.startmode
      })),
      docker: {
        containers: {
          total: dockerInfo.containers ?? 0,
          running: dockerInfo.containersRunning ?? 0,
          paused: dockerInfo.containersPaused ?? 0,
          stopped: dockerInfo.containersStopped ?? 0
        },
        images: dockerInfo.images ?? 0
      }
    };
  });

  // Get system logs
  fastify.get('/logs', {
    schema: logsSchema
  }, async () => {
    try {
      // Try journalctl first (Linux)
      try {
        const { stdout } = await execAsync('journalctl -n 1000 --no-pager');
        return { logs: stdout };
      } catch {
        // Fall back to system.log (macOS)
        try {
          const { stdout } = await execAsync('tail -n 1000 /var/log/system.log');
          return { logs: stdout };
        } catch {
          // If both fail, return empty logs
          return { logs: 'No system logs available' };
        }
      }
    } catch (error) {
      throw new Error(`Failed to get system logs: ${error}`);
    }
  });

  // Performance test
  fastify.post('/performance', { schema: performanceTestSchema }, async () => {
    try {
      // CPU Performance Test
      const cpuTest = await Promise.all([
        // Single core test (using one worker)
        new Promise<number>((resolve) => {
          const startTime = process.hrtime.bigint();
          for (let i = 0; i < 1000000; i++) {
            Math.sqrt(i);
          }
          const endTime = process.hrtime.bigint();
          resolve(Number(endTime - startTime) / 1e6); // Convert to milliseconds
        }),
        // Multi core test
        si.currentLoad(),
        // Load average
        si.currentLoad().then(load => load.avgLoad)
      ]);

      // Memory Performance Test using Node.js buffer operations
      const memoryTest = await Promise.all([
        // Memory read speed test
        new Promise<number>((resolve) => {
          const size = 1024 * 1024 * 100; // 100MB
          const buffer = Buffer.alloc(size);
          const iterations = 10;
          const startTime = process.hrtime.bigint();

          for (let i = 0; i < iterations; i++) {
            const newBuffer = Buffer.alloc(size);
            buffer.copy(newBuffer);
          }

          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1e9; // seconds
          const throughput = (size * iterations) / (1024 * 1024 * duration); // MB/s
          resolve(throughput);
        }),
        // Memory write speed test
        new Promise<number>((resolve) => {
          const size = 1024 * 1024 * 100; // 100MB
          const iterations = 10;
          const startTime = process.hrtime.bigint();

          for (let i = 0; i < iterations; i++) {
            const buffer = Buffer.alloc(size);
            buffer.fill(Math.random());
          }

          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1e9; // seconds
          const throughput = (size * iterations) / (1024 * 1024 * duration); // MB/s
          resolve(throughput);
        }),
        // Memory latency test
        new Promise<number>((resolve) => {
          const startTime = process.hrtime.bigint();
          const buffer = Buffer.alloc(1024 * 1024 * 100); // 100MB
          buffer.fill(0);
          const endTime = process.hrtime.bigint();
          resolve(Number(endTime - startTime) / 1e6); // milliseconds
        })
      ]);

      // Disk Performance Test
      const { stdout: osType } = await execAsync('uname');
      const isLinux = osType.trim() === 'Linux';
      const hasFio = await execAsync('which fio').catch(() => ({ stdout: '' }));

      let diskResults: { readSpeed: number; writeSpeed: number; iops: number };

      if (isLinux && hasFio.stdout.trim()) {
        // Linux with fio
        const diskTest = await Promise.all([
          execAsync('dd if=/dev/zero of=/tmp/testfile bs=1M count=1000 conv=fdatasync'),
          execAsync('dd if=/tmp/testfile of=/dev/null bs=1M count=1000'),
          execAsync('fio --name=randread --ioengine=libaio --direct=1 --bs=4k --iodepth=32 --size=1G --rw=randread --runtime=10 --filename=/tmp/testfile --output-format=json')
        ]);

        diskResults = {
          readSpeed: parseFloat(diskTest[1].stdout.match(/([0-9.]+) GB\/s/)?.[1] || '0') * 1024,
          writeSpeed: parseFloat(diskTest[0].stdout.match(/([0-9.]+) GB\/s/)?.[1] || '0') * 1024,
          iops: JSON.parse(diskTest[2].stdout).jobs[0].read.iops
        };
      } else {
        // macOS or Linux without fio
        console.log('Running macOS disk tests...');

        // Helper function to parse dd output
        const parseSpeed = (output: string): number => {
          console.log('Raw output:', output);

          // Try to match bytes/sec from parentheses
          const bytesPerSecMatch = output.match(/\((\d+)\s+bytes\/sec\)/);
          if (bytesPerSecMatch) {
            const bytesPerSec = parseInt(bytesPerSecMatch[1], 10);
            const gbPerSec = bytesPerSec / (1024 * 1024 * 1024);
            console.log('Parsed speed from bytes/sec:', { bytesPerSec, gbPerSec });
            return gbPerSec;
          }

          // Try to match bytes and time
          const bytesMatch = output.match(/(\d+)\s+bytes\s+transferred\s+in\s+([\d.]+)\s+secs/);
          if (bytesMatch) {
            const bytes = parseInt(bytesMatch[1], 10);
            const seconds = parseFloat(bytesMatch[2]);
            const gbPerSec = (bytes / (1024 * 1024 * 1024)) / seconds;
            console.log('Parsed speed from bytes and time:', { bytes, seconds, gbPerSec });
            return gbPerSec;
          }

          console.log('Could not parse speed from output');
          return 0;
        };

        // Helper function to run dd command
        const runDdTest = async (cmd: string): Promise<string> => {
          try {
            const { stdout, stderr } = await execAsync(`/bin/dd ${cmd} 2>&1`);
            return stderr || stdout;
          } catch (error) {
            // On macOS, dd outputs to stderr even on success
            if (error && typeof error === 'object' && ('stderr' in error || 'stdout' in error)) {
              const execError = error as { stderr?: string; stdout?: string };
              return execError.stderr || execError.stdout || '';
            }
            return '';
          }
        };

        // Create test file
        await runDdTest('if=/dev/zero of=/tmp/testfile bs=1m count=1024');

        // Run write tests
        const writeResults = [];
        for (let i = 0; i < 3; i++) {
          console.log(`Running write test ${i + 1}...`);
          const output = await runDdTest('if=/dev/zero of=/tmp/testfile bs=1m count=1024');
          const speed = parseSpeed(output);
          console.log(`Write test ${i + 1} speed:`, speed);
          writeResults.push(speed);
        }

        // Run read tests
        const readResults = [];
        for (let i = 0; i < 3; i++) {
          console.log(`Running read test ${i + 1}...`);
          const output = await runDdTest('if=/tmp/testfile of=/dev/null bs=1m count=1024');
          const speed = parseSpeed(output);
          console.log(`Read test ${i + 1} speed:`, speed);
          readResults.push(speed);
        }

        // Run IOPS tests
        const iopsResults = [];
        for (let i = 0; i < 5; i++) {
          console.log(`Running IOPS test ${i + 1}...`);
          const output = await runDdTest('if=/tmp/testfile of=/dev/null bs=4k count=1000');
          const speed = parseSpeed(output);
          console.log(`IOPS test ${i + 1} speed:`, speed);
          const iops = Math.round((speed * 1024 * 1024) / 4); // Convert GB/s to 4K IOPS
          console.log(`IOPS test ${i + 1} IOPS:`, iops);
          iopsResults.push(iops);
        }

        // Calculate average speeds
        const writeSpeed = writeResults.reduce((a, b) => a + b, 0) / writeResults.length;
        const readSpeed = readResults.reduce((a, b) => a + b, 0) / readResults.length;
        const iops = Math.round(iopsResults.reduce((a, b) => a + b, 0) / iopsResults.length);

        console.log('Final results:', { writeSpeed, readSpeed, iops });

        diskResults = { writeSpeed, readSpeed, iops };
      }

      // Clean up test files
      await execAsync('rm -f /tmp/testfile /tmp/test');

      return {
        cpu: {
          singleCore: cpuTest[0],
          multiCore: cpuTest[1].currentLoad,
          loadAverage: Array.isArray(cpuTest[2]) ? cpuTest[2] : [cpuTest[2]]
        },
        memory: {
          readSpeed: memoryTest[0],
          writeSpeed: memoryTest[1],
          latency: memoryTest[2]
        },
        disk: diskResults
      };
    } catch (error) {
      throw new Error(`Performance test failed: ${error}`);
    }
  });

  // Reboot system
  fastify.post('/reboot', async () => {
    try {
      await execAsync('shutdown -r now');
      return { status: 'rebooting' };
    } catch (error) {
      throw new Error(`Failed to initiate reboot: ${error}`);
    }
  });

  // Shutdown system
  fastify.post('/shutdown', async () => {
    try {
      await execAsync('shutdown -h now');
      return { status: 'shutting_down' };
    } catch (error) {
      throw new Error(`Failed to initiate shutdown: ${error}`);
    }
  });

  const checkNestOSUpdates = async () => {
    try {
      // Read local package.json
      const packageJsonPath = path.resolve(process.cwd(), 'package.json');
      const localPackageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const currentVersion = localPackageJson.version;

      // Fetch remote package.json
      const remotePackageJson = await axios.get('https://raw.githubusercontent.com/moderniselife/nestos/refs/heads/main/package.json')
        .then(res => res.data);
      const latestVersion = remotePackageJson.version;

      // Get commit details if there's an update
      let updateDetails = null;
      if (currentVersion !== latestVersion) {
        const { stdout: commitLog } = await execAsync('git fetch origin main && git log --pretty=format:"%h - %s" HEAD..origin/main');
        updateDetails = commitLog.split('\n').map(line => {
          const [hash, message] = line.split(' - ');
          return { hash, message };
        });
      }

      return {
        currentVersion,
        latestVersion,
        updateAvailable: currentVersion !== latestVersion,
        updateDetails
      };
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error}`);
    }
  };

  const checkSystemUpdates = async () => {
    try {
      const { platform } = process;

      if (platform === 'darwin') {
        // macOS code remains the same
        const { stdout: updateCheck } = await execAsync('softwareupdate -l');
        const hasUpdates = !updateCheck.includes('No new software available');

        return {
          updateAvailable: hasUpdates,
          currentVersion: 'macOS',
          latestVersion: hasUpdates ? 'Updates available' : 'Up to date',
          updateDetails: hasUpdates ? [{
            hash: 'system',
            message: updateCheck.trim()
          }] : null
        };
      } else if (platform === 'linux') {
        // Get current system version
        const { stdout: osRelease } = await execAsync('cat /etc/os-release');
        const currentVersion = osRelease
          .split('\n')
          .find(line => line.startsWith('VERSION_ID='))
          ?.split('=')[1]
          .replace(/"/g, '') || '';

        // Get available updates
        await execAsync('apt-get update');
        const { stdout: upgradeCheck } = await execAsync('apt-get upgrade -s');

        // Parse upgrade information
        const updates = upgradeCheck
          .split('\n')
          .filter(line => line.startsWith('Inst '))
          .map(line => {
            const parts = line.split(' ');
            return {
              package: parts[1],
              version: parts[2] || '',
              description: parts.slice(3).join(' ').replace(/[[\]]/g, '')
            };
          });

        // Get security updates count
        const securityUpdates = updates.filter(update =>
          update.description.toLowerCase().includes('security')
        );

        return {
          updateAvailable: updates.length > 0,
          currentVersion: `Debian ${currentVersion}`,
          latestVersion: updates.length > 0
            ? `${updates.length} updates available (${securityUpdates.length} security updates)`
            : `Debian ${currentVersion}`,
          updateDetails: updates.map(update => ({
            hash: update.package,
            message: `${update.package} (${update.version}) - ${update.description}`
          }))
        };
      }

      throw new Error(`Unsupported platform: ${platform}`);
    } catch (error) {
      throw new Error(`Failed to check for system updates: ${error}`);
    }
  };

  // Check for System and NestOS updates
  fastify.get('/updates/check', async () => {
    try {
      // Check for system updates
      const systemUpdates = await checkSystemUpdates();
      // Check for NestOS updates
      const nestosUpdates = await checkNestOSUpdates();

      const response = {
        system: {
          updateAvailable: systemUpdates.updateAvailable,
          currentVersion: systemUpdates.currentVersion,
          latestVersion: systemUpdates.latestVersion,
          updateDetails: systemUpdates.updateDetails
        },
        nestos: {
          updateAvailable: nestosUpdates.updateAvailable,
          currentVersion: nestosUpdates.currentVersion,
          latestVersion: nestosUpdates.latestVersion,
          updateDetails: nestosUpdates.updateDetails
        }
      };

      return response;
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error}`);
    }
  });

  // Update system or NestOS
  fastify.post('/updates/apply', { schema: updateApplySchema }, async (request) => {
    try {
      const { target } = request.body as { target: 'system' | 'nestos' | 'all' };

      if (target === 'system' || target === 'all') {
        const { platform } = process;
        if (platform === 'darwin') {
          await execAsync('softwareupdate -i -a');
        } else if (platform === 'linux') {
          await execAsync('apt-get update');
          await execAsync('DEBIAN_FRONTEND=noninteractive apt-get upgrade -y');
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }
      }

      if (target === 'nestos' || target === 'all') {
        // Pull latest changes
        await execAsync('git pull origin main');
        // Rebuild
        await execAsync('npm run build');
        // Restart services
        await execAsync('systemctl restart nestos-system nestos-control-panel');
      }

      return {
        status: 'updated',
        message: `Successfully updated ${target === 'all' ? 'system and NestOS' : target}`
      };
    } catch (error) {
      throw new Error(`Update failed: ${error}`);
    }
  });

  // Get update settings
  fastify.get('/updates/settings', async () => {
    try {
      const settings: UpdateSettings = {
        autoUpdate: false,
        schedule: null
      };

      // Try to read existing settings
      try {
        const { stdout } = await execAsync('crontab -l');
        const hourlyMatch = stdout.match(/0 \* \* \* \* cd .* && git pull/);
        const dailyMatch = stdout.match(/0 0 \* \* \* cd .* && git pull/);

        if (hourlyMatch || dailyMatch) {
          settings.autoUpdate = true;
          settings.schedule = hourlyMatch ? 'hourly' : 'daily';
        }
      } catch {
        // No crontab exists yet
      }

      return settings;
    } catch (error) {
      throw new Error(`Failed to get update settings: ${error}`);
    }
  });

  // Update settings
  fastify.post('/updates/settings', async (request) => {
    const body = updateSettingsSchema.parse(request.body);

    try {
      // Read existing crontab
      let currentCrontab = '';
      try {
        const { stdout } = await execAsync('crontab -l');
        currentCrontab = stdout;
      } catch {
        // No crontab exists yet
      }

      // Remove any existing auto-update entries
      currentCrontab = currentCrontab
        .split('\n')
        .filter(line => !line.includes('git pull'))
        .join('\n');

      if (body.autoUpdate) {
        // Add new auto-update entry based on schedule
        const schedule = body.schedule || 'hourly';
        const cronExpression = schedule === 'hourly' ? '0 * * * *' : '0 0 * * *';
        currentCrontab += `\n${cronExpression} cd ${process.cwd()} && git pull origin main && npm run build && systemctl restart nestos-system nestos-control-panel`;
      }

      // Write new crontab
      await execAsync(`echo "${currentCrontab.trim()}" | crontab -`);

      return { status: 'success' };
    } catch (error) {
      throw new Error(`Failed to update settings: ${error}`);
    }
  });

  // Get available timezones
  fastify.get('/timezones', async () => {
    try {
      // Use Intl API to get all timezone names
      const timezones = Intl.supportedValuesOf('timeZone');
      return timezones;
    } catch (error) {
      // Fallback to a basic list of common timezones if Intl API fails
      return [
        'UTC',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney',
        'Pacific/Auckland'
      ];
    }
  });

  // Update system settings
  fastify.post('/settings', { schema: systemSettingsSchema }, async (request) => {
    try {
      const { hostname, timezone } = request.body as { hostname: string; timezone: string };
      const { platform } = process;
      const errors: string[] = [];

      // Update hostname
      try {
        if (platform === 'win32') {
          // Windows uses PowerShell directly
          await execAsync(`powershell -Command "Rename-Computer -NewName '${hostname}' -Force"`);
        } else {
          // Use runPrivilegedCommand for Unix-like systems
          await runPrivilegedCommand(
            platform === 'darwin'
              ? `scutil --set HostName ${hostname} && scutil --set LocalHostName ${hostname} && scutil --set ComputerName ${hostname}`
              : `hostnamectl set-hostname ${hostname}`
          );
        }
      } catch (err) {
        errors.push(`Hostname update failed: ${err}`);
      }

      // Update timezone
      try {
        if (platform === 'win32') {
          // Windows uses tzutil directly
          await execAsync(`tzutil /s "${timezone}"`);
        } else {
          // Use runPrivilegedCommand for Unix-like systems
          await runPrivilegedCommand(
            platform === 'darwin'
              ? `systemsetup -settimezone ${timezone}`
              : `timedatectl set-timezone ${timezone}`
          );
        }
      } catch (err) {
        errors.push(`Timezone update failed: ${err}`);
      }

      if (errors.length > 0) {
        return {
          status: 'partial',
          message: `Some settings failed to update: ${errors.join('; ')}`
        };
      }

      return {
        status: 'success',
        message: 'System settings updated successfully'
      };
    } catch (error) {
      throw new Error(`Failed to update system settings: ${error}`);
    }
  });

  // Add these routes before the final export
  // Get backup settings
  fastify.get('/backup/settings', async () => {
    try {
      const settingsPath = path.join(process.cwd(), 'backup-settings.json');
      try {
        const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
        return backupSettingsSchema.parse(settings);
      } catch {
        // Return default settings if file doesn't exist
        return {
          enabled: false,
          location: '/mnt/backups',
          retention: 30
        };
      }
    } catch (error) {
      throw new Error(`Failed to get backup settings: ${error}`);
    }
  });

  // Update backup settings
  fastify.post('/backup/settings', async (request) => {
    try {
      const settings = backupSettingsSchema.parse(request.body);
      const settingsPath = path.join(process.cwd(), 'backup-settings.json');

      // Create backup directory if it doesn't exist
      await runPrivilegedCommand(`mkdir -p ${settings.location}`);

      // Save settings
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

      // Update cron job if automatic backups are enabled
      let currentCrontab = '';
      try {
        const { stdout } = await execAsync('crontab -l');
        currentCrontab = stdout;
      } catch {
        // No crontab exists yet
      }

      // Remove existing backup entries
      currentCrontab = currentCrontab
        .split('\n')
        .filter(line => !line.includes('backup.sh'))
        .join('\n');

      if (settings.enabled) {
        // Add daily backup job at midnight
        currentCrontab += `\n0 0 * * * ${process.cwd()}/scripts/backup.sh ${settings.location} ${settings.retention}`;
      }

      // Write new crontab
      await execAsync(`echo "${currentCrontab.trim()}" | crontab -`);

      return { status: 'success', message: 'Backup settings updated successfully' };
    } catch (error) {
      throw new Error(`Failed to update backup settings: ${error}`);
    }
  });

  // Trigger manual backup
  fastify.post('/backup/run', async () => {
    try {
      const settingsPath = path.join(process.cwd(), 'backup-settings.json');
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));

      // Create backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(settings.location, `nestos-backup-${timestamp}.tar.gz`);

      // Create backup directory if it doesn't exist
      await runPrivilegedCommand(`mkdir -p ${settings.location}`);

      // Get NestOS root directory (two levels up from current directory)
      const nestosRoot = path.resolve(process.cwd(), '../../');

      // Create backup with important system files and configurations
      await runPrivilegedCommand(`tar -czf ${backupFile} \
        --exclude='**/node_modules' \
        --exclude='**/.git' \
        --exclude='**/dist' \
        --exclude='**/*.log' \
        --exclude='**/*.tar.gz' \
        --exclude='**/coverage' \
        --exclude='**/.env' \
        -C ${nestosRoot} . \
        -C /etc nestos \
        -C /etc/systemd/system nestos*.service \
        2>/dev/null || true`);

      // Clean up old backups
      const { stdout: files } = await execAsync(`find ${settings.location} -name "nestos-backup-*.tar.gz" -type f`);
      const backupFiles = files.split('\n').filter(Boolean);

      if (backupFiles.length > settings.retention) {
        const filesToDelete = backupFiles
          .sort()
          .slice(0, backupFiles.length - settings.retention);

        for (const file of filesToDelete) {
          await fs.unlink(file);
        }
      }

      return {
        status: 'success',
        message: 'System backup completed successfully',
        file: backupFile
      };
    } catch (error) {
      throw new Error(`Backup failed: ${error}`);
    }
  });

  fastify.get('/plugins', async () => {
    try {
      const response = await axios.get('https://raw.githubusercontent.com/moderniselife/nestos/main/nestos-plugins/plugins.json');
      const plugins = response.data;

      for (const plugin of plugins) {
        try {
          const configPath = path.join(process.cwd(), 'plugins', plugin.id, 'ui', 'config.tsx');
          const configExists = await fs.access(configPath).then(() => true).catch(() => false);

          if (configExists) {
            plugin.installed = true;
            const configCode = await fs.readFile(configPath, 'utf-8');
            // Extract just the component definition without imports
            const componentCode = configCode
              .replace(/import[^;]+;/g, '') // Remove import statements
              .replace(/export\s+default\s+/g, '') // Remove export default
              .trim();
            plugin.configComponent = componentCode;
          } else {
            plugin.installed = false;
            plugin.configComponent = undefined;
          }
        } catch {
          plugin.installed = false;
          plugin.configComponent = undefined;
        }
      }

      return plugins;
    } catch (error) {
      throw new Error(`Failed to fetch plugins: ${error}`);
    }
  });

  fastify.post('/plugins/:id/install', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { config } = request.body as { config?: Record<string, any> };
    const pluginsDir = path.join(process.cwd(), 'plugins');
    await fs.mkdir(pluginsDir, { recursive: true });
    const pluginDir = path.join(pluginsDir, id);

    try {
      // Fetch plugin info and config component
      const response = await axios.get('https://raw.githubusercontent.com/moderniselife/nestos/main/nestos-plugins/plugins.json');
      const plugin = response.data.find((p: any) => p.id === id);

      if (!plugin) {
        reply.code(404);
        throw new Error('Plugin not found');
      }

      // Clone plugin repository
      await execAsync(`git clone ${plugin.repository} ${path.join(pluginsDir, id)}`);

      // Check if plugin requires configuration
      const configPath = path.join(pluginDir, 'ui', 'config.tsx');
      const requiresConfig = await fs.access(configPath).then(() => true).catch(() => false);

      if (requiresConfig && !config) {
        // Remove cloned repository if no config provided
        await fs.rm(pluginDir, { recursive: true, force: true });
        reply.code(400);
        throw new Error('Plugin requires configuration');
      }

      // If config is provided, save it
      if (config) {
        const configJsonPath = path.join(pluginDir, 'config.json');
        await fs.writeFile(configJsonPath, JSON.stringify(config, null, 2));
        // Create .env file from config
        const envContent = Object.entries(config)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
        await fs.writeFile(path.join(pluginDir, '.env'), envContent);
      }

      // Read and store the configuration component
      try {
        const configCode = await fs.readFile(configPath, 'utf-8');
        plugin.configComponent = Buffer.from(configCode).toString('base64');
      } catch (error) {
        console.log('No configuration component found for plugin:', id);
      }

      // Run install script if it exists
      const installScript = path.join(pluginsDir, id, 'install.sh');
      try {
        await fs.access(installScript);

        // Read the install script
        const scriptContent = await fs.readFile(installScript, 'utf-8');

        // Process the script content
        const lines = scriptContent.split('\n');
        let isInHeredoc = false;
        let heredocMarker = '';
        let currentCommand = '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Skip empty lines and comments
          if (!line || line.startsWith('#')) continue;

          if (isInHeredoc) {
            // Check if this line ends the heredoc
            if (line === heredocMarker) {
              isInHeredoc = false;
              await runPrivilegedCommand(currentCommand);
              currentCommand = '';
            } else {
              currentCommand += line + '\n';
            }
          } else {
            // Check for heredoc start
            const heredocMatch = line.match(/<<\s*(\w+)\s*$/);
            if (heredocMatch) {
              isInHeredoc = true;
              heredocMarker = heredocMatch[1];
              currentCommand = line + '\n';
            } else if (line.includes('docker')) {
              await executeDockerCommand(line, id, pluginDir);
            } else {
              await runPrivilegedCommand(line);
            }
          }
        }
      } catch (error) {
        console.error('Install script error:', error);
        // Continue with installation even if script fails
      }

      return { status: 'success', message: 'Plugin installed successfully' };
    } catch (error) {
      // Cleanup on failure
      await fs.rm(pluginDir, { recursive: true, force: true }).catch(() => { });
      throw new Error(`Failed to install plugin: ${error}`);
    }
  });

  fastify.delete('/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const pluginDir = path.join(process.cwd(), 'plugins', id);

      // Check if plugin exists
      try {
        await fs.access(pluginDir);
      } catch {
        reply.code(404);
        throw new Error('Plugin not installed');
      }

      // Run uninstall script if it exists
      const uninstallScript = path.join(pluginDir, 'uninstall.sh');
      try {
        await fs.access(uninstallScript);
        await runPrivilegedCommand(`bash ${uninstallScript}`);
      } catch {
        // No uninstall script, skip
      }

      // Remove plugin directory
      await fs.rm(pluginDir, { recursive: true, force: true });

      return { status: 'success', message: 'Plugin uninstalled successfully' };
    } catch (error) {
      throw new Error(`Failed to uninstall plugin: ${error}`);
    }
  });
};