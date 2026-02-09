/**
 * Fetch connected WebSocket clients from the local @repo/server.
 *
 * Server endpoint: GET /clients -> { clients: string[] }
 */

function joinUrl(base: string, path: string): string {
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
}

export async function fetchConnectedClients(
    serverUrl: string,
    opts?: {timeoutMs?: number}
): Promise<string[]> {
    const timeoutMs = opts?.timeoutMs ?? 3000;
    const url = joinUrl(serverUrl, '/clients');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            const body = await res.text();
            const snippet = body.slice(0, 500);
            throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} ${snippet}`.trim());
        }

        const json = (await res.json()) as unknown;
        if (!json || typeof json !== 'object') {
            throw new Error(`GET ${url} returned non-object JSON`);
        }

        const clients = (json as any).clients as unknown;
        if (!Array.isArray(clients) || !clients.every(c => typeof c === 'string')) {
            throw new Error(`GET ${url} returned invalid shape; expected { clients: string[] }`);
        }

        return clients;
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`GET ${url} timed out after ${timeoutMs}ms`);
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}
