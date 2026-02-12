import {mkdir, writeFile, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import type {AppConfig} from './config';

export async function validateConfig(cfg: AppConfig): Promise<void> {
    const dir = cfg.imagesDir;

    try {
        await mkdir(dir, {recursive: true});
    } catch (err) {
        throw new Error(`IMAGES_DIR cannot be created: ${dir}. ${(err as Error).message}`);
    }

    const probeFile = join(dir, `.cgpt-nav-write-test-${Date.now()}.tmp`);
    try {
        await writeFile(probeFile, 'ok', 'utf8');
        await unlink(probeFile);
    } catch (err) {
        throw new Error(`IMAGES_DIR is not writable: ${dir}. ${(err as Error).message}`);
    }
}
