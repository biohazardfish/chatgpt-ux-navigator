import {describe, expect, it} from 'bun:test';
import {handleViewerArgs} from '../cli';

describe('cli --viewer handling', () => {
    it('fails when --viewer has no path', async () => {
        const {deps, calls} = createDeps();

        await expect(handleViewerArgs(['--viewer'], deps)).rejects.toThrow('exit:1');
        expect(calls.startViewer).toBe(0);
        expect(calls.exit).toEqual([1]);
    });

    it('fails when --viewer is followed by another flag', async () => {
        const {deps, calls} = createDeps();

        await expect(handleViewerArgs(['--viewer', '--debug'], deps)).rejects.toThrow('exit:1');
        expect(calls.startViewer).toBe(0);
        expect(calls.exit).toEqual([1]);
    });

    it('invokes startViewer and returns true', async () => {
        const {deps, calls} = createDeps();

        await expect(handleViewerArgs(['--viewer', 'runs'], deps)).resolves.toBe(true);
        expect(calls.startViewer).toBe(1);
        expect(calls.exit.length).toBe(0);
    });

    it('prefers viewer mode even when resume is present', async () => {
        const {deps, calls} = createDeps();

        await expect(
            handleViewerArgs(['--viewer', 'runs', '--resume', 'runs/old'], deps)
        ).resolves.toBe(true);
        expect(calls.startViewer).toBe(1);
        expect(calls.exit.length).toBe(0);
    });
});

function createDeps(): {
    deps: {
        startViewer: () => Promise<Bun.Server>;
        log: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
        exit: (code: number) => void;
    };
    calls: {
        startViewer: number;
        exit: number[];
    };
} {
    const calls = {
        startViewer: 0,
        exit: [] as number[],
    };

    return {
        deps: {
            startViewer: async () => {
                calls.startViewer += 1;
                return {
                    stop: () => {},
                } as Bun.Server;
            },
            log: () => {},
            error: () => {},
            exit: (code: number) => {
                calls.exit.push(code);
                throw new Error(`exit:${code}`);
            },
        },
        calls,
    };
}
