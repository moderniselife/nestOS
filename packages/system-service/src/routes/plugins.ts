import { FastifyPluginAsync } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { runPrivilegedCommand } from '@/utils/runPrivilegedCommand.js';
import { execAsync } from '@/utils/execAsync.js';

export const pluginRoutes: FastifyPluginAsync = async (fastify) => {
    // Get plugin configuration
    fastify.get('/:id/config', async (request) => {
        const { id } = request.params as { id: string };
        const configPath = path.join(process.cwd(), 'plugins', id, 'config.json');

        try {
            const configExists = await fs.access(configPath).then(() => true).catch(() => false);
            if (!configExists) {
                return {};
            }
            const config = await fs.readFile(configPath, 'utf-8');
            return JSON.parse(config);
        } catch (error) {
            throw new Error(`Failed to read plugin configuration: ${error}`);
        }
    });

    // Save plugin configuration
    fastify.post('/:id/config', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            },
            body: {
                type: 'object',
                additionalProperties: true // Allow any properties in config
            }
        }
    }, async (request) => {
        const { id } = request.params as { id: string };
        const configPath = path.join(process.cwd(), 'plugins', id, 'config.json');
        const configDir = path.dirname(configPath);

        try {
            // Ensure config directory exists
            await fs.mkdir(configDir, { recursive: true });

            // Save configuration
            await fs.writeFile(configPath, JSON.stringify(request.body, null, 2));

            // Apply configuration if plugin has a script
            const applyScript = path.join(process.cwd(), 'plugins', id, 'apply-config.sh');
            try {
                await fs.access(applyScript);
                await runPrivilegedCommand(`bash ${applyScript}`);
            } catch {
                // No apply script, skip
            }

            return { status: 'success' };
        } catch (error) {
            throw new Error(`Failed to save plugin configuration: ${error}`);
        }
    });

    // Add schema validation for restart endpoint
    fastify.post('/:id/restart', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    id: { type: 'string' }
                },
                required: ['id']
            }
        }
    }, async (request) => {
        const { id } = request.params as { id: string };

        try {
            // Get container name
            const { stdout: containers } = await execAsync('docker ps --format "{{.Names}}"');
            const containerName = containers.split('\n').find(name => name.includes(id));

            if (!containerName) {
                throw new Error(`Container for plugin ${id} not found`);
            }

            // Restart container
            await runPrivilegedCommand(`docker restart ${containerName}`);

            return { status: 'success' };
        } catch (error) {
            throw new Error(`Failed to restart plugin: ${error}`);
        }
    });
};