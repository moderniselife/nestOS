import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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