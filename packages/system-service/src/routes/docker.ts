import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Stats response schema
const statsResponseSchema = z.object({
  stats: z.array(z.object({
    name: z.string(),
    cpu: z.string(),
    memory: z.string(),
    network: z.string(),
    disk: z.string()
  }))
});

const containerSchema = z.object({
  image: z.string(),
  name: z.string(),
  ports: z.array(z.object({
    container: z.number(),
    host: z.number()
  })).optional(),
  volumes: z.array(z.object({
    container: z.string(),
    host: z.string()
  })).optional(),
  env: z.record(z.string()).optional(),
  restart: z.enum(['no', 'always', 'on-failure', 'unless-stopped']).optional()
});

// Add Docker stats route
const plugin: FastifyPluginAsync = async (fastify) => {
  // Get Docker stats
  fastify.get('/stats', {
    schema: {
      response: {
        200: statsResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const containers = await docker.listContainers();
      const stats = await Promise.all(containers.map(async (containerInfo) => {
        const container = docker.getContainer(containerInfo.Id);
        const stats = await container.stats({ stream: false });
        const name = containerInfo.Names[0].replace('/', '');
        const cpuPercent = calculateCPUPercentage(stats);
        const memoryUsage = formatMemoryUsage(stats);
        const networkIO = formatNetworkIO(stats);
        const blockIO = formatBlockIO(stats);
        
        return {
          name,
          cpu: `${cpuPercent.toFixed(2)}%`,
          memory: memoryUsage,
          network: networkIO,
          disk: blockIO
        };
      }));
      
      return { stats };
    } catch (error) {
      console.error('Error fetching Docker stats:', error);
      throw new Error('Failed to fetch Docker stats');
    }
  });

  // Helper functions for stats calculations
  function calculateCPUPercentage(stats: any) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus;
    
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }

  function formatMemoryUsage(stats: any) {
    const used = stats.memory_stats.usage;
    const limit = stats.memory_stats.limit;
    const percent = ((used / limit) * 100).toFixed(2);
    return `${formatBytes(used)} / ${formatBytes(limit)} (${percent}%)`;
  }

  function formatNetworkIO(stats: any) {
    const rx = Object.values(stats.networks || {}).reduce((acc: number, net: any) => acc + net.rx_bytes, 0);
    const tx = Object.values(stats.networks || {}).reduce((acc: number, net: any) => acc + net.tx_bytes, 0);
    return `↓${formatBytes(rx)} / ↑${formatBytes(tx)}`;
  }

  function formatBlockIO(stats: any) {
    const read = stats.blkio_stats.io_service_bytes_recursive?.find((s: any) => s.op === 'Read')?.value || 0;
    const write = stats.blkio_stats.io_service_bytes_recursive?.find((s: any) => s.op === 'Write')?.value || 0;
    return `↓${formatBytes(read)} / ↑${formatBytes(write)}`;
  }

  function formatBytes(bytes: number) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)}${units[unitIndex]}`;
  }
};

const containerQuerySchema = z.object({
  all: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional().default(false))
});

export const dockerRoutes: FastifyPluginAsync = async (fastify) => {
  // List containers
  fastify.get('/containers', async (request) => {
    const { all } = containerQuerySchema.parse(request.query);
    const containers = await docker.listContainers({ all });
    return containers;
  });

  // Get container details
  fastify.get('/containers/:id', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const container = docker.getContainer(id);
    const [info, stats] = await Promise.all([
      container.inspect(),
      container.stats({ stream: false })
    ]);

    return {
      ...info,
      stats
    };
  });

  // Create container
  fastify.post('/containers', async (request) => {
    const { image, name, ports, volumes, env, restart } = containerSchema.parse(request.body);

    const portBindings: Docker.PortMap = {};
    const exposedPorts: { [key: string]: {} } = {};
    
    ports?.forEach(({ container, host }) => {
      const portStr = `${container}/tcp`;
      exposedPorts[portStr] = {};
      portBindings[portStr] = [{ HostPort: host.toString() }];
    });

    const container = await docker.createContainer({
      Image: image,
      name,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: volumes?.map(v => `${v.host}:${v.container}`),
        RestartPolicy: restart ? { Name: restart } : undefined
      },
      Env: env ? Object.entries(env).map(([key, value]) => `${key}=${value}`) : undefined
    });

    await container.start();
    return container.inspect();
  });

  // Start container
  fastify.post('/containers/:id/start', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const container = docker.getContainer(id);
    await container.start();
    return { status: 'started' };
  });

  // Stop container
  fastify.post('/containers/:id/stop', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const container = docker.getContainer(id);
    await container.stop();
    return { status: 'stopped' };
  });

  // Remove container
  fastify.delete('/containers/:id', async (request) => {
    const { id } = z.object({
      id: z.string(),
      force: z
        .string()
        .optional()
        .transform((val) => val === 'true')
        .pipe(z.boolean().optional().default(false))
    }).parse(request.params);

    const container = docker.getContainer(id);
    await container.remove({ force: false });
    return { status: 'removed' };
  });

  // List images
  fastify.get('/images', async () => {
    const images = await docker.listImages();
    return images;
  });

  // Pull image
  fastify.post('/images/pull', async (request) => {
    const { image } = z.object({
      image: z.string()
    }).parse(request.body);

    await new Promise((resolve, reject) => {
      docker.pull(image, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        docker.modem.followProgress(stream, (err: any, output: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(output);
        });
      });
    });

    return { status: 'pulled', image };
  });

  // Remove image
  fastify.delete('/images/:id', async (request) => {
    const { id } = z.object({
      id: z.string(),
      force: z
        .string()
        .optional()
        .transform((val) => val === 'true')
        .pipe(z.boolean().optional().default(false))
    }).parse(request.params);

    const image = docker.getImage(id);
    await image.remove({ force: false });
    return { status: 'removed' };
  });

  // Get Docker system information
  fastify.get('/system', async () => {
    const [info, version, df] = await Promise.all([
      docker.info(),
      docker.version(),
      docker.df()
    ]);

    return {
      info,
      version,
      diskUsage: df
    };
  });
};