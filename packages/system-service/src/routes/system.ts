import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';

interface UpdateSettings {
  autoUpdate: boolean;
  schedule: 'hourly' | 'daily' | null;
}

const updateSettingsSchema = z.object({
  autoUpdate: z.boolean(),
  schedule: z.enum(['hourly', 'daily']).nullable()
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
        }
      },
      required: ['cpu', 'memory', 'disk']
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
      }
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

  // Check for NestOS updates
  fastify.get('/updates/check', async () => {
    try {
      // Get current version
      const { stdout: currentHash } = await execAsync('git rev-parse HEAD');
      
      // Fetch latest updates
      await execAsync('git fetch origin main');
      
      // Get latest version
      const { stdout: latestHash } = await execAsync('git rev-parse origin/main');
      
      // Get commit details if there's an update
      let updateDetails = null;
      if (currentHash.trim() !== latestHash.trim()) {
        const { stdout: commitLog } = await execAsync('git log --pretty=format:"%h - %s" HEAD..origin/main');
        updateDetails = commitLog.split('\n').map(line => {
          const [hash, message] = line.split(' - ');
          return { hash, message };
        });
      }

      return {
        currentVersion: currentHash.trim(),
        latestVersion: latestHash.trim(),
        updateAvailable: currentHash.trim() !== latestHash.trim(),
        updateDetails
      };
    } catch (error) {
      throw new Error(`Failed to check for updates: ${error}`);
    }
  });

  // Update NestOS
  fastify.post('/updates/apply', async () => {
    try {
      // Pull latest changes
      await execAsync('git pull origin main');
      
      // Rebuild and restart services
      await execAsync('npm run build');
      await execAsync('systemctl restart nasos-system nasos-control-panel');
      
      return {
        status: 'updated',
        message: 'System updated successfully'
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
        currentCrontab += `\n${cronExpression} cd ${process.cwd()} && git pull origin main && npm run build && systemctl restart nasos-system nasos-control-panel`;
      }

      // Write new crontab
      await execAsync(`echo "${currentCrontab.trim()}" | crontab -`);

      return { status: 'success' };
    } catch (error) {
      throw new Error(`Failed to update settings: ${error}`);
    }
  });
};