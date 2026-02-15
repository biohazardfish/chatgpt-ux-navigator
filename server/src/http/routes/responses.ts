import type {AppConfig} from '../../config/config';
import {applyPromptTemplate} from '../../prompts/resolveIncludes';
import {getClient, sendToClient} from '../../ws/hub';
import {
    getInflight,
    createInflight,
    inflightTerminate,
    flushSseRawContext,
    emitResponseCompleted,
    emitResponseCreated,
    emitResponseInProgress,
    emitOutputItemAdded,
    emitContentPartAdded,
} from '../responses/inflight';
import {sseResponseHeaders} from '../responses/sse';
import {corsHeaders} from '../cors';
import {debugLog} from '../../logging/debug';
import type {ResponseObject} from '../../types/responses';

/**
 * Extracts the user prompt from the request body.
 * Supports simple strings, OpenAI-like message arrays, and prompt/input fields.
 */
function extractUserPrompt(body: any): string | null {
    if (!body) return null;

    function extractText(content: any): string | null {
        if (!content) return null;

        if (typeof content === 'string') {
            const trimmed = content.trim();
            return trimmed ? trimmed : null;
        }

        if (typeof content === 'object' && typeof content.text === 'string') {
            const trimmed = content.text.trim();
            return trimmed ? trimmed : null;
        }

        if (Array.isArray(content)) {
            const parts: string[] = [];
            for (const part of content) {
                const text = extractText(part);
                if (text) parts.push(text);
            }
            if (parts.length) {
                const joined = parts.join('\n').trim();
                return joined ? joined : null;
            }
        }

        return null;
    }

    const fromMessages = (messages: any): string | null => {
        if (!Array.isArray(messages)) return null;
        const userMessages: string[] = [];

        for (const msg of messages) {
            if (!msg) continue;
            const role = typeof msg.role === 'string' ? msg.role.toLowerCase() : 'user';
            if (role !== 'user') continue;

            const text = extractText(msg.content ?? msg.message ?? msg.text);
            if (text) {
                userMessages.push(text);
            }
        }

        if (userMessages.length === 0) return null;
        return userMessages.join('\n\n').trim() || null;
    };

    if (typeof body.input === 'string' && body.input.trim()) {
        return body.input.trim();
    }

    if (typeof body.prompt === 'string' && body.prompt.trim()) {
        return body.prompt.trim();
    }

    const listPrompt = fromMessages(body.input);
    if (listPrompt) return listPrompt;

    const messagePrompt = fromMessages(body.messages);
    if (messagePrompt) return messagePrompt;

    return null;
}

/**
 * Creates the initial response object structure.
 */
function createResponseObject(id: string, createdAt: number, body: any, prompt: string) {
    return {
        id,
        object: 'response',
        created_at: createdAt,
        status: 'in_progress',
        background: false,
        billing: {payer: 'developer'},
        completed_at: null,
        error: null,
        frequency_penalty: 0.0,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        max_tool_calls: null,
        model: typeof body?.model === 'string' ? body.model : null,
        output: [],
        parallel_tool_calls: true,
        presence_penalty: 0.0,
        previous_response_id: null,
        prompt_cache_key: null,
        prompt_cache_retention: null,
        reasoning: {effort: 'none', summary: null},
        safety_identifier: null,
        service_tier: 'default',
        store: true,
        temperature: typeof body?.temperature === 'number' ? body.temperature : 1.0,
        text: {format: {type: 'text'}, verbosity: 'medium'},
        top_logprobs: 0,
        top_p: typeof body?.top_p === 'number' ? body.top_p : 1.0,
        truncation: 'disabled',
        usage: null,
        user: null,
        metadata: {},
        output_text: '',
        input: prompt,
        meta: {},
    };
}

/**
 * Handles streaming responses (SSE).
 */
type PromptMessageOptions = {
    createTemporaryChat: boolean;
    newChat: boolean;
    messageType?: string;
    clientId?: string;
};

function logResponseRoute(cfg: AppConfig, event: string, meta: Record<string, unknown> = {}) {
    if (!cfg.debug) return;
    debugLog('http.responses', event, meta);
}

function sendPromptToExtension(
    id: string,
    createdAt: number,
    prompt: string,
    opts: PromptMessageOptions
): boolean {
    const {createTemporaryChat, newChat, messageType, clientId} = opts;
    const type = messageType || (createTemporaryChat && newChat ? 'prompt.new' : 'prompt');
    const msg: any = {type, id, created: createdAt, input: prompt};

    if (newChat) {
        msg.newChat = true;
        msg.temporary = !!createTemporaryChat;
    }

    if (clientId) {
        return sendToClient(clientId, msg);
    }
    return false;
}

function handleStreamingResponse(
    cfg: AppConfig,
    id: string,
    createdAt: number,
    prompt: string,
    responseObj: any,
    messageItemId: string,
    timeoutMs: number,
    createTemporaryChat: boolean,
    newChat: boolean,
    messageType: string | undefined,
    clientId?: string
): Response {
    const encoder = new TextEncoder();
    const cors = corsHeaders();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            logResponseRoute(cfg, 'stream_start', {
                id,
                clientId,
                messageType: messageType || 'prompt',
            });
            const timeoutHandle = setTimeout(() => {
                if (!getInflight(clientId)) return;

                logResponseRoute(cfg, 'stream_timeout', {
                    id,
                    clientId,
                    timeoutMs,
                    messageType: messageType || 'prompt',
                });

                emitResponseCompleted(clientId, 'error', {
                    error: 'Timed out waiting for extension SSE',
                });
                flushSseRawContext(clientId, 'stream_timeout', {
                    id,
                    timeoutMs,
                });
                inflightTerminate(clientId, 'response.error', {
                    type: 'response.error',
                    error: {message: 'Timed out waiting for extension SSE'},
                });
            }, timeoutMs);

            if (clientId) {
                const expectsImage = messageType === 'prompt.image';
                createInflight(clientId, {
                    id,
                    createdAt,
                    mode: 'stream',
                    controller,
                    encoder,
                    timeoutHandle,
                    response: responseObj,
                    messageItemId,
                    expectsImage,
                });
                logResponseRoute(cfg, 'inflight_created', {
                    id,
                    clientId,
                    mode: 'stream',
                    expectsImage,
                });
            }

            const ok = sendPromptToExtension(id, createdAt, prompt, {
                createTemporaryChat,
                newChat,
                messageType,
                clientId,
            });
            if (!ok) {
                logResponseRoute(cfg, 'send_prompt_failed', {
                    id,
                    clientId,
                    messageType: messageType || 'prompt',
                });
                emitResponseCompleted(clientId, 'error', {
                    error: 'Failed to send prompt to WS client',
                });
                inflightTerminate(clientId, 'response.error', {
                    type: 'response.error',
                    error: {message: 'Failed to send prompt to WS client'},
                });
                return;
            }

            logResponseRoute(cfg, 'send_prompt_ok', {
                id,
                clientId,
                messageType: messageType || 'prompt',
                newChat,
                createTemporaryChat,
            });

            emitResponseCreated(clientId);
            emitResponseInProgress(clientId);
            emitOutputItemAdded(clientId);
            emitContentPartAdded(clientId);
        },

        cancel() {
            const currentInflight = getInflight(clientId);
            if (currentInflight && currentInflight.id === id) {
                emitResponseCompleted(clientId, 'cancelled', {reason: 'client_disconnected'});
                inflightTerminate(clientId, 'response.cancelled', {
                    type: 'response.cancelled',
                    response_id: id,
                    error: {message: 'Client disconnected'},
                });
            }
        },
    });

    return new Response(stream, {
        status: 200,
        headers: sseResponseHeaders(cors),
    });
}

/**
 * Handles JSON responses (Promise-based).
 */
async function handleJsonResponse(
    cfg: AppConfig,
    id: string,
    createdAt: number,
    prompt: string,
    responseObj: any,
    messageItemId: string,
    timeoutMs: number,
    cors: Record<string, string>,
    createTemporaryChat: boolean,
    newChat: boolean,
    messageType: string | undefined,
    clientId?: string
): Promise<Response> {
    try {
        logResponseRoute(cfg, 'json_start', {id, clientId, messageType: messageType || 'prompt'});
        const result = await new Promise<any>((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                const current = getInflight(clientId);
                if (current && current.id === id) {
                    logResponseRoute(cfg, 'json_timeout', {
                        id,
                        clientId,
                        timeoutMs,
                        messageType: messageType || 'prompt',
                    });
                    emitResponseCompleted(clientId, 'error', {
                        error: 'Timed out waiting for extension SSE',
                    });
                    flushSseRawContext(clientId, 'json_timeout', {
                        id,
                        timeoutMs,
                    });
                    inflightTerminate(clientId, null, null);
                }
                reject(new Error('Timed out waiting for completion'));
            }, timeoutMs);

            if (clientId) {
                const expectsImage = messageType === 'prompt.image';
                createInflight(clientId, {
                    id,
                    createdAt,
                    mode: 'json',
                    controller: null,
                    encoder: null,
                    timeoutHandle,
                    response: responseObj,
                    messageItemId,
                    expectsImage,
                    jsonResolve: resolve,
                    jsonReject: reject,
                });
                logResponseRoute(cfg, 'inflight_created', {
                    id,
                    clientId,
                    mode: 'json',
                    expectsImage,
                });
            }

            const ok = sendPromptToExtension(id, createdAt, prompt, {
                createTemporaryChat,
                newChat,
                messageType,
                clientId,
            });
            if (!ok) {
                logResponseRoute(cfg, 'send_prompt_failed', {
                    id,
                    clientId,
                    messageType: messageType || 'prompt',
                });
                emitResponseCompleted(clientId, 'error', {
                    error: 'Failed to send prompt to WS client',
                });
                inflightTerminate(clientId, null, null);
                reject(new Error('Failed to send prompt to WS client'));
                return;
            }

            logResponseRoute(cfg, 'send_prompt_ok', {
                id,
                clientId,
                messageType: messageType || 'prompt',
                newChat,
                createTemporaryChat,
            });

            emitResponseCreated(clientId);
            emitResponseInProgress(clientId);
            emitOutputItemAdded(clientId);
            emitContentPartAdded(clientId);
        });

        return new Response(JSON.stringify(result, null, 2), {
            status: 200,
            headers: {...cors, 'Content-Type': 'application/json; charset=utf-8'},
        });
    } catch (err) {
        const message = String((err as any)?.message || err || 'Unknown error');
        const errorResponse = {
            ...responseObj,
            status: 'error',
            completed_at: Math.floor(Date.now() / 1000),
            error: {message},
        };
        return new Response(JSON.stringify(errorResponse, null, 2), {
            status: 200,
            headers: {...cors, 'Content-Type': 'application/json; charset=utf-8'},
        });
    }
}

/**
 * Shared implementation details for /responses endpoints.
 */
type ResponseHandlerOptions = {
    createTemporaryChat: boolean;
    newChat: boolean;
    messageType?: string;
    clientId?: string;
};

export async function handleResponsesRequest(
    req: Request,
    cfg: AppConfig,
    url: URL,
    opts: ResponseHandlerOptions
): Promise<Response> {
    const {createTemporaryChat, clientId, newChat, messageType} = opts;
    const cors = corsHeaders();
    logResponseRoute(cfg, 'request_received', {
        clientId,
        path: url.pathname,
        method: req.method,
        messageType: messageType || 'prompt',
        newChat,
        createTemporaryChat,
    });

    // Check inflight for specific clientId (or default if no clientId)
    if (getInflight(clientId)) {
        const clientDisplay = clientId ? `'${clientId}'` : 'default';
        return new Response(
            JSON.stringify({error: `Another request in-flight for client ${clientDisplay}.`}),
            {status: 409, headers: {...cors, 'Content-Type': 'application/json'}}
        );
    }

    // If clientId provided, verify client is connected
    let targetClient: WebSocket | null = null;
    if (clientId) {
        targetClient = getClient(clientId);
        if (!targetClient) {
            return new Response(JSON.stringify({error: `Client '${clientId}' not connected.`}), {
                status: 404,
                headers: {...cors, 'Content-Type': 'application/json'},
            });
        }
    } else {
        return new Response(JSON.stringify({error: 'Client ID is required.'}), {
            status: 400,
            headers: {...cors, 'Content-Type': 'application/json'},
        });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({error: 'Invalid JSON'}), {
            status: 400,
            headers: {...cors, 'Content-Type': 'application/json'},
        });
    }

    const rawPrompt = extractUserPrompt(body);
    if (!rawPrompt) {
        return new Response(
            JSON.stringify({
                error: 'Missing user prompt. Provide {input:"..."} or {input:[{role:"user",content:"..."}]}.',
            }),
            {status: 400, headers: {...cors, 'Content-Type': 'application/json'}}
        );
    }

    const prompt = await applyPromptTemplate(rawPrompt, cfg.filesRoot);

    const requestedStream = body?.stream === true;
    const shouldStream = requestedStream && !cfg.noStream;

    const id = `resp_${crypto.randomUUID()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const messageItemId = `msg_${crypto.randomUUID()}`;
    const timeoutMs = cfg.requestTimeout * 1000; // Convert seconds to milliseconds

    const responseObj = createResponseObject(id, createdAt, body, prompt) as ResponseObject;
    if (messageType === 'prompt.image') {
        responseObj.image_path = null;
    }

    if (shouldStream) {
        return handleStreamingResponse(
            cfg,
            id,
            createdAt,
            prompt,
            responseObj,
            messageItemId,
            timeoutMs,
            createTemporaryChat,
            newChat,
            messageType,
            clientId
        );
    } else {
        return handleJsonResponse(
            cfg,
            id,
            createdAt,
            prompt,
            responseObj,
            messageItemId,
            timeoutMs,
            cors,
            createTemporaryChat,
            newChat,
            messageType,
            clientId
        );
    }
}

export async function handlePostResponsesById(
    req: Request,
    cfg: AppConfig,
    url: URL
): Promise<Response> {
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];

    if (!clientId || clientId.trim() === '') {
        return new Response(JSON.stringify({error: 'Client ID is required in the URL path'}), {
            status: 400,
            headers: {'Content-Type': 'application/json'},
        });
    }

    return await handleResponsesRequest(req, cfg, url, {
        createTemporaryChat: false,
        newChat: false,
        clientId,
    });
}

/**
 * Controller for POST /responses/:id/new (per-client, forces new temporary chat)
 */
export async function handlePostResponsesByIdNew(
    req: Request,
    cfg: AppConfig,
    url: URL
): Promise<Response> {
    const pathParts = url.pathname.split('/');
    pathParts.pop();
    const clientId = pathParts[pathParts.length - 1];

    if (!clientId || clientId.trim() === '') {
        return new Response(JSON.stringify({error: 'Client ID is required in the URL path'}), {
            status: 400,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const temporaryParam = url.searchParams.get('temporary');
    const createTemporaryChat = temporaryParam !== 'false';

    return handleResponsesRequest(req, cfg, url, {
        createTemporaryChat,
        newChat: true,
        clientId,
    });
}
