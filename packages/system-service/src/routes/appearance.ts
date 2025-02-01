import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const appearanceSettingsPath = path.join(process.cwd(), 'data', 'appearance.json');

const AppearanceSchema = z.object({
    background: z.string().default('abstract-dark'),
    useFrostedGlass: z.boolean().default(false)
});

type AppearanceSettings = z.infer<typeof AppearanceSchema>;

const appearanceRoutes: FastifyPluginAsync = async (fastify) => {
    // Ensure settings file exists
    try {
        await fs.access(appearanceSettingsPath);
    } catch {
        await fs.mkdir(path.dirname(appearanceSettingsPath), { recursive: true });
        await fs.writeFile(appearanceSettingsPath, JSON.stringify({ background: 'abstract-dark', useFrostedGlass: false }));
    }

    // Get appearance settings
    fastify.get('/appearance', async () => {
        try {
            const data = await fs.readFile(appearanceSettingsPath, 'utf-8');
            return AppearanceSchema.parse(JSON.parse(data));
        } catch (error) {
            const defaultSettings: AppearanceSettings = { background: 'abstract-dark', useFrostedGlass: false };
            await fs.writeFile(appearanceSettingsPath, JSON.stringify(defaultSettings));
            return defaultSettings;
        }
    });

    // Update appearance settings
    fastify.post('/appearance', {
        schema: {
            body: {
                type: 'object',
                required: ['background', 'useFrostedGlass'],
                properties: {
                    background: { type: 'string' },
                    useFrostedGlass: { type: 'boolean' }
                }
            }
        },
        handler: async (request) => {
            const settings = AppearanceSchema.parse(request.body);
            await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
            await fs.writeFile(appearanceSettingsPath, JSON.stringify(settings, null, 2));
            return { success: true };
        },
    });
};

export default appearanceRoutes;