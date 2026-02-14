import {sseFrame} from './sse';
import type {ResponseObject} from '../../types/responses';
import {parseToolCallsFromText} from '../../prompts/parser';
import {sanitizeAssistantText} from './sanitize';
import {debugSummary, debugRaw} from '../../logging/debug';

type InflightMode = 'stream' | 'json';

type SseStats = {
    totalFrames: number;
    textFrames: number;
    patchFrames: number;
    noopFrames: number;
    sampledRawFrames: number;
    startedAtMs: number;
};

export type InflightResponses = {
    id: string;
    createdAt: number; // unix seconds
    mode: InflightMode;

    controller: ReadableStreamDefaultController<Uint8Array> | null;
    encoder: TextEncoder | null;

    closed: boolean;
    timeoutHandle: any;

    // OpenAI-like response bookkeeping
    response: ResponseObject;

    // Output item + content part bookkeeping
    messageItemId: string; // msg_...
    outputIndex: number; // usually 0
    contentIndex: number; // usually 0

    // Sequence numbering for SSE
    sequenceNumber: number;

    // Used to compute deltas from ChatGPT growing text
    lastText: string;

    // For JSON (non-stream) mode
    jsonResolve: ((resp: ResponseObject) => void) | null;
    jsonReject: ((err: Error) => void) | null;

    // Image generation bookkeeping
    expectsImage: boolean;
    waitingForImage: boolean;
    imageWaitHandle: any;

    // SSE diagnostics
    sseStats: SseStats;
    sseRawContext: Array<Record<string, unknown>>;

};

// --- Multi-client inflight tracking: Map of clientId -> InflightResponses ---
const inflights = new Map<string, InflightResponses>();
const defaultClientId = '__default__';

function logInflight(event: string, meta: Record<string, unknown> = {}) {
    debugSummary('http.inflight', event, meta);
}

function elapsedMs(inflight: InflightResponses): number {
    return Math.max(0, Date.now() - inflight.sseStats.startedAtMs);
}

function summarizeStats(inflight: InflightResponses): Record<string, unknown> {
    return {
        totalFrames: inflight.sseStats.totalFrames,
        textFrames: inflight.sseStats.textFrames,
        patchFrames: inflight.sseStats.patchFrames,
        noopFrames: inflight.sseStats.noopFrames,
        sampledRawFrames: inflight.sseStats.sampledRawFrames,
        durationMs: elapsedMs(inflight),
    };
}

export function getInflight(clientId?: string): InflightResponses | null {
    const id = clientId || defaultClientId;
    return inflights.get(id) || null;
}

export function createInflight(
    clientIdOrParams:
        | string
        | {
              id: string;
              createdAt: number;
              mode: InflightMode;
              controller: ReadableStreamDefaultController<Uint8Array> | null;
              encoder: TextEncoder | null;
              timeoutHandle: any;
              response: ResponseObject;
              messageItemId: string;
              expectsImage?: boolean;
              jsonResolve?: ((resp: ResponseObject) => void) | null;
              jsonReject?: ((err: Error) => void) | null;
          },
    params?: {
        id: string;
        createdAt: number;
        mode: InflightMode;
        controller: ReadableStreamDefaultController<Uint8Array> | null;
        encoder: TextEncoder | null;
        timeoutHandle: any;
        response: ResponseObject;
        messageItemId: string;
        expectsImage?: boolean;
        jsonResolve?: ((resp: ResponseObject) => void) | null;
        jsonReject?: ((err: Error) => void) | null;
    }
) {
    let clientId: string;
    let config: {
        id: string;
        createdAt: number;
        mode: InflightMode;
        controller: ReadableStreamDefaultController<Uint8Array> | null;
        encoder: TextEncoder | null;
        timeoutHandle: any;
        response: ResponseObject;
        messageItemId: string;
        expectsImage?: boolean;
        jsonResolve?: ((resp: ResponseObject) => void) | null;
        jsonReject?: ((err: Error) => void) | null;
    };

    if (typeof clientIdOrParams === 'string') {
        clientId = clientIdOrParams;
        config = params!;
    } else {
        clientId = defaultClientId;
        config = clientIdOrParams;
    }

    const inflight: InflightResponses = {
        id: config.id,
        createdAt: config.createdAt,
        mode: config.mode,
        controller: config.controller,
        encoder: config.encoder,
        timeoutHandle: config.timeoutHandle,
        response: config.response,
        messageItemId: config.messageItemId,

        closed: false,
        outputIndex: 0,
        contentIndex: 0,
        sequenceNumber: 0,
        lastText: '',

        jsonResolve: config.jsonResolve ?? null,
        jsonReject: config.jsonReject ?? null,
        expectsImage: config.expectsImage ?? false,
        waitingForImage: false,
        imageWaitHandle: null,
        sseStats: {
            totalFrames: 0,
            textFrames: 0,
            patchFrames: 0,
            noopFrames: 0,
            sampledRawFrames: 0,
            startedAtMs: Date.now(),
        },
        sseRawContext: [],
    };
    inflights.set(clientId, inflight);
    logInflight('created', {
        clientId,
        id: inflight.id,
        mode: inflight.mode,
        expectsImage: inflight.expectsImage,
    });
    return inflight;
}

function nextSeq(clientId?: string): number {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return 0;
    const n = inflight.sequenceNumber;
    inflight.sequenceNumber += 1;
    return n;
}

function canStream(clientId?: string): boolean {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    return !!inflight && inflight.mode === 'stream' && !!inflight.controller && !!inflight.encoder;
}

function safeEnqueue(frame: string, clientId?: string) {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight || inflight.closed) return;
    if (!canStream(clientId)) return;

    try {
        inflight.controller!.enqueue(inflight.encoder!.encode(frame));
    } catch {
        inflightTerminate(
            'response.error',
            {
                type: 'response.error',
                error: {message: 'Failed to enqueue SSE chunk'},
                sequence_number: nextSeq(clientId),
            },
            clientId
        );
    }
}

export function inflightEnqueue(eventOrClientId: string, dataOrEvent?: any, data?: any) {
    let clientId: string | undefined;
    let event: string;
    let eventData: any;

    if (typeof dataOrEvent === 'object' && data === undefined) {
        clientId = undefined;
        event = eventOrClientId;
        eventData = dataOrEvent;
    } else {
        clientId = eventOrClientId;
        event = dataOrEvent;
        eventData = data;
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight || inflight.closed) return;
    if (!canStream(clientId)) return;
    safeEnqueue(sseFrame(event, eventData), clientId);
}

export function inflightTerminate(
    finalEventOrClientId?: string | null,
    finalDataOrEvent?: any,
    clientIdOrFinalData?: any
) {
    let clientId: string | undefined;
    let finalEvent: string | null;
    let finalData: any;

    if (
        typeof finalEventOrClientId === 'string' &&
        clientIdOrFinalData !== undefined &&
        finalEventOrClientId !== defaultClientId
    ) {
        clientId = finalEventOrClientId;
        finalEvent = typeof finalDataOrEvent === 'string' ? finalDataOrEvent : null;
        finalData = clientIdOrFinalData;
    } else {
        clientId = undefined;
        finalEvent = finalEventOrClientId || null;
        finalData = finalDataOrEvent;
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight || inflight.closed) return;
    logInflight('terminate_called', {
        clientId: id,
        id: inflight.id,
        mode: inflight.mode,
        finalEvent,
        hasFinalData: finalData != null,
    });
    inflight.closed = true;

    try {
        clearTimeout(inflight.timeoutHandle);
    } catch {}

    try {
        clearTimeout(inflight.imageWaitHandle);
    } catch {}

    if (inflight.mode === 'stream') {
        if (finalEvent && finalData != null) {
            try {
                inflight.controller?.enqueue(
                    inflight.encoder!.encode(sseFrame(finalEvent, finalData))
                );
            } catch {}
        }

        try {
            inflight.controller?.enqueue(inflight.encoder!.encode(sseFrame(null, '[DONE]')));
        } catch {}

        try {
            inflight.controller?.close();
        } catch {}

        logInflight('terminated', {
            clientId: id,
            id: inflight.id,
            mode: inflight.mode,
            ...summarizeStats(inflight),
        });
        inflights.delete(id);
        return;
    }

    const resolve = inflight.jsonResolve;
    const resp = inflight.response;

    inflight.jsonResolve = null;
    inflight.jsonReject = null;

    inflights.delete(id);
    logInflight('terminated', {
        clientId: id,
        id: inflight.id,
        mode: inflight.mode,
        ...summarizeStats(inflight),
    });

    try {
        resolve?.(resp);
    } catch {}
}

export function emitResponseCreated(clientId?: string) {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflightEnqueue(id, 'response.created', {
        type: 'response.created',
        response: inflight.response,
        sequence_number: nextSeq(clientId),
    });
}

export function emitResponseInProgress(clientId?: string) {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflightEnqueue(id, 'response.in_progress', {
        type: 'response.in_progress',
        response: inflight.response,
        sequence_number: nextSeq(clientId),
    });
}

export function emitOutputItemAdded(clientId?: string) {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    const item: any = {
        id: inflight.messageItemId,
        type: 'message',
        status: 'in_progress',
        content: [],
        role: 'assistant',
    };

    inflight.response.output = inflight.response.output || [];
    inflight.response.output.push(item);

    inflightEnqueue(id, 'response.output_item.added', {
        type: 'response.output_item.added',
        item,
        output_index: inflight.outputIndex,
        sequence_number: nextSeq(clientId),
    });
}

export function emitContentPartAdded(clientId?: string) {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    const part: any = {
        type: 'output_text',
        annotations: [],
        logprobs: [],
        text: '',
    };

    const out0: any = inflight.response.output?.[inflight.outputIndex];
    if (out0 && Array.isArray(out0.content)) {
        out0.content.push(part);
    }

    inflightEnqueue(id, 'response.content_part.added', {
        type: 'response.content_part.added',
        content_index: inflight.contentIndex,
        item_id: inflight.messageItemId,
        output_index: inflight.outputIndex,
        part,
        sequence_number: nextSeq(clientId),
    });
}

export function emitOutputTextDelta(clientIdOrDelta: string | undefined, delta?: string) {
    let clientId: string | undefined;
    let text: string;

    if (typeof delta === 'string') {
        clientId = clientIdOrDelta;
        text = sanitizeAssistantText(delta);
    } else {
        clientId = undefined;
        text = sanitizeAssistantText(clientIdOrDelta || '');
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflightEnqueue(id, 'response.output_text.delta', {
        type: 'response.output_text.delta',
        content_index: inflight.contentIndex,
        delta: text,
        item_id: inflight.messageItemId,
        logprobs: [],
        output_index: inflight.outputIndex,
        sequence_number: nextSeq(clientId),
    });
}

export function emitOutputTextDone(clientIdOrText: string | undefined, fullText?: string) {
    let clientId: string | undefined;
    let text: string;

    if (typeof fullText === 'string') {
        clientId = clientIdOrText;
        text = fullText;
    } else {
        clientId = undefined;
        text = clientIdOrText || '';
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflightEnqueue(id, 'response.output_text.done', {
        type: 'response.output_text.done',
        content_index: inflight.contentIndex,
        item_id: inflight.messageItemId,
        logprobs: [],
        output_index: inflight.outputIndex,
        sequence_number: nextSeq(clientId),
        text: text,
    });
}

export function emitContentPartDone(clientIdOrText: string | undefined, fullText?: string) {
    let clientId: string | undefined;
    let text: string;

    if (typeof fullText === 'string') {
        clientId = clientIdOrText;
        text = fullText;
    } else {
        clientId = undefined;
        text = clientIdOrText || '';
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    const part: any = {
        type: 'output_text',
        annotations: [],
        logprobs: [],
        text: text,
    };

    inflightEnqueue(id, 'response.content_part.done', {
        type: 'response.content_part.done',
        content_index: inflight.contentIndex,
        item_id: inflight.messageItemId,
        output_index: inflight.outputIndex,
        part,
        sequence_number: nextSeq(clientId),
    });
}

export function emitOutputItemDone(clientIdOrText: string | undefined, fullText?: string) {
    let clientId: string | undefined;
    let text: string;

    if (typeof fullText === 'string') {
        clientId = clientIdOrText;
        text = fullText;
    } else {
        clientId = undefined;
        text = clientIdOrText || '';
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    const {text: cleanText, tool_calls} = parseToolCallsFromText(text);
    const sanitizedText = sanitizeAssistantText(cleanText);

    const item: any = {
        id: inflight.messageItemId,
        type: 'message',
        status: 'completed',
        content: [
            {
                type: 'output_text',
                annotations: [],
                logprobs: [],
                text: sanitizedText,
            },
        ],
        role: 'assistant',
    };

    if (tool_calls && tool_calls.length > 0) {
        item.tool_calls = tool_calls;
    }

    if (Array.isArray(inflight.response.output)) {
        inflight.response.output[inflight.outputIndex] = item;
    } else {
        inflight.response.output = [item];
    }

    inflightEnqueue(id, 'response.output_item.done', {
        type: 'response.output_item.done',
        item,
        output_index: inflight.outputIndex,
        sequence_number: nextSeq(clientId),
    });
}

export function emitResponseCompleted(clientIdOrStatus?: string, statusOrExtra?: any, extra?: any) {
    let clientId: string | undefined;
    let status: ResponseObject['status'];
    let extraData: any;
    const isResponseStatus = (value: unknown): value is ResponseObject['status'] =>
        value === 'error' || value === 'in_progress' || value === 'completed' || value === 'cancelled';

    // Helper to determine if the first argument is a status string (global mode)
    // or a client ID (specific mode).
    // Statuses are limited, but Client IDs can be anything.
    // However, looking at usage signatures:
    // 1. (status) -> statusOrExtra is undefined
    // 2. (status, extra) -> statusOrExtra is object
    // 3. (clientId, status) -> statusOrExtra is string
    // 4. (clientId, status, extra) -> extra is defined

    if (extra !== undefined) {
        // Case 4
        clientId = clientIdOrStatus;
        status = isResponseStatus(statusOrExtra) ? statusOrExtra : 'error';
        extraData = extra;
    } else if (typeof statusOrExtra === 'string') {
        // Case 3
        clientId = clientIdOrStatus;
        status = isResponseStatus(statusOrExtra) ? statusOrExtra : 'error';
        extraData = undefined;
    } else {
        // Case 1 or 2
        clientId = undefined;
        status = isResponseStatus(clientIdOrStatus) ? clientIdOrStatus : 'error';
        extraData = statusOrExtra;
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflight.response.status = status;
    logInflight('response_completed_event', {
        clientId: id,
        id: inflight.id,
        status,
    });

    if (status !== 'in_progress') {
        inflight.response.completed_at = Math.floor(Date.now() / 1000);
    }

    if (typeof inflight.lastText === 'string' && inflight.lastText.trim().length > 0) {
        const {text: cleanText} = parseToolCallsFromText(inflight.lastText);
        const sanitized = sanitizeAssistantText(cleanText);
        if (sanitized.length > 0) {
            inflight.response.output_text = sanitized;
        }
    }

    if (extraData) {
        inflight.response.meta = {...(inflight.response.meta || {}), ...extraData};
    }

    inflightEnqueue(id, 'response.completed', {
        type: 'response.completed',
        response: inflight.response,
        sequence_number: nextSeq(clientId),
    });
}

export function emitGenericEvent(clientIdOrObj?: string, rawObj?: any) {
    let clientId: string | undefined;
    let obj: any;

    if (typeof clientIdOrObj === 'object' && rawObj === undefined) {
        clientId = undefined;
        obj = clientIdOrObj;
    } else {
        clientId = clientIdOrObj;
        obj = rawObj;
    }

    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflightEnqueue(id, 'response.event', {
        type: 'response.event',
        response_id: inflight.id,
        raw: obj,
        sequence_number: nextSeq(clientId),
    });
}

export function trackSseFrame(
    clientId: string | undefined,
    frame: {
        hasText: boolean;
        isPatch: boolean;
        sampledRaw: boolean;
    }
): void {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflight.sseStats.totalFrames += 1;
    if (frame.hasText) {
        inflight.sseStats.textFrames += 1;
    } else {
        inflight.sseStats.noopFrames += 1;
    }

    if (frame.isPatch) {
        inflight.sseStats.patchFrames += 1;
    }

    if (frame.sampledRaw) {
        inflight.sseStats.sampledRawFrames += 1;
    }
}

export function pushSseRawContext(clientId: string | undefined, context: Record<string, unknown>): void {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    inflight.sseRawContext.push({
        at: new Date().toISOString(),
        ...context,
    });

    if (inflight.sseRawContext.length > 50) {
        inflight.sseRawContext.shift();
    }
}

export function flushSseRawContext(
    clientId: string | undefined,
    reason: string,
    extra: Record<string, unknown> = {}
): void {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight || inflight.sseRawContext.length === 0) return;

    debugRaw(
        'sse.raw',
        'error_context',
        {
            clientId: id,
            responseId: inflight.id,
            reason,
            contextSize: inflight.sseRawContext.length,
            context: inflight.sseRawContext,
            ...extra,
        },
        {force: true}
    );
}

export function clearSseRawContext(clientId: string | undefined): void {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;
    inflight.sseRawContext = [];
}

export function emitSseRollup(clientId: string | undefined): void {
    const id = clientId || defaultClientId;
    const inflight = inflights.get(id);
    if (!inflight) return;

    debugSummary('sse.summary', 'stream_rollup', {
        clientId: id,
        responseId: inflight.id,
        ...summarizeStats(inflight),
    });
}
