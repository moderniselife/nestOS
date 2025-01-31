import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { systemRoutes } from './routes/system.js';
import { storageRoutes } from './routes/storage.js';
import { dockerRoutes } from './routes/docker.js';
import { networkRoutes } from './routes/network.js';
import { pluginRoutes } from './routes/plugins.js';
import { setupWebSocketHandlers } from './websocket/index.js';
import appearanceRoutes from './routes/system/appearance.js';

const fastify = Fastify({
  logger: true,
  trustProxy: true
});

// Register plugins
await fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

await fastify.register(websocket, {
  options: { maxPayload: 1048576 } // 1MB max payload
});

// Root route
fastify.get('/', async () => {
  return {
    status: 'ok',
    version: '0.1.0',
    services: {
      system: '/api/system',
      storage: '/api/storage',
      docker: '/api/docker',
      network: '/api/network',
      plugins: '/api/plugins',
      appearance: '/api/appearance',
      websocket: '/ws'
    }
  };
});

// Register route handlers
await fastify.register(systemRoutes, { prefix: '/api/system' });
await fastify.register(storageRoutes, { prefix: '/api/storage' });
await fastify.register(dockerRoutes, { prefix: '/api/docker' });
await fastify.register(networkRoutes, { prefix: '/api/network' });
await fastify.register(pluginRoutes, { prefix: '/api/plugins' });
await fastify.register(appearanceRoutes, { prefix: '/api/appearance' })

// Setup WebSocket handlers for real-time updates
setupWebSocketHandlers(fastify);

// Health check route
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Start the server
try {
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  console.log('System service running on port 3000');
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Handle graceful shutdown
const signals = ['SIGTERM', 'SIGINT'] as const;
for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await fastify.close();
    process.exit(0);
  });
}

// Export fastify instance for testing
export { fastify };