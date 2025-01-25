import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';

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
        new Promise<number>(async (resolve) => {
          const startTime = process.hrtime.bigint();
          let operations = 0;
          for (let i = 0; i < 1000000; i++) {
            operations += Math.sqrt(i);
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
        new Promise<number>(async (resolve) => {
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
        new Promise<number>(async (resolve) => {
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
        new Promise<number>(async (resolve) => {
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
          } catch (error: any) {
            // On macOS, dd outputs to stderr even on success
            return error.stderr || error.stdout || '';
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

  // Update system
  fastify.post('/update', async () => {
    try {
      const { stdout, stderr } = await execAsync('apt-get update && apt-get upgrade -y');
      return { 
        status: 'updated',
        output: stdout,
        errors: stderr 
      };
    } catch (error) {
      throw new Error(`Update failed: ${error}`);
    }
  });
};