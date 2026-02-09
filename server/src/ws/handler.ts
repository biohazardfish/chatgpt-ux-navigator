import type {ServerWebSocket} from 'bun';
import type {WsData} from '../types/ws';
import type {AppConfig} from '../config/config';
import {setClient, removeClient, getClient} from './hub';
import {safeParseJson} from './parse';
import {extractTextUpdateFromChatGPTPayload, computeDelta} from './extract';
import {
    getInflight,
    inflightTerminate,
    emitResponseCompleted,
    emitOutputTextDelta,
    emitOutputTextDone,
    emitContentPartDone,
    emitOutputItemDone,
    emitGenericEvent,
} from '../http/responses/inflight';
import {sanitizeAssistantText} from '../http/responses/sanitize';

export function createWebSocketHandlers(cfg: AppConfig) {
    return {
        open(ws: ServerWebSocket<WsData>) {
            const clientId = ws.data.clientId;
            if (!clientId) {
                ws.close();
                return;
            }
            setClient(clientId, ws as unknown as WebSocket);
            ws.send(JSON.stringify({type: 'welcome', at: Date.now()}));
        },

        message(ws: ServerWebSocket<WsData>, message: string | Uint8Array) {
            const text =
                typeof message === 'string'
                    ? message
                    : Buffer.from(message as Uint8Array).toString('utf8');

            const obj = safeParseJson(text);
            if (!obj) {
                console.log('[ws] non-json message:', text.slice(0, 300));
                return;
            }

            const t = String(obj.type || '');
            const clientId = ws.data.clientId;

            const inflight = getInflight(clientId);

            if (inflight) {
                if (t === 'sse') {
                    const upd = extractTextUpdateFromChatGPTPayload(obj);

                    if (upd && typeof upd.text === 'string' && upd.text.length > 0) {
                        if (upd.mode === 'full') {
                            const fullText = upd.text;
                            const delta = computeDelta(fullText, inflight.lastText);

                            if (delta) {
                                inflight.lastText = fullText;
                                inflight.response.output_text = sanitizeAssistantText(fullText);
                                emitOutputTextDelta(clientId, delta);
                            }
                        } else {
                            const delta = upd.text;
                            inflight.lastText = (inflight.lastText || '') + delta;
                            inflight.response.output_text = sanitizeAssistantText(
                                inflight.lastText
                            );
                            emitOutputTextDelta(clientId, delta);
                        }
                    } else {
                        if (cfg.debugEvents) {
                            emitGenericEvent(clientId, obj);
                        }
                    }
                } else if (t === 'done') {
                    const full = typeof inflight.lastText === 'string' ? inflight.lastText : '';
                    const sanitized = sanitizeAssistantText(full);
                    inflight.response.output_text = sanitized;
                    emitOutputTextDone(clientId, sanitized);
                    emitContentPartDone(clientId, sanitized);
                    emitOutputItemDone(clientId, sanitized);

                    emitResponseCompleted(clientId, 'completed');
                    inflightTerminate(clientId, null, null);
                    return;
                } else if (t === 'closed') {
                    const full = typeof inflight.lastText === 'string' ? inflight.lastText : '';
                    const sanitized = sanitizeAssistantText(full);

                    // If we receive a 'closed' event immediately after creating the inflight (within 2 seconds)
                    // and there's no content yet, this is likely a race condition from page navigation.
                    // Don't complete the request - let it timeout or wait for actual content.
                    const inflightAge = Date.now() / 1000 - inflight.createdAt;
                    if (sanitized.length === 0 && inflightAge < 2) {
                        return;
                    }

                    inflight.response.output_text = sanitized;
                    emitOutputTextDone(clientId, sanitized);
                    emitContentPartDone(clientId, sanitized);
                    emitOutputItemDone(clientId, sanitized);

                    emitResponseCompleted(clientId, 'completed', {reason: 'stream_closed'});
                    inflightTerminate(clientId, null, null);
                    return;
                } else if (t === 'error') {
                    emitResponseCompleted(clientId, 'error', {reason: 'extension_error'});
                    inflightTerminate(clientId, 'response.error', {
                        type: 'response.error',
                        error: {message: 'Extension reported error', detail: obj},
                    });
                    return;
                } else {
                    if (cfg.debugEvents) {
                        emitGenericEvent(clientId, obj);
                    }
                }
            }
        },

        close(ws: ServerWebSocket<WsData>) {
            const clientId = ws.data.clientId;
            if (clientId) {
                removeClient(clientId);
            }
            const inflight = getInflight(clientId);
            if (inflight) {
                emitResponseCompleted(clientId, 'error', {error: 'WebSocket closed'});
                inflightTerminate(clientId, 'response.error', {
                    type: 'response.error',
                    error: {message: 'WebSocket closed'},
                });
            }
        },
    };
}
