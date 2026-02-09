import {describe, expect, test} from 'bun:test';
import {preflightCheckClients} from '../preflight';

function makeConfig(overrides?: Partial<any>) {
    return {
        version: 1,
        server: {url: 'http://localhost:8765', agents_new_chat: true},
        run: {id: 'x', out_dir: 'runs'},
        agents: {
            a: {client_id: 'c1', system: 's1'},
            b: {client_id: 'c2', system: 's2'},
        },
        workflow: {type: 'round_robin', order: ['a', 'b'], start: 'a'},
        delivery: {type: 'next_speaker'},
        seed: {from: 'user', content: 'hi'},
        judge: {enabled: false},
        termination: {max_turns: 2, judge_stop: false},
        ...overrides,
    };
}

describe('preflightCheckClients', () => {
    test('passes when all required client_ids are connected', async () => {
        const config = makeConfig();

        // Stub fetchConnectedClients via global fetch on /clients
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => {
            return new Response(JSON.stringify({clients: ['c1', 'c2']}), {
                headers: {'Content-Type': 'application/json'},
            });
        }) as any;

        try {
            const res = await preflightCheckClients(config as any, {timeoutMs: 50});
            expect(res.required.length).toBe(2);
            expect(res.connected).toEqual(['c1', 'c2']);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('fails when any required client_id is missing', async () => {
        const config = makeConfig({judge: {enabled: true, client_id: 'cj', rubric: 'r'}});

        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async () => {
            return new Response(JSON.stringify({clients: ['c1', 'c2']}), {
                headers: {'Content-Type': 'application/json'},
            });
        }) as any;

        try {
            expect(preflightCheckClients(config as any, {timeoutMs: 50})).rejects.toThrow(
                /Missing required connected client\(s\)/
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
