import { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import si from 'systeminformation';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface BlockDevice {
  name: string;
  type: string;
  fstype: string;
  mount: string;
  size: number;
  physical: string;
  uuid: string;
  label: string;
  model: string;
  serial: string;
  removable: boolean;
  protocol: string;
}

interface FileSystem {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  use: number;
  mount: string;
}

interface NetworkStats {
  iface: string;
  operstate: string;
  rx_bytes: number;
  rx_dropped: number;
  rx_errors: number;
  tx_bytes: number;
  tx_dropped: number;
  tx_errors: number;
}

interface SystemMetrics {
  cpu: {
    load: number;
    cores: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    active: number;
    available: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
  };
  disks: {
    devices: BlockDevice[];
    filesystems: FileSystem[];
  };
  network: NetworkStats[];
  docker: {
    containers: {
      total: number;
      running: number;
      paused: number;
      stopped: number;
    };
    images: number;
    memoryLimit: boolean;
    cpuCfsPeriod: boolean;
    cpuCfsQuota: boolean;
  };
}

export function setupWebSocketHandlers(fastify: FastifyInstance): void {
  fastify.get('/ws', { websocket: true }, (connection) => {
    const { socket } = connection;
    let metricsInterval: NodeJS.Timeout | null = null;

    const sendMetrics = async (ws: WebSocket) => {
      try {
        const [cpu, mem, networkStats, fsSize, dockerInfo] = await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.networkStats(),
          si.fsSize(),
          docker.info()
        ]);

        const blockDevices = await si.blockDevices();

        const metrics: SystemMetrics = {
          cpu: {
            load: cpu.currentLoad,
            cores: cpu.cpus.map((core: { load: number }) => core.load)
          },
          memory: {
            total: mem.total,
            used: mem.used,
            free: mem.free,
            active: mem.active,
            available: mem.available,
            swapTotal: mem.swaptotal,
            swapUsed: mem.swapused,
            swapFree: mem.swapfree
          },
          disks: {
            devices: blockDevices,
            filesystems: fsSize
          },
          network: networkStats,
          docker: {
            containers: {
              total: dockerInfo.Containers || 0,
              running: dockerInfo.ContainersRunning || 0,
              paused: dockerInfo.ContainersPaused || 0,
              stopped: dockerInfo.ContainersStopped || 0
            },
            images: dockerInfo.Images || 0,
            memoryLimit: dockerInfo.MemoryLimit || false,
            cpuCfsPeriod: dockerInfo.CpuCfsPeriod || false,
            cpuCfsQuota: dockerInfo.CpuCfsQuota || false
          }
        };

        ws.send(JSON.stringify({
          type: 'metrics',
          data: metrics
        }));
      } catch (error) {
        console.error('Error collecting metrics:', error);
        ws.send(JSON.stringify({
          type: 'error',
          data: 'Failed to collect system metrics'
        }));
      }
    };

    // Set up event handlers
    socket.on('message', async (message: string) => {
      try {
        const { type, data } = JSON.parse(message);

        switch (type) {
          case 'start_metrics':
            // Start sending metrics every 5 seconds
            if (metricsInterval) {
              clearTimeout(metricsInterval);
            }
            metricsInterval = setInterval(() => sendMetrics(socket), 5000);
            // Send initial metrics immediately
            sendMetrics(socket);
            break;

          case 'stop_metrics':
            if (metricsInterval) {
              clearTimeout(metricsInterval);
              metricsInterval = null;
            }
            break;

          case 'get_container_logs':
            try {
              const container = docker.getContainer(data.containerId);
              const logs = await container.logs({
                stdout: true,
                stderr: true,
                tail: 100,
                follow: false
              });
              
              socket.send(JSON.stringify({
                type: 'container_logs',
                data: {
                  containerId: data.containerId,
                  logs: logs.toString()
                }
              }));
            } catch (error) {
              socket.send(JSON.stringify({
                type: 'error',
                data: `Failed to get container logs: ${error}`
              }));
            }
            break;

          default:
            socket.send(JSON.stringify({
              type: 'error',
              data: 'Unknown message type'
            }));
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: 'error',
          data: 'Invalid message format'
        }));
      }
    });

    // Clean up on connection close
    socket.on('close', () => {
      if (metricsInterval) {
        clearTimeout(metricsInterval);
        metricsInterval = null;
      }
    });
  });
}