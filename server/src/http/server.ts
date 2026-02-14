import {type AppConfig} from '../config/config';
import {corsHeaders, handleOptions} from './cors';
import {Router} from './router';
import {handleIndex} from './routes/indexRoute';
import {handleListPrompts, handleGetPrompt, handlePostPrompt} from './routes/prompts';
import {handlePostResponsesById, handlePostResponsesByIdNew} from './routes/responses';
import {handlePostImagesById, handlePostImagesByIdActivate} from './routes/images';
import {handleListClients} from './routes/clients';
import {createWebSocketHandlers} from '../ws/handler';
import type {WsData} from '../types/ws';
import type {Server} from 'bun';
import {isDebugEnabled, getDebugLogFile} from '../logging/debug';

export function startServer(cfg: AppConfig): void {
    const router = new Router();

    // Register routes
    router.get('/', handleIndex);
    router.get('/list', handleListPrompts);
    router.get('/clients', handleListClients);
    router.get(/\/prompt\/.+/, handleGetPrompt);
    router.post(/\/prompt\/.+/, handlePostPrompt);
    router.post(/\/responses\/[^\/]+\/new/, handlePostResponsesByIdNew);
    router.post(/\/responses\/[^\/]+/, handlePostResponsesById);
    router.post(/\/images\/[^\/]+\/activate\/?$/, handlePostImagesByIdActivate);
    router.post(/\/images\/[^\/]+\/?$/, handlePostImagesById);

    router.options(/.*/, handleOptions);

    Bun.serve<WsData>({
        port: cfg.port,

        async fetch(req: Request, server: Server<WsData>) {
            const url = new URL(req.url);

            // WebSocket upgrade
            if (req.method === 'GET' && url.pathname === '/ws') {
                const clientId = url.searchParams.get('clientId');
                if (!clientId) {
                    return new Response('Missing clientId query parameter', {status: 400});
                }
                const ok = server.upgrade(req, {
                    data: {id: crypto.randomUUID(), clientId},
                });
                return ok
                    ? new Response(null, {status: 101})
                    : new Response('Upgrade failed', {status: 400});
            }

            // Route handling
            const response = await router.handle(req, cfg);
            if (response) {
                return response;
            }

            // Not Found
            return new Response('Not Found', {
                status: 404,
                headers: {...corsHeaders(), 'Content-Type': 'text/plain; charset=utf-8'},
            });
        },

        websocket: createWebSocketHandlers(cfg),
    });

    console.log(`Bun prompt server running: http://localhost:${cfg.port}`);
    console.log(`Serving prompts from:      ${cfg.promptsDir}`);
    console.log(`Resolving @files from:     ${cfg.filesRoot}`);
    console.log(`Saving images to:          ${cfg.imagesDir}`);
    console.log(`List endpoint:             http://localhost:${cfg.port}/list`);
    console.log(`WebSocket endpoint:        ws://localhost:${cfg.port}/ws`);
    if (isDebugEnabled()) {
        console.log(`Debug logs:                enabled`);
        console.log(`Debug log file:            ${getDebugLogFile()}`);
    }
}
