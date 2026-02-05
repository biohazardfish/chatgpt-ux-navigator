/// <reference lib="dom" />
import {describe, expect, it, beforeEach, afterEach} from 'bun:test';
import type {Config} from '../../src/config/config.ts';
import {createServerClient} from '../../src/server/client.ts';
import {ServerClientError} from '../../src/server/errors.ts';

type FetchFn = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

function createConfig(): Config {
    return {
        serverBaseUrl: 'http://localhost:8765',
        stateDir: '/tmp',
        projectsDir: '/tmp/projects',
        runsDir: '/tmp/runs',
        logsDir: '/tmp/logs',
        logLevel: 'info',
    };
}

describe('ServerClient.postPrompt', () => {
    let originalFetch: FetchFn | undefined;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('rejects empty clientId without calling fetch', async () => {
        const client = createServerClient(createConfig());
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            return new Response('{}', {status: 200});
        }) as FetchFn;

        await expect(client.postPrompt({clientId: '', input: 'prompt'})).rejects.toThrow(/clientId/);
        expect(fetchCalled).toBe(false);
    });

    it('rejects clientId with invalid characters', async () => {
        const client = createServerClient(createConfig());
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            return new Response('{}', {status: 200});
        }) as FetchFn;

        await expect(client.postPrompt({clientId: 'bad id', input: 'prompt'})).rejects.toThrow(/clientId/);
        expect(fetchCalled).toBe(false);
    });

    it('rejects empty input without calling fetch', async () => {
        const client = createServerClient(createConfig());
        let fetchCalled = false;
        globalThis.fetch = (async () => {
            fetchCalled = true;
            return new Response('{}', {status: 200});
        }) as FetchFn;

        await expect(client.postPrompt({clientId: 'client123', input: '   '})).rejects.toThrow(/input/);
        expect(fetchCalled).toBe(false);
    });

    it('returns output_text from successful response', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            return new Response(JSON.stringify({output_text: 'hello', status: 'ok'}), {
                status: 200,
                headers: {'Content-Type': 'application/json; charset=utf-8'},
            });
        }) as FetchFn;

        const output = await client.postPrompt({clientId: 'client123', input: '  hello world  '});
        expect(output).toBe('hello');
    });

    it('uses 60s default timeout when none provided', async () => {
        const client = createServerClient(createConfig());
        let recordedDuration = 0;
        const originalSetTimeout = globalThis.setTimeout;
        globalThis.setTimeout = ((fn: (...args: any[]) => void, duration?: number, ...rest: any[]) => {
            recordedDuration = duration ?? 0;
            return originalSetTimeout(fn, duration, ...rest);
        }) as typeof setTimeout;

        try {
            globalThis.fetch = (async () => {
                return new Response(JSON.stringify({output_text: 'ok', status: 'ok'}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }) as FetchFn;

            await client.postPrompt({clientId: 'client123', input: 'prompt'});
            expect(recordedDuration).toBe(60000);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    it('throws ServerClientError on non-2xx response with status', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            return new Response('Not Found', {status: 404});
        }) as FetchFn;

        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
            throw new Error('expected rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(ServerClientError);
            const serverError = error as ServerClientError;
            expect(serverError.status).toBe(404);
            expect(serverError.url).toBe('http://localhost:8765/responses/client123');
            expect(serverError.bodySnippet).toContain('Not Found');
        }
    });

    it('throws ServerClientError when server returns status error payload', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            return new Response(JSON.stringify({status: 'error', error: {message: 'boom'}}), {
                status: 200,
                headers: {'Content-Type': 'application/json; charset=utf-8'},
            });
        }) as FetchFn;

        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
            throw new Error('expected rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(ServerClientError);
            const serverError = error as ServerClientError;
            expect(serverError.kind).toBe('server_error');
            expect(serverError.bodySnippet).toContain('boom');
            expect(serverError.message).toContain('boom');
        }
    });

    it('throws invalid_response when body is malformed JSON', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            return new Response('{"output_text":"hello",}', {
                status: 200,
                headers: {'Content-Type': 'application/json; charset=utf-8'},
            });
        }) as FetchFn;

        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
            throw new Error('expected rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(ServerClientError);
            const serverError = error as ServerClientError;
            expect(serverError.kind).toBe('invalid_response');
            expect(serverError.message).toContain('Invalid JSON response');
            expect(serverError.message).toMatch(/JSON Parse error/);
            expect(serverError.bodySnippet).toContain('output_text');
        }
    });

    it('throws invalid_response when Content-Type is not JSON', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            return new Response('plain text body', {
                status: 200,
                headers: {'Content-Type': 'text/plain'},
            });
        }) as FetchFn;

        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
            throw new Error('expected rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(ServerClientError);
            const serverError = error as ServerClientError;
            expect(serverError.kind).toBe('invalid_response');
            expect(serverError.message).toContain('Expected JSON response');
            expect(serverError.bodySnippet).toContain('plain text body');
        }
    });

    it('rethrows timeout errors as ServerClientError with kind timeout', async () => {
        const client = createServerClient(createConfig());
        globalThis.fetch = (async () => {
            const timeoutError = new Error('aborted');
            (timeoutError as any).name = 'AbortError';
            throw timeoutError;
        }) as FetchFn;

        let caught: unknown;
        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(ServerClientError);
        const serverError = caught as ServerClientError;
        expect(serverError.kind).toBe('timeout');
        expect(serverError.message).toContain('timed out');
    });

    it('throws ServerClientError kind network when fetch rejects', async () => {
        const client = createServerClient(createConfig());
        const underlying = new Error('network down');
        globalThis.fetch = (async () => {
            throw underlying;
        }) as FetchFn;

        let caught: unknown;
        try {
            await client.postPrompt({clientId: 'client123', input: 'prompt'});
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(ServerClientError);
        const serverError = caught as ServerClientError;
        expect(serverError.kind).toBe('network');
        expect(serverError.cause).toBe(underlying);
        expect(serverError.message).toBe('network down');
    });
});
