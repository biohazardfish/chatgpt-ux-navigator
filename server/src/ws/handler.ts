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
    trackSseFrame,
    pushSseRawContext,
    flushSseRawContext,
    clearSseRawContext,
    emitSseRollup,
} from '../http/responses/inflight';
import {sanitizeAssistantText} from '../http/responses/sanitize';
import {
    saveGeneratedImage,
} from '../http/images/capture';
import {debugSummary, debugRaw} from '../logging/debug';

export function createWebSocketHandlers(cfg: AppConfig) {
    function logWs(event: string, meta: Record<string, unknown> = {}) {
        if (!cfg.debug) return;
        debugSummary('ws.responses', event, meta);
    }

    function summarizeSsePayload(obj: any, clientId: string, inflightId: string): Record<string, unknown> {
        const payloadJson = obj?.payload?.json;
        const op = typeof payloadJson?.o === 'string' ? payloadJson.o : null;
        const type = typeof payloadJson?.type === 'string' ? payloadJson.type : null;
        const conversationId =
            typeof payloadJson?.conversation_id === 'string' ? payloadJson.conversation_id : null;
        const hasImagePointer = !!(
            payloadJson?.v?.message?.content?.parts?.[0]?.asset_pointer ||
            payloadJson?.v?.message?.content?.parts?.[0]?.content_type === 'image_asset_pointer'
        );

        return {
            clientId,
            responseId: inflightId,
            op,
            type,
            conversationId,
            hasImagePointer,
        };
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
        clearSseRawContext(clientId);
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
            if (!clientId) {
                logWs('message_missing_client_id', {type: t});
                return;
            }
            if (t !== 'sse') {
                logWs('message_received', {
                    clientId,
                    type: t,
                    hasPayload: !!obj.payload,
                });
            }

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
                    flushSseRawContext(clientId, 'image_save_failed', {
                        detail: String((err as Error)?.message || err),
                    });
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
                if (t !== 'sse') {
                    logWs('inflight_message', {
                        clientId,
                        inflightId: inflight.id,
                        messageType: t,
                        lastTextLength: typeof inflight.lastText === 'string' ? inflight.lastText.length : 0,
                        expectsImage: inflight.expectsImage,
                        waitingForImage: inflight.waitingForImage,
                        hasImagePath: !!(inflight.response?.image_path || inflight.response?.meta?.image_path),
                    });
                }

                if (t === 'sse') {
                    const sseMeta = summarizeSsePayload(obj, clientId, inflight.id);
                    const upd = extractTextUpdateFromChatGPTPayload(obj);
                    const hasText = !!(upd && typeof upd.text === 'string' && upd.text.length > 0);
                    const isPatch = sseMeta.op === 'patch';

                    pushSseRawContext(clientId, {
                        ...sseMeta,
                        raw: obj?.payload?.raw || null,
                        event: obj?.payload?.event || null,
                    });

                    const sampledRaw = debugRaw('sse.raw', 'frame_sample', {
                        ...sseMeta,
                        hasText,
                        mode: upd?.mode || null,
                        textLen: upd?.text?.length || 0,
                        raw: obj?.payload?.raw || null,
                        json: obj?.payload?.json || null,
                    });

                    trackSseFrame(clientId, {hasText, isPatch, sampledRaw});

                    if (hasText) {
                        debugSummary('sse.summary', 'text_update', {
                            ...sseMeta,
                            mode: upd?.mode || null,
                            textLen: upd?.text?.length || 0,
                        });
                    } else if (isPatch || sseMeta.type === 'message_stream_complete') {
                        debugSummary('sse.summary', 'frame_signal', {
                            ...sseMeta,
                            hasText,
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
                        if (cfg.debug) {
                            emitGenericEvent(clientId, obj);
                        }
                    }
                } else if (t === 'done') {
                    logWs('done_received', {clientId, inflightId: inflight.id});
                    emitSseRollup(clientId);
                    clearSseRawContext(clientId);
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

                    emitSseRollup(clientId);
                    clearSseRawContext(clientId);
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
                    flushSseRawContext(clientId, 'extension_error', {
                        detail: obj?.error || obj?.payload || null,
                    });
                    inflightTerminate(clientId, 'response.error', {
                        type: 'response.error',
                        error: {message: 'Extension reported error', detail: obj},
                    });
                    return;
                } else {
                    if (cfg.debug) {
                        emitGenericEvent(clientId, obj);
                    }
                }
            }
        },

        close(ws: ServerWebSocket<WsData>) {
            const clientId = ws.data.clientId;
            logWs('socket_closed', {clientId});
            if (!clientId) return;

            removeClient(clientId);
            const inflight = getInflight(clientId);
            if (inflight) {
                emitResponseCompleted(clientId, 'error', {error: 'WebSocket closed'});
                flushSseRawContext(clientId, 'websocket_closed');
                inflightTerminate(clientId, 'response.error', {
                    type: 'response.error',
                    error: {message: 'WebSocket closed'},
                });
            }
        },
    };
}
