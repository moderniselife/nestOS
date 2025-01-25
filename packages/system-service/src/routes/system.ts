import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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