import { describe, it, expect } from 'bun:test';
import { isPathInsideRoot, resolveInsideRoot } from '../src/fs/paths.ts';

describe('Path Security', () => {
    describe('isPathInsideRoot', () => {
        it('should return true for path inside root', () => {
            expect(isPathInsideRoot('/app/data/file.txt', '/app/data')).toBe(true);
        });

        it('should return true for root itself', () => {
            expect(isPathInsideRoot('/app/data', '/app/data')).toBe(true);
        });

        it('should return false for path outside root', () => {
            expect(isPathInsideRoot('/app/other/file.txt', '/app/data')).toBe(false);
        });

        it('should return false for parent directory', () => {
            expect(isPathInsideRoot('/app', '/app/data')).toBe(false);
        });

        it('should return false for traversal via ..', () => {
            expect(isPathInsideRoot('/app/data/../other/file.txt', '/app/data')).toBe(false);
        });

        it('should catch string prefix false positives', () => {
            expect(isPathInsideRoot('/app/database', '/app/data')).toBe(false);
        });

        it('should handle trailing slashes in root', () => {
            expect(isPathInsideRoot('/app/data/file.txt', '/app/data/')).toBe(true);
        });
    });

    describe('resolveInsideRoot', () => {
        it('should return correct absolute path for safe relative paths', () => {
            const result = resolveInsideRoot('/app/data', 'subdir/file.txt');
            expect(result).toBe('/app/data/subdir/file.txt');
        });

        it('should throw on traversal attempts', () => {
            expect(() => {
                resolveInsideRoot('/app/data', '../outside');
            }).toThrow();
        });

        it('error message should include both paths', () => {
            const root = '/app/data';
            const rel = '../outside';
            try {
                resolveInsideRoot(root, rel);
            } catch (e: any) {
                expect(e.message).toContain('Path traversal attempt detected');
                expect(e.message).toContain(rel);
                expect(e.message).toContain('/app/outside');
            }
        });
    });
});
