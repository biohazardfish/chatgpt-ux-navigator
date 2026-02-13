import type {ServerWebSocket} from 'bun';
import type {WsData} from '../types/ws';
import type {AppConfig} from '../config/config';
import {setClient, removeClient} from './hub';
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
import {
    saveGeneratedImage,
} from '../http/images/capture';

export function createWebSocketHandlers(cfg: AppConfig) {
    function logWs(event: string, meta: Record<string, unknown> = {}) {
        if (!cfg.debugLogs) return;
        console.log('[ws][responses]', event, JSON.stringify(meta));
    }

    function completeAndTerminate(clientId: string, reason?: {reason: string}) {
        const inflight = getInflight(clientId);
        if (!inflight) return;

        logWs('complete_and_terminate', {
            clientId,
            inflightId: inflight.id,
            reason: reason?.reason || null,
            lastTextLength: typeof inflight.lastText === 'string' ? inflight.lastText.length : 0,
            expectsImage: inflight.expectsImage,
            waitingForImage: inflight.waitingForImage,
            imagePath: inflight.response?.image_path || inflight.response?.meta?.image_path || null,
        });

        const full = typeof inflight.lastText === 'string' ? inflight.lastText : '';
        const sanitized = sanitizeAssistantText(full);
        inflight.response.output_text = sanitized;
        emitOutputTextDone(clientId, sanitized);
        emitContentPartDone(clientId, sanitized);
        emitOutputItemDone(clientId, sanitized);

        if (reason) {
            emitResponseCompleted(clientId, 'completed', reason);
        } else {
            emitResponseCompleted(clientId, 'completed');
        }
        inflightTerminate(clientId, null, null);
    }

    function maybeDelayCompletionForImage(clientId: string, reason?: {reason: string}): boolean {
        const inflight = getInflight(clientId);
        if (!inflight) return false;

        const imagePath = inflight.response?.image_path || inflight.response?.meta?.image_path;
        if (!inflight.expectsImage || imagePath) {
            return false;
        }

        inflight.waitingForImage = true;
        if (!inflight.imageWaitHandle) {
            inflight.imageWaitHandle = setTimeout(() => {
                completeAndTerminate(clientId, reason);
            }, 15000);
        }

        return true;
    }

    return {
        open(ws: ServerWebSocket<WsData>) {
            const clientId = ws.data.clientId;
            logWs('socket_open', {clientId});
            if (!clientId) {
                ws.close();
                return;
            }
            setClient(clientId, ws as unknown as WebSocket);
            ws.send(JSON.stringify({type: 'welcome', at: Date.now()}));
        },

        async message(ws: ServerWebSocket<WsData>, message: string | Uint8Array) {
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
            logWs('message_received', {
                clientId,
                type: t,
                hasPayload: !!obj.payload,
            });

            if (t === 'image.generated') {
                logWs('image_generated_received', {
                    clientId,
                    fileId: typeof obj?.fileId === 'string' ? obj.fileId : null,
                    mimeType: typeof obj?.mimeType === 'string' ? obj.mimeType : null,
                    dataBase64Length: typeof obj?.dataBase64 === 'string' ? obj.dataBase64.length : 0,
                });
                try {
                    const imagePath = await saveGeneratedImage({
                        imagesDir: cfg.imagesDir,
                        clientId,
                        dataBase64: String(obj?.dataBase64 || ''),
                        mimeType: typeof obj?.mimeType === 'string' ? obj.mimeType : null,
                        fileName: typeof obj?.fileName === 'string' ? obj.fileName : null,
                        fileId: typeof obj?.fileId === 'string' ? obj.fileId : null,
                    });

                    const inflight = getInflight(clientId);
                    if (inflight) {
                        logWs('image_saved_for_inflight', {
                            clientId,
                            inflightId: inflight.id,
                            imagePath,
                            waitingForImage: inflight.waitingForImage,
                        });
                        inflight.response.image_path = imagePath;
                        inflight.response.meta = {...(inflight.response.meta || {}), image_path: imagePath};

                        if (inflight.waitingForImage) {
                            completeAndTerminate(clientId);
                        }
                    }
                } catch (err) {
                    console.warn('[images] save failed:', err);
                }
                return;
            }

            const inflight = getInflight(clientId);

            if (!inflight) {
                logWs('message_without_inflight', {
                    clientId,
                    messageType: t,
                });
            }

            if (inflight) {
                logWs('inflight_message', {
                    clientId,
                    inflightId: inflight.id,
                    messageType: t,
                    lastTextLength: typeof inflight.lastText === 'string' ? inflight.lastText.length : 0,
                    expectsImage: inflight.expectsImage,
                    waitingForImage: inflight.waitingForImage,
                    hasImagePath: !!(inflight.response?.image_path || inflight.response?.meta?.image_path),
                });

                if (t === 'sse') {
                    const upd = extractTextUpdateFromChatGPTPayload(obj);
                    if (upd) {
                        logWs('sse_text_update', {
                            clientId,
                            inflightId: inflight.id,
                            mode: upd.mode,
                            textLength: upd.text.length,
                        });
                    }

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
                    logWs('done_received', {clientId, inflightId: inflight.id});
                    if (maybeDelayCompletionForImage(clientId)) {
                        logWs('done_waiting_for_image', {clientId, inflightId: inflight.id});
                        return;
                    }

                    completeAndTerminate(clientId);
                    return;
                } else if (t === 'closed') {
                    const full = typeof inflight.lastText === 'string' ? inflight.lastText : '';
                    const sanitized = sanitizeAssistantText(full);

                    // If we receive a 'closed' event immediately after creating the inflight (within 2 seconds)
                    // and there's no content yet, this is likely a race condition from page navigation.
                    // Don't complete the request - let it timeout or wait for actual content.
                    const inflightAge = Date.now() / 1000 - inflight.createdAt;
                    if (sanitized.length === 0 && inflightAge < 2) {
                        logWs('closed_ignored_early_empty', {
                            clientId,
                            inflightId: inflight.id,
                            inflightAge,
                        });
                        return;
                    }

                    if (maybeDelayCompletionForImage(clientId, {reason: 'stream_closed'})) {
                        logWs('closed_waiting_for_image', {clientId, inflightId: inflight.id});
                        return;
                    }

                    completeAndTerminate(clientId, {reason: 'stream_closed'});
                    return;
                } else if (t === 'error') {
                    logWs('extension_error_received', {
                        clientId,
                        inflightId: inflight.id,
                        detail: obj?.error || obj?.payload || null,
                    });
                    emitResponseCompleted(clientId, 'error', {
                        reason: 'extension_error',
                        detail: obj?.error || obj?.payload || null,
                    });
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
            logWs('socket_closed', {clientId});
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
