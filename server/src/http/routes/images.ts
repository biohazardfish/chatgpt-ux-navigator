import type {AppConfig} from '../../config/config';
import {handleResponsesRequest} from './responses';

export function handlePostImagesById(req: Request, cfg: AppConfig, url: URL): Promise<Response> {
    const pathParts = url.pathname.split('/');
    const clientId = pathParts[pathParts.length - 1];

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
