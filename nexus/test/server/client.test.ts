/// <reference lib="dom" />
import {describe, expect, it, beforeEach, afterEach} from 'bun:test';
import type {Config} from '../../src/config/config.ts';
import {createServerClient} from '../../src/server/client.ts';
import {ServerClientError} from '../../src/server/errors.ts';

type FetchFn = typeof globalThis.fetch;
type MockFetchFn = (
    input: Parameters<FetchFn>[0],
    init?: Parameters<FetchFn>[1]
) => ReturnType<FetchFn>;

function toFetchFn(mock: MockFetchFn, baseFetch: FetchFn): FetchFn {
    return Object.assign(mock, {
        preconnect: baseFetch.preconnect.bind(baseFetch),
    });
}

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

describe('server client', () => {
    describe('ServerClient.postPrompt', () => {
        let originalFetch: FetchFn;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('rejects empty clientId without calling fetch', async () => {
            const client = createServerClient(createConfig());
            let fetchCalled = false;
            globalThis.fetch = toFetchFn(async () => {
                fetchCalled = true;
                return new Response('{}', {status: 200});
            }, originalFetch);

            await expect(client.postPrompt({clientId: '', input: 'prompt'})).rejects.toThrow(
                /clientId/
            );
            expect(fetchCalled).toBe(false);
        });

        it('rejects clientId with invalid characters', async () => {
            const client = createServerClient(createConfig());
            let fetchCalled = false;
            globalThis.fetch = toFetchFn(async () => {
                fetchCalled = true;
                return new Response('{}', {status: 200});
            }, originalFetch);

            await expect(client.postPrompt({clientId: 'bad id', input: 'prompt'})).rejects.toThrow(
                /clientId/
            );
            expect(fetchCalled).toBe(false);
        });

        it('rejects empty input without calling fetch', async () => {
            const client = createServerClient(createConfig());
            let fetchCalled = false;
            globalThis.fetch = toFetchFn(async () => {
                fetchCalled = true;
                return new Response('{}', {status: 200});
            }, originalFetch);

            await expect(client.postPrompt({clientId: 'client123', input: '   '})).rejects.toThrow(
                /input/
            );
            expect(fetchCalled).toBe(false);
        });

        it('returns output_text from successful response', async () => {
            const client = createServerClient(createConfig());
            globalThis.fetch = toFetchFn(async () => {
                return new Response(JSON.stringify({output_text: 'hello', status: 'ok'}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }, originalFetch);

            const output = await client.postPrompt({
                clientId: 'client123',
                input: '  hello world  ',
            });
            expect(output).toBe('hello');
        });

        it('uses 60s default timeout when none provided', async () => {
            const client = createServerClient(createConfig());
            let recordedDuration = 0;
            const originalSetTimeout = globalThis.setTimeout;
            globalThis.setTimeout = ((
                fn: (...args: any[]) => void,
                duration?: number,
                ...rest: any[]
            ) => {
                recordedDuration = duration ?? 0;
                return originalSetTimeout(fn, duration, ...rest);
            }) as typeof setTimeout;

            try {
                globalThis.fetch = toFetchFn(async () => {
                    return new Response(JSON.stringify({output_text: 'ok', status: 'ok'}), {
                        status: 200,
                        headers: {'Content-Type': 'application/json; charset=utf-8'},
                    });
                }, originalFetch);

                await client.postPrompt({clientId: 'client123', input: 'prompt'});
                expect(recordedDuration).toBe(60000);
            } finally {
                globalThis.setTimeout = originalSetTimeout;
            }
        });

        it('throws ServerClientError on non-2xx response with status', async () => {
            const client = createServerClient(createConfig());
            globalThis.fetch = toFetchFn(async () => {
                return new Response('Not Found', {status: 404});
            }, originalFetch);

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
            globalThis.fetch = toFetchFn(async () => {
                return new Response(JSON.stringify({status: 'error', error: {message: 'boom'}}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }, originalFetch);

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
            globalThis.fetch = toFetchFn(async () => {
                return new Response('{"output_text":"hello",}', {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }, originalFetch);

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
            globalThis.fetch = toFetchFn(async () => {
                return new Response('plain text body', {
                    status: 200,
                    headers: {'Content-Type': 'text/plain'},
                });
            }, originalFetch);

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
            globalThis.fetch = toFetchFn(async () => {
                const timeoutError = new Error('aborted');
                Object.defineProperty(timeoutError, 'name', {value: 'AbortError'});
                throw timeoutError;
            }, originalFetch);

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
            globalThis.fetch = toFetchFn(async () => {
                throw underlying;
            }, originalFetch);

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

    describe('ServerClient.listClients', () => {
        let originalFetch: FetchFn;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('returns clients array from successful response', async () => {
            const client = createServerClient(createConfig());
            globalThis.fetch = toFetchFn(async () => {
                return new Response(JSON.stringify({clients: ['planner', 'reviewer']}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                });
            }, originalFetch);

            const clients = await client.listClients();
            expect(clients).toEqual(['planner', 'reviewer']);
        });

        it('throws ServerClientError on non-2xx response', async () => {
            const client = createServerClient(createConfig());
            globalThis.fetch = toFetchFn(async () => {
                return new Response('oops', {status: 500});
            }, originalFetch);

            try {
                await client.listClients();
                throw new Error('expected rejection');
            } catch (error) {
                expect(error).toBeInstanceOf(ServerClientError);
                const serverError = error as ServerClientError;
                expect(serverError.kind).toBe('http_error');
                expect(serverError.status).toBe(500);
                expect(serverError.url).toBe('http://localhost:8765/clients');
                expect(serverError.bodySnippet).toContain('oops');
            }
        });
    });

    describe('ServerClient.postPromptNew', () => {
        let originalFetch: FetchFn;

        beforeEach(() => {
            originalFetch = globalThis.fetch;
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('posts to /responses/:clientId/new and returns output_text', async () => {
            const client = createServerClient(createConfig());
            let seenUrl = '';

            globalThis.fetch = toFetchFn(async input => {
                seenUrl = typeof input === 'string' ? input : input.toString();
                return new Response(JSON.stringify({output_text: 'hello', status: 'ok'}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }, originalFetch);

            const output = await client.postPromptNew({clientId: 'client123', input: 'prompt'});
            expect(output).toBe('hello');
            expect(seenUrl).toBe('http://localhost:8765/responses/client123/new');
        });

        it('throws ServerClientError when server returns status error payload', async () => {
            const client = createServerClient(createConfig());
            globalThis.fetch = toFetchFn(async () => {
                return new Response(JSON.stringify({status: 'error', error: {message: 'boom'}}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json; charset=utf-8'},
                });
            }, originalFetch);

            try {
                await client.postPromptNew({clientId: 'client123', input: 'prompt'});
                throw new Error('expected rejection');
            } catch (error) {
                expect(error).toBeInstanceOf(ServerClientError);
                const serverError = error as ServerClientError;
                expect(serverError.kind).toBe('server_error');
                expect(serverError.bodySnippet).toContain('boom');
                expect(serverError.message).toContain('boom');
            }
        });
    });
});
