import type {ApiMessage, ApiRequest} from '../types';

export function buildResponsesEndpoint(serverUrl: string, clientId: string): string {
    const parsed = new URL(serverUrl);
    const pathPrefix = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${pathPrefix}/responses/${encodeURIComponent(clientId)}`;
    parsed.search = '';
    return parsed.toString();
}

export function buildResponsesNewThreadEndpoint(serverUrl: string, clientId: string): string {
    const parsed = new URL(serverUrl);
    const pathPrefix = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = `${pathPrefix}/responses/${encodeURIComponent(clientId)}/new`;
    parsed.search = '';
    return parsed.toString();
}

export function formatHttpError(status: number, body: string, clientId: string): string {
    const snippet = body.trim().slice(0, 500) || '<empty response body>';
    if (status === 404) {
        return `server returned 404 (client '${clientId}' is not connected). Open ChatGPT tab with extension and retry. Body: ${snippet}`;
    }
    if (status === 409) {
        return `server returned 409 (client '${clientId}' has an in-flight request). Wait for completion and retry. Body: ${snippet}`;
    }
    return `server returned ${status}. Body: ${snippet}`;
}

export function extractTextFromResponse(json: any): string {
    if (!Array.isArray(json?.output)) {
        throw new Error('Invalid API response: missing output[]');
    }

    const texts: string[] = [];

    for (const item of json.output) {
        if (!Array.isArray(item?.content)) {
            continue;
        }
        for (const block of item.content) {
            if (typeof block?.text === 'string') {
                texts.push(block.text);
            }
        }
    }

    const output = texts.join('').trim();
    if (!output) {
        throw new Error('No text found in output[].content[].text');
    }

    return output;
}

export async function postResponses(
    serverUrl: string,
    messages: ApiMessage[],
    clientId: string,
    timeoutMs: number
): Promise<string> {
    const endpoint = buildResponsesEndpoint(serverUrl, clientId);
    return postResponsesToEndpoint(endpoint, messages, clientId, timeoutMs);
}

export async function postResponsesNewThread(
    serverUrl: string,
    messages: ApiMessage[],
    clientId: string,
    timeoutMs: number
): Promise<string> {
    const endpoint = buildResponsesNewThreadEndpoint(serverUrl, clientId);
    return postResponsesToEndpoint(endpoint, messages, clientId, timeoutMs);
}

async function postResponsesToEndpoint(
    endpoint: string,
    messages: ApiMessage[],
    clientId: string,
    timeoutMs: number
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const body: ApiRequest = {input: messages};

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(formatHttpError(res.status, errorText, clientId));
        }

        const json = await res.json();
        return extractTextFromResponse(json);
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

export async function postAction(
    url: string,
    label: string,
    timeoutMs: number,
    clientId: string,
    body?: unknown
): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const init: RequestInit = {
            method: 'POST',
            signal: controller.signal,
        };

        if (body !== undefined) {
            init.headers = {'Content-Type': 'application/json'};
            init.body = JSON.stringify(body);
        }

        const res = await fetch(url, init);
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`${label} failed: ${formatHttpError(res.status, text, clientId)}`);
        }
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}
