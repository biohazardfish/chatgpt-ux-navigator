import {mkdir} from 'node:fs/promises';

/**
 * Ensures a directory exists, creating it recursively if needed.
 * 
 * @example
 * await ensureDir('/app/data/logs');  // Creates all parent dirs if needed
 * 
 * @param pathAbs Absolute path to the directory
 * @throws Error if directory creation fails
 */
export async function ensureDir(pathAbs: string): Promise<void> {
    try {
        await mkdir(pathAbs, { recursive: true });
    } catch (error) {
        throw new Error(
            `Failed to create directory "${pathAbs}": ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Ensures multiple directories exist, creating them if needed.
 * Fails fast on the first error.
 * 
 * @example
 * await ensureDirs(['/app/data', '/app/logs', '/app/temp']);
 * 
 * @param pathsAbs Array of absolute paths to directories
 * @throws Error if any directory creation fails
 */
export async function ensureDirs(pathsAbs: string[]): Promise<void> {
    for (const path of pathsAbs) {
        await ensureDir(path);  // Fail fast - stops on first error
    }
}
