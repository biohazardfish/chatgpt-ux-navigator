/// <reference lib="dom" />
import type {Config} from '../config/config.ts';
import {ServerClientError} from './errors.ts';

const CLIENT_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
const MAX_BODY_SNIPPET_LENGTH = 512;
const DEFAULT_TIMEOUT_MS = 60_000;

function ensureServerBaseUrl(value: string): URL {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('serverBaseUrl must be a non-empty string');
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch (error) {
        throw new Error('serverBaseUrl must be an absolute URL');
    }

    if (!/^https?:$/.test(parsed.protocol)) {
        throw new Error('serverBaseUrl must use http or https scheme');
    }

    return parsed;
}

function validateClientId(clientId: string): void {
    if (typeof clientId !== 'string' || !clientId.trim()) {
        throw new Error('clientId must be a non-empty string');
    }
    if (!CLIENT_ID_REGEX.test(clientId)) {
        throw new Error('clientId contains invalid characters');
    }
}

function validateInput(input: string): string {
    if (typeof input !== 'string') {
        throw new Error('input must be a string');
    }
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('input must not be empty');
    }
    return trimmed;
}

function snippetFrom(text: string): string {
    if (!text) return '';
    if (text.length <= MAX_BODY_SNIPPET_LENGTH) return text;
    return text.slice(0, MAX_BODY_SNIPPET_LENGTH);
}

function isJsonContentType(headerValue: string | null): boolean {
    if (!headerValue) return false;
    const mediaType = headerValue.split(';')[0].trim().toLowerCase();
    return mediaType === 'application/json';
}

function buildRequestUrl(base: URL, clientId: string): URL {
    return new URL(`/responses/${clientId}`, base);
}

function extractServerErrorMessage(parsed: Record<string, unknown> | undefined): string | undefined {
    if (!parsed) return undefined;
    const errorValue = parsed.error;
    if (typeof errorValue === 'string') {
        return errorValue;
    }
    if (errorValue && typeof (errorValue as {message?: unknown}).message === 'string') {
        return (errorValue as {message: string}).message;
    }
    if (typeof parsed.message === 'string') {
        return parsed.message;
    }
    return undefined;
}

function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as {name?: string; code?: string};
    const name = err.name?.toLowerCase();
    if (!name) return err.code === 'ABORT_ERR';
    return name === 'aborterror' || name === 'timeouterror' || err.code === 'ABORT_ERR';
}

export type PostPromptParams = {
    clientId: string;
    input: string;
    timeoutMs?: number;
};

export type ServerClient = {
    postPrompt(params: PostPromptParams): Promise<string>;
};

export function createServerClient(config: Config): ServerClient {
    const baseUrl = ensureServerBaseUrl(config.serverBaseUrl);

    return {
        async postPrompt({clientId, input, timeoutMs}: PostPromptParams) {
            validateClientId(clientId);
            const trimmedInput = validateInput(input);

            const requestUrl = buildRequestUrl(baseUrl, clientId);
            const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);

            console.debug('[ServerClient] postPrompt start', {
                clientId,
                inputLength: trimmedInput.length,
            });

            let response: Response | null = null;
            let responseText = '';

            try {
                response = await fetch(requestUrl.toString(), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({input: trimmedInput}),
                    signal: controller.signal,
                });

                responseText = await response.text();
                const contentType = response.headers.get('Content-Type');
                const snippet = snippetFrom(responseText);

                if (!response.ok) {
                    throw new ServerClientError(`HTTP ${response.status} error`, {
                        kind: 'http_error',
                        status: response.status,
                        url: requestUrl.toString(),
                        bodySnippet: snippet,
                    });
                }

                if (!isJsonContentType(contentType)) {
                    const reportedType = contentType ?? 'missing Content-Type';
                    throw new ServerClientError(`Expected JSON response but received ${reportedType}`, {
                        kind: 'invalid_response',
                        status: response.status,
                        url: requestUrl.toString(),
                        bodySnippet: snippet,
                    });
                }

                let parsed: unknown;
                try {
                    parsed = responseText ? JSON.parse(responseText) : {};
                } catch (parseError) {
                    const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
                    throw new ServerClientError(`Invalid JSON response: ${parseMessage}`, {
                        kind: 'invalid_response',
                        status: response.status,
                        url: requestUrl.toString(),
                        bodySnippet: snippet,
                    });
                }

                const parsedValue = parsed as Record<string, unknown>;
                const serverErrorMessage = extractServerErrorMessage(parsedValue);
                if (parsedValue?.status === 'error' || parsedValue?.error) {
                    const message = serverErrorMessage ?? 'Server reported an error';

                    throw new ServerClientError(message, {
                        kind: 'server_error',
                        status: response.status,
                        url: requestUrl.toString(),
                        bodySnippet: snippet,
                    });
                }

                const outputText = parsedValue?.output_text;
                if (typeof outputText !== 'string') {
                    throw new ServerClientError('Missing output_text in server response', {
                        kind: 'server_error',
                        status: response.status,
                        url: requestUrl.toString(),
                        bodySnippet: snippet,
                    });
                }

                console.debug('[ServerClient] postPrompt success', {
                    clientId,
                    inputLength: trimmedInput.length,
                    outputLength: outputText.length,
                });

                return outputText;
            } catch (error) {
                const snippet = responseText ? snippetFrom(responseText) : '';

                if (error instanceof ServerClientError) {
                    console.error('[ServerClient] postPrompt failed', {
                        clientId,
                        error: error.message,
                        status: error.status,
                        url: error.url,
                    });
                    throw error;
                }

                const isTimeout = isAbortError(error);
                const message = isTimeout
                    ? `Request to ${requestUrl.toString()} timed out after ${timeout}ms`
                    : error instanceof Error
                        ? error.message
                        : 'Unknown error';

                const wrappedError = new ServerClientError(message, {
                    kind: isTimeout ? 'timeout' : 'network',
                    status: response?.status,
                    url: requestUrl.toString(),
                    bodySnippet: snippet,
                    cause: error,
                });

                console.error('[ServerClient] postPrompt failed', {
                    clientId,
                    error: wrappedError.message,
                    status: wrappedError.status,
                    url: wrappedError.url,
                });
                throw wrappedError;
            } finally {
                clearTimeout(timer);
            }
        },
    };
}
