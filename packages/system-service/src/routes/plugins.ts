import { FastifyPluginAsync } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { runPrivilegedCommand } from '@/utils/runPrivilegedCommand.js';
import Docker from 'dockerode';
import axios from 'axios';

const docker = new Docker({
    socketPath: '/var/run/docker.sock'
});

const getRemoteConfig = async (repository: string): Promise<string | null> => {
    try {
        const [, owner, repo] = repository.match(/github\.com\/([^/]+)\/([^/]+)/) || [];
        if (!owner || !repo) return null;

        const timestamp = Date.now();
        const response = await axios.get(
            `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/main/ui/config.tsx?t=${timestamp}`,
            {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            }
        );
        return response.data;
    } catch {
        return null;
    }
};

export const pluginRoutes: FastifyPluginAsync = async (fastify) => {
    // Modify the requires-config endpoint
    fastify.get('/:id/requires-config', async (request) => {
        const { id } = request.params as { id: string };

        try {
            // First check if plugin is already installed
            const configPath = path.join(process.cwd(), 'plugins', id, 'ui', 'config.tsx');
            const localConfigExists = await fs.access(configPath).then(() => true).catch(() => false);

            let configComponent;
            if (localConfigExists) {
                const configCode = await fs.readFile(configPath, 'utf-8');
                configComponent = configCode
                    .replace(/import[^;]+;/g, '')
                    .replace(/export\s+default\s+/g, '')
                    .trim();
            } else {
                // If not installed, check remote repository
                const pluginsResponse = await axios.get(
                    'https://raw.githubusercontent.com/moderniselife/nestos/main/nestos-plugins/plugins.json'
                );
                const plugin = pluginsResponse.data.find((p: any) => p.id === id);

                if (!plugin) {
                    throw new Error('Plugin not found');
                }

                const remoteConfig = await getRemoteConfig(plugin.repository);
                if (remoteConfig) {
                    configComponent = remoteConfig
                        .replace(/import[^;]+;/g, '')
                        .replace(/export\s+default\s+/g, '')
                        .trim();
                }
            }

            return {
                requiresConfig: !!configComponent,
                configComponent
            };
        } catch (error) {
            throw new Error(`Failed to check plugin configuration: ${error}`);
        }
    });

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
            // Get all containers
            const containers = await docker.listContainers();
            const containerInfo = containers.find(container =>
                container.Names.some(name => name.includes(id))
            );

            if (!containerInfo) {
                throw new Error(`Container for plugin ${id} not found`);
            }

            // Get container instance and restart it
            const container = docker.getContainer(containerInfo.Id);
            await container.restart();

            return { status: 'success' };
        } catch (error) {
            throw new Error(`Failed to restart plugin: ${error}`);
        }
    });

    // Start plugin endpoint
    fastify.post('/:id/start', {
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
        const startScript = path.join(process.cwd(), 'plugins', id, 'start.sh');

        try {
            // Check if start script exists
            const scriptExists = await fs.access(startScript).then(() => true).catch(() => false);
            if (!scriptExists) {
                throw new Error(`Start script not found for plugin ${id}`);
            }

            // Execute start script
            await runPrivilegedCommand(`bash ${startScript}`);

            return { status: 'success' };
        } catch (error) {
            throw new Error(`Failed to start plugin: ${error}`);
        }
    });
};