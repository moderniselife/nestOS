import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { globby } from 'globby';

const MAX_IMAGE_SIZE_MB = 0.5; // 500KB threshold
const DOCS_DIR = path.join(__dirname, '../docs');

async function optimizeImage(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const sizeInMB = stats.size / (1024 * 1024);

    if (sizeInMB > MAX_IMAGE_SIZE_MB) {
        console.log(`Optimizing large image: ${filePath} (${sizeInMB.toFixed(2)}MB)`);
        
        const tempPath = `${filePath}.temp`;
        await sharp(filePath)
            .resize(1280, null, {
                withoutEnlargement: true,
                fit: 'inside'
            })
            .jpeg({
                quality: 80,
                progressive: true
            })
            .toFile(tempPath);

        await fs.remove(filePath);
        await fs.move(tempPath, filePath);
        
        const newStats = await fs.stat(filePath);
        console.log(`Reduced size to: ${(newStats.size / (1024 * 1024)).toFixed(2)}MB`);
    }
}

async function main() {
    try {
        const images = await globby(['**/*.{png,jpg,jpeg}'], {
            cwd: DOCS_DIR,
            absolute: true
        });

        for (const image of images) {
            await optimizeImage(image);
        }
    } catch (error) {
        console.error('Error processing images:', error);
        process.exit(1);
    }
}

main();