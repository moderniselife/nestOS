import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Docker from 'dockerode';
import { existsSync } from 'fs';

const docker = new Docker({
  socketPath: '/var/run/docker.sock',
  // Use the host's Docker daemon
  host: undefined,
  port: undefined
});

// Stats response schema
// const statsResponseSchema = z.object({
//   stats: z.array(z.object({
//     name: z.string(),
//     cpu: z.string(),
//     memory: z.string(),
//     network: z.string(),
//     disk: z.string()
//   }))
// });

function resolveVolumePath(path: string): string {
  // Check if we're running inside a container by checking /.dockerenv
  const isInContainer = existsSync('/.dockerenv');

  console.log({
    originalPath: path,
    isInContainer,
    workspacePath: `/workspace/${path}`,
    cwdPath: `${process.cwd()}/${path}`,
    mntPath: path.startsWith('/mnt') ? path : null
  });

  // For absolute paths starting with /mnt, use them directly
  if (path.startsWith('/mnt/')) {
    return path;
  }

  // For other absolute paths
  if (path.startsWith('/')) {
    return path;
  }

  // For relative paths
  if (isInContainer) {
    return `/workspace/${path}`;
  }
  return `${process.cwd()}/${path}`;
}

const containerSchema = z.object({
  image: z.string(),
  name: z.string(),
  ports: z.array(z.object({
    container: z.number(),
    host: z.number(),
    protocol: z.enum(['tcp', 'udp']).default('tcp')
  })).optional(),
  volumes: z.array(z.object({
    container: z.string(),
    host: z.string(),
    mode: z.enum(['rw', 'ro']).default('rw')
  })).optional(),
  env: z.record(z.string()).optional(),
  restart: z.enum(['no', 'always', 'on-failure', 'unless-stopped']).optional(),
  privileged: z.boolean().optional(),
  network_mode: z.string().optional(),
  hostname: z.string().optional(),
  domainname: z.string().optional(),
  user: z.string().optional(),
  working_dir: z.string().optional(),
  mac_address: z.string().optional(),
  labels: z.record(z.string()).optional(),
  devices: z.array(z.object({
    host: z.string(),
    container: z.string(),
    permissions: z.string()
  })).optional(),
  capabilities: z.object({
    add: z.array(z.string()).optional(),
    drop: z.array(z.string()).optional()
  }).optional(),
  dns: z.array(z.string()).optional(),
  dns_search: z.array(z.string()).optional(),
  extra_hosts: z.array(z.string()).optional(),
  security_opt: z.array(z.string()).optional(),
  memory: z.number().optional(),
  memory_swap: z.number().optional(),
  cpu_shares: z.number().optional(),
  cpuset_cpus: z.string().optional(),
  command: z.array(z.string()).optional(),
  entrypoint: z.array(z.string()).optional(),
});

// Add Docker stats route
const plugin: FastifyPluginAsync = async (fastify) => {
  // Get Docker stats
  fastify.get('/stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  cpu: { type: 'string' },
                  memory: { type: 'string' },
                  network: { type: 'string' },
                  disk: { type: 'string' }
                },
                required: ['name', 'cpu', 'memory', 'network', 'disk']
              }
            }
          },
          required: ['stats']
        }
      }
    }
  }, async () => {
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
  function calculateCPUPercentage(stats: {
    cpu_stats: {
      cpu_usage: {
        total_usage: number;
      };
      system_cpu_usage: number;
      online_cpus: number;
    };
    precpu_stats: {
      cpu_usage: {
        total_usage: number;
      };
      system_cpu_usage: number;
    };
  }) {
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus;

    return (cpuDelta / systemDelta) * cpuCount * 100;
  }

  function formatMemoryUsage(stats: {
    memory_stats: {
      usage: number;
      limit: number;
    };
  }) {
    const { usage: used, limit } = stats.memory_stats;
    const percent = ((used / limit) * 100).toFixed(2);
    return `${formatBytes(used)} / ${formatBytes(limit)} (${percent}%)`;
  }

  function formatNetworkIO(stats: {
    networks: { [key: string]: { rx_bytes: number; tx_bytes: number } }
  }) {
    const rx = Object.values(stats.networks || {})
      .reduce((acc: number, net: { rx_bytes: number }) => acc + net.rx_bytes, 0);
    const tx = Object.values(stats.networks || {})
      .reduce((acc: number, net: { tx_bytes: number }) => acc + net.tx_bytes, 0);
    return `↓${formatBytes(rx)} / ↑${formatBytes(tx)}`;
  }

  interface BlockIOStats {
    op: string;
    value: number;
  }

  function formatBlockIO(stats: { blkio_stats?: { io_service_bytes_recursive?: BlockIOStats[] } }) {
    const read = stats.blkio_stats?.io_service_bytes_recursive?.find(s => s.op === 'Read')?.value || 0;
    const write = stats.blkio_stats?.io_service_bytes_recursive?.find(s => s.op === 'Write')?.value || 0;
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
  // Register the stats plugin
  await fastify.register(plugin);

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
  // fastify.post('/containers', async (request) => {
  //   const { image, name, ports, volumes, env, restart } = containerSchema.parse(request.body);

  //   const portBindings: Docker.PortMap = {};
  //   const exposedPorts: Record<string, Record<string, never>> = {};

  //   ports?.forEach(({ container, host }) => {
  //     const portStr = `${container}/tcp`;
  //     exposedPorts[portStr] = {};
  //     portBindings[portStr] = [{ HostPort: host.toString() }];
  //   });

  //   const container = await docker.createContainer({
  //     Image: image,
  //     name,
  //     ExposedPorts: exposedPorts,
  //     HostConfig: {
  //       PortBindings: portBindings,
  //       Binds: volumes?.map(v => `${v.host}:${v.container}`),
  //       RestartPolicy: restart ? { Name: restart } : undefined
  //     },
  //     Env: env ? Object.entries(env).map(([key, value]) => `${key}=${value}`) : undefined
  //   });

  //   await container.start();
  //   return container.inspect();
  // });

  fastify.post('/containers', async (request) => {
    const { image, name, ports, volumes, env, restart, ...otherOptions } = containerSchema.parse(request.body);

    const portBindings: Docker.PortMap = {};
    const exposedPorts: Record<string, Record<string, never>> = {};

    ports?.forEach(({ container, host, protocol }) => {
      const portStr = `${container}/${protocol}`;
      exposedPorts[portStr] = {};
      portBindings[portStr] = [{ HostPort: host.toString() }];
    });

    // Transform volume paths to absolute paths
    const binds = volumes?.map(v => `${resolveVolumePath(v.host)}:${v.container}:${v.mode}`);

    const container = await docker.createContainer({
      Image: image,
      name,
      ExposedPorts: exposedPorts,
      HostConfig: {
        PortBindings: portBindings,
        Binds: binds,
        RestartPolicy: restart ? { Name: restart } : undefined,
        ...otherOptions
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
      docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        docker.modem.followProgress(stream, (err: Error | null, output: unknown) => {
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
  // Add to existing docker routes
  fastify.get('/images/search', async (request) => {
    const { term, registry } = z.object({
      term: z.string(),
      registry: z.enum(['docker', 'github'])
    }).parse(request.query);

    if (registry === 'docker') {
      const response = await fetch(`https://hub.docker.com/v2/search/repositories?query=${encodeURIComponent(term)}`);
      const data = await response.json();
      return (data as { results: Array<{ repo_name: string; short_description: string; star_count: number }> }).results.map((result) => ({
        name: result.repo_name,
        description: result.short_description,
        stars: result.star_count
      }));
    } else {
      // GitHub Container Registry search
      const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(term)}+topic:container`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      const data = await response.json();
      return (data as { items: Array<{ full_name: string; description: string; stargazers_count: number }> }).items.map((item) => ({
        name: `ghcr.io/${item.full_name}`,
        description: item.description,
        stars: item.stargazers_count
      }));
    }
  });
  // Add restart container endpoint
  fastify.post('/containers/:id/restart', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const container = docker.getContainer(id);
    await container.restart();
    return { status: 'restarted' };
  });

  // Add logs endpoint
  fastify.get('/containers/:id/logs', async (request) => {
    const { id } = z.object({
      id: z.string(),
      tail: z.string().optional().default('100')
    }).parse(request.params);

    let tail = 100;

    const query = request.query as { tail?: string };
    if (query.tail) {
      tail = parseInt(query.tail);
    }

    const container = docker.getContainer(id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true
    });

    return logs;
  });

  // Add container inspect endpoint
  fastify.get('/containers/:id/inspect', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const container = docker.getContainer(id);
    const info = await container.inspect();
    return info;
  });

  // Add container update endpoint
  fastify.put('/containers/:id/update', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const updateSchema = z.object({
      memory: z.number().optional(),
      cpu_shares: z.number().optional(),
      restart_policy: z.string().optional(),
      network_mode: z.string().optional(),
      privileged: z.boolean().optional(),
    });

    const updateData = updateSchema.parse(request.body);
    const container = docker.getContainer(id);
    await container.update(updateData);
    return { status: 'updated' };
  });

  // Add container rename endpoint
  fastify.post('/containers/:id/rename', async (request) => {
    const { id } = z.object({
      id: z.string()
    }).parse(request.params);

    const { name } = z.object({
      name: z.string()
    }).parse(request.body);

    const container = docker.getContainer(id);
    await container.rename({ name });
    return { status: 'renamed' };
  });
};