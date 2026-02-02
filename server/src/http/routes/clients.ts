import type {AppConfig} from '../../config/config';
import {corsHeaders} from '../cors';
import {listClients} from '../../ws/hub';

export async function handleListClients(req: Request, config: AppConfig): Promise<Response> {
    const clients = listClients();
    return new Response(JSON.stringify({clients}), {
        headers: {
            ...corsHeaders(),
            'Content-Type': 'application/json',
        },
    });
}
