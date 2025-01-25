import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';

const execAsync = promisify(exec);

const networkTestResponseSchema = z.object({
  ping: z.object({
    host: z.string(),
    latency: z.number(),
    packetLoss: z.number()
  }),
  speedtest: z.object({
    download: z.number(),
    upload: z.number(),
    latency: z.number()
  }).optional()
});

const interfaceSchema = z.object({
  iface: z.string(),
  ip4: z.string().optional(),
  ip6: z.string().optional(),
  gateway: z.string().optional(),
  netmask: z.string().optional(),
  dhcp: z.boolean().optional()
});

function analyzePingOutput(output: string) {
  const lines = output.split('\n');
  const stats = lines[lines.length - 2] || '';
  const latencyMatch = stats.match(/min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
  const packetLossMatch = stats.match(/(\d+)% packet loss/);

  return {
    latency: latencyMatch ? parseFloat(latencyMatch[2]) : 0, // Using average latency
    packetLoss: packetLossMatch ? parseFloat(packetLossMatch[1]) : 0
  };
}

export const networkRoutes: FastifyPluginAsync = async (fastify) => {
  // Network test endpoint
  fastify.post('/test', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            ping: {
              type: 'object',
              properties: {
                host: { type: 'string' },
                latency: { type: 'number' },
                packetLoss: { type: 'number' }
              },
              required: ['host', 'latency', 'packetLoss']
            },
            speedtest: {
              type: 'object',
              properties: {
                download: { type: 'number' },
                upload: { type: 'number' },
                latency: { type: 'number' }
              },
              required: ['download', 'upload', 'latency']
            }
          },
          required: ['ping']
        }
      }
    }
  }, async () => {
    try {
      // Basic ping test to Google DNS
      const { stdout: pingOutput } = await execAsync('ping -c 5 8.8.8.8');
      const pingStats = analyzePingOutput(pingOutput);

            // Custom speedtest implementation using smaller test sizes
            const testSize = 512 * 1024; // 512KB for quicker tests
            
            // Test download speed using httpbin's bytes endpoint
            const downloadTest = async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              
              try {
                const startTime = Date.now();
                const res = await fetch(`https://httpbin.org/bytes/${testSize}`, {
                  signal: controller.signal
                });
                await res.arrayBuffer();
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000; // seconds
                return (testSize * 8) / (1000000 * duration); // Mbps
              } finally {
                clearTimeout(timeoutId);
              }
            };
      
            // Test upload speed using httpbin's post endpoint
            const uploadTest = async () => {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              
              try {
                const randomData = Buffer.alloc(testSize);
                const startTime = Date.now();
                await fetch('https://httpbin.org/post', {
                  method: 'POST',
                  body: randomData,
                  signal: controller.signal
                });
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000; // seconds
                return (testSize * 8) / (1000000 * duration); // Mbps
              } finally {
                clearTimeout(timeoutId);
              }
            };
      
            // Run tests multiple times and average the results
            const runTests = async (testFn: () => Promise<number>) => {
              const tests = 2; // Reduced number of tests for faster completion
              let totalSpeed = 0;
              let completedTests = 0;
      
              for (let i = 0; i < tests; i++) {
                try {
                  const speed = await testFn();
                  totalSpeed += speed;
                  completedTests++;
                } catch (error: unknown) {
                  console.error(`Test iteration ${i + 1} failed:`, error);
                }
              }
      
              return completedTests > 0 ? totalSpeed / completedTests : 0;
            };
      
            // Run download and upload tests
            const [downloadSpeed, uploadSpeed] = await Promise.all([
              runTests(downloadTest),
              runTests(uploadTest)
            ]);
      
            return {
              ping: {
                host: '8.8.8.8',
                latency: pingStats.latency,
                packetLoss: pingStats.packetLoss
              },
              speedtest: {
                download: downloadSpeed,
                upload: uploadSpeed,
                latency: pingStats.latency // Using ping latency for now
              }
      };
    } catch (error) {
      console.error('Network test error:', error);
      throw new Error('Failed to run network test');
    }
  });

  // Get network interfaces
  fastify.get('/interfaces', async () => {
    try {
      const [interfaces, defaultGateway, defaultInterface] = await Promise.all([
        si.networkInterfaces(),
        si.networkGatewayDefault(),
        si.networkInterfaceDefault()
      ]);

      // Transform the interfaces into our expected format
      const formattedInterfaces = interfaces.map((iface) => ({
        iface: iface.iface,
        ifaceName: iface.ifaceName,
        ip4: iface.ip4,
        ip6: iface.ip6,
        mac: iface.mac,
        internal: iface.internal,
        virtual: iface.virtual,
        operstate: iface.operstate,
        type: iface.type,
        duplex: iface.duplex,
        speed: iface.speed,
        dhcp: iface.dhcp,
        default: iface.iface === defaultInterface,
        gateway: iface.iface === defaultInterface ? defaultGateway : undefined
      }));

      return { interfaces: formattedInterfaces };
    } catch (error) {
      throw new Error(`Failed to get network interfaces: ${error}`);
    }
  });

  // Configure interface
  fastify.post('/interfaces/:iface', async (request) => {
    const { iface } = z.object({
      iface: z.string()
    }).parse(request.params);

    const config = interfaceSchema.parse(request.body);

    try {
      // Generate network configuration
      let configContent = `auto ${iface}\n`;
      
      if (config.dhcp) {
        configContent += `iface ${iface} inet dhcp\n`;
      } else if (config.ip4) {
        configContent += `iface ${iface} inet static\n`;
        configContent += `  address ${config.ip4}\n`;
        if (config.netmask) {
          configContent += `  netmask ${config.netmask}\n`;
        }
        if (config.gateway) {
          configContent += `  gateway ${config.gateway}\n`;
        }
      }

      // Write configuration
      await execAsync(`echo '${configContent}' > /etc/network/interfaces.d/${iface}`);
      
      // Apply configuration
      await execAsync(`ifdown ${iface} && ifup ${iface}`);

      return { status: 'configured', iface };
    } catch (error) {
      throw new Error(`Failed to configure interface: ${error}`);
    }
  });

  // Get network connections
  fastify.get('/connections', async () => {
    try {
      const connections = await si.networkConnections();
      return { connections };
    } catch (error) {
      throw new Error(`Failed to get network connections: ${error}`);
    }
  });

  // Scan network
  fastify.post('/scan', async () => {
    try {
      const { stdout } = await execAsync('nmap -sn 192.168.1.0/24');
      return {
        status: 'completed',
        results: stdout
      };
    } catch (error) {
      throw new Error(`Failed to scan network: ${error}`);
    }
  });

  // Get network statistics
  fastify.get('/stats', async () => {
    try {
      const stats = await si.networkStats();
      return { stats };
    } catch (error) {
      throw new Error(`Failed to get network statistics: ${error}`);
    }
  });
};