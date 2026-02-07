import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {tmpdir} from 'node:os';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {loadConfig} from '../src/config/config.ts';
import {loadStateConfig, saveStateConfig} from '../src/config/stateConfig.ts';

describe('State Config (runtime UI config)', () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        testDir = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-test-')));
        process.chdir(testDir);
        delete process.env.NEXUS_CONFIG_FILE;
        delete process.env.NEXUS_STATE_DIR;
        delete process.env.NEXUS_SERVER_BASE_URL;
        delete process.env.NEXUS_LOG_LEVEL;
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(testDir, {recursive: true, force: true});
    });

    it('should return defaults when config.jsonc is missing', async () => {
        const config = await loadConfig();
        const state = await loadStateConfig(config);

        expect(state).toEqual({ui: {}});
    });

    it('should strip JSONC comments correctly', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            JSON.stringify({
                stateDir: './my_state',
            })
        );

        const config = await loadConfig();
        const stateConfigPath = join(config.stateDir, 'config.jsonc');
        writeFileSync(
            stateConfigPath,
            `{
                // UI convenience
                "ui": {
                    "lastProjectId": "p-1", /* block
                    comment */
                    "lastTaskId": "T-001" // trailing comment
                }
            }`
        );

        const state = await loadStateConfig(config);
        expect(state.ui.lastProjectId).toBe('p-1');
        expect(state.ui.lastTaskId).toBe('T-001');
    });

    it('should persist values (write then read)', async () => {
        const config = await loadConfig();

        await saveStateConfig(config, {
            ui: {
                lastProjectId: 'nexus-mvp',
                lastTaskId: 'T-003',
                activeView: 'tasks',
            },
        });

        const state = await loadStateConfig(config);
        expect(state).toEqual({
            ui: {
                lastProjectId: 'nexus-mvp',
                lastTaskId: 'T-003',
                activeView: 'tasks',
            },
        });
    });

    it('should not let state config override system config (user config wins)', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            JSON.stringify({
                serverBaseUrl: 'http://localhost:9999',
                stateDir: './my_state',
            })
        );

        const config = await loadConfig();
        expect(config.serverBaseUrl).toBe('http://localhost:9999');
        expect(config.stateDir).toBe(resolve(testDir, './my_state'));

        // Even if state config contains unrelated keys, it must not affect system config.
        const stateConfigPath = join(config.stateDir, 'config.jsonc');
        writeFileSync(
            stateConfigPath,
            `{
                "serverBaseUrl": "http://localhost:1111",
                "ui": { "lastProjectId": "p-2" }
            }`
        );

        const state = await loadStateConfig(config);
        expect(state.ui.lastProjectId).toBe('p-2');
        expect((state as any).serverBaseUrl).toBeUndefined();
        expect(config.serverBaseUrl).toBe('http://localhost:9999');
    });
});
