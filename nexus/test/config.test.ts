import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import {tmpdir} from 'node:os';
import {mkdtempSync, rmSync, writeFileSync, existsSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {loadConfig} from '../src/config/config.ts';

describe('Config Loader', () => {
    let testDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        testDir = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-test-')));
        process.chdir(testDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        rmSync(testDir, {recursive: true, force: true});
        delete process.env.NEXUS_CONFIG_FILE;
        delete process.env.NEXUS_STATE_DIR;
        delete process.env.NEXUS_SERVER_BASE_URL;
        delete process.env.NEXUS_LOG_LEVEL;
    });

    it('should load defaults when no config file or env vars', async () => {
        const config = await loadConfig();

        expect(config.serverBaseUrl).toBe('http://localhost:8765');
        expect(config.logLevel).toBe('info');
        expect(config.stateDir).toBe(resolve(testDir, './nexus_state'));
        expect(config.projectsDir).toBe(join(config.stateDir, 'projects'));
        expect(config.runsDir).toBe(join(config.stateDir, 'runs'));
        expect(config.logsDir).toBe(join(config.stateDir, 'logs'));
    });

    it('should load config file when present', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            JSON.stringify({
                serverBaseUrl: 'http://localhost:9999',
                stateDir: './custom_state',
            })
        );

        const config = await loadConfig();
        expect(config.serverBaseUrl).toBe('http://localhost:9999');
        expect(config.stateDir).toBe(resolve(testDir, './custom_state'));
    });

    it('should override config file with env vars', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            JSON.stringify({
                serverBaseUrl: 'http://localhost:9999',
                stateDir: './custom_state',
            })
        );

        process.env.NEXUS_SERVER_BASE_URL = 'http://localhost:1111';
        process.env.NEXUS_STATE_DIR = './env_state';
        process.env.NEXUS_LOG_LEVEL = 'debug';

        const config = await loadConfig();
        expect(config.serverBaseUrl).toBe('http://localhost:1111');
        expect(config.stateDir).toBe(resolve(testDir, './env_state'));
        expect(config.logLevel).toBe('debug');
    });

    it('should throw error on invalid JSON', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(configPath, '{ invalid json }');

        await expect(loadConfig()).rejects.toThrow(/Invalid JSON/);
    });

    it('should strip JSONC comments correctly', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            `{
            // This is a line comment
            "serverBaseUrl": "http://localhost:1234", /* block
            comment */
            "stateDir": "./jsonc_state" // another comment
        }`
        );

        const config = await loadConfig();
        expect(config.serverBaseUrl).toBe('http://localhost:1234');
        expect(config.stateDir).toBe(resolve(testDir, './jsonc_state'));
    });

    it('should compute derived dirs correctly', async () => {
        process.env.NEXUS_STATE_DIR = '/tmp/nexus/state';
        const config = await loadConfig();

        expect(config.projectsDir).toBe('/tmp/nexus/state/projects');
        expect(config.runsDir).toBe('/tmp/nexus/state/runs');
        expect(config.logsDir).toBe('/tmp/nexus/state/logs');
    });

    it('should create directories on load', async () => {
        const customState = join(testDir, 'created_state');
        process.env.NEXUS_STATE_DIR = customState;

        expect(existsSync(customState)).toBe(false);

        await loadConfig();

        expect(existsSync(customState)).toBe(true);
        expect(existsSync(join(customState, 'projects'))).toBe(true);
        expect(existsSync(join(customState, 'runs'))).toBe(true);
        expect(existsSync(join(customState, 'logs'))).toBe(true);
    });

    it('should load config file from NEXUS_CONFIG_FILE env var', async () => {
        const customConfigPath = join(testDir, 'custom.config.json');
        writeFileSync(
            customConfigPath,
            JSON.stringify({
                serverBaseUrl: 'http://localhost:7777',
            })
        );

        process.env.NEXUS_CONFIG_FILE = customConfigPath;

        const config = await loadConfig();
        expect(config.serverBaseUrl).toBe('http://localhost:7777');
    });

    it('should convert relative stateDir to absolute', async () => {
        const configPath = join(testDir, 'nexus.config.json');
        writeFileSync(
            configPath,
            JSON.stringify({
                stateDir: 'relative/path',
            })
        );

        const config = await loadConfig();
        expect(config.stateDir).toBe(resolve(testDir, 'relative/path'));
        expect(config.stateDir.startsWith('/')).toBe(true);
    });

    it('should normalize all paths', async () => {
        process.env.NEXUS_STATE_DIR = './foo/../bar/./baz';
        const config = await loadConfig();

        expect(config.stateDir).toBe(resolve(testDir, 'bar/baz'));
    });
});
