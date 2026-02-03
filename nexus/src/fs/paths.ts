import {resolve, relative, isAbsolute} from 'node:path';

/**
 * Checks if a path is inside a root directory.
 * 
 * This is a security helper to prevent path traversal attacks.
 * It resolves both paths and checks if the relative path from root to target
 * starts with '..' (outside) or is an absolute path (different drive/root).
 * 
 * @example
 * isPathInsideRoot('/app/data/file.txt', '/app/data') // true
 * isPathInsideRoot('/app/data/../other/file.txt', '/app/data') // false
 * isPathInsideRoot('/app/database', '/app/data') // false
 * 
 * @param absPath The path to check
 * @param absRoot The root directory path
 * @returns true if absPath is inside absRoot
 */
export function isPathInsideRoot(absPath: string, absRoot: string): boolean {
    const resolvedRoot = resolve(absRoot);
    const resolvedPath = resolve(absPath);
    const rel = relative(resolvedRoot, resolvedPath);
    return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Resolves a relative path inside a root directory, ensuring it stays within the root.
 * 
 * @example
 * resolveInsideRoot('/app/data', 'subdir/file.txt') // '/app/data/subdir/file.txt'
 * resolveInsideRoot('/app/data', '../outside') // throws Error
 * 
 * @param rootAbs The absolute path to the root directory
 * @param relativePath The relative path to resolve
 * @returns The resolved absolute path
 * @throws Error if the resolved path is outside the root directory
 */
export function resolveInsideRoot(rootAbs: string, relativePath: string): string {
    const resolvedRoot = resolve(rootAbs);
    const joined = resolve(resolvedRoot, relativePath);
    
    if (!isPathInsideRoot(joined, resolvedRoot)) {
        throw new Error(
            `Path traversal attempt detected: "${relativePath}" resolves to "${joined}" which is outside root "${resolvedRoot}"`
        );
    }
    
    return joined;
}
