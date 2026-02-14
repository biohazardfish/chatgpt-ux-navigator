import type {AppConfig} from '../../config/config';
import {corsHeaders} from '../cors';
import {getClient, sendToClient} from '../../ws/hub';
import {handleResponsesRequest} from './responses';

function extractClientIdFromImagesPath(pathname: string, mode: 'base' | 'activate'): string | null {
    const match = pathname.match(/^\/images\/([^/]+)(?:\/(activate))?\/?$/);
    if (!match || !match[1]) return null;

    const suffix = match[2] || '';
    if (mode === 'activate' && suffix !== 'activate') return null;
    if (mode === 'base' && suffix) return null;

    return match[1];
}

export function handlePostImagesById(req: Request, cfg: AppConfig, url: URL): Promise<Response> {
    const clientId = extractClientIdFromImagesPath(url.pathname, 'base');

    if (!clientId || clientId.trim() === '') {
        return new Response(JSON.stringify({error: 'Client ID is required in the URL path'}), {
            status: 400,
            headers: {'Content-Type': 'application/json'},
        });
    }

    return handleResponsesRequest(req, cfg, url, {
        createTemporaryChat: false,
        newChat: false,
        messageType: 'prompt.image',
        clientId,
    });
}

export async function handlePostImagesByIdActivate(
    _req: Request,
    _cfg: AppConfig,
    url: URL
): Promise<Response> {
    const clientId = extractClientIdFromImagesPath(url.pathname, 'activate');
    const cors = corsHeaders();

    if (!clientId || clientId.trim() === '') {
        return new Response(JSON.stringify({error: 'Client ID is required in the URL path'}), {
            status: 400,
            headers: {...cors, 'Content-Type': 'application/json'},
        });
    }

    if (!getClient(clientId)) {
        return new Response(JSON.stringify({error: `Client '${clientId}' not connected.`}), {
            status: 404,
            headers: {...cors, 'Content-Type': 'application/json'},
        });
    }

    const ok = sendToClient(clientId, {
        type: 'image.activate',
        created: Math.floor(Date.now() / 1000),
    });

    if (!ok) {
        return new Response(JSON.stringify({error: 'Failed to send image-activate command to WS client'}), {
            status: 502,
            headers: {...cors, 'Content-Type': 'application/json'},
        });
    }

    return new Response(
        JSON.stringify({
            ok: true,
            activated: true,
            client_id: clientId,
            action: 'image.activate',
        }),
        {
            status: 200,
            headers: {...cors, 'Content-Type': 'application/json; charset=utf-8'},
        }
    );
}
