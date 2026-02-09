/**
 * Startup preflight checks.
 *
 * Currently:
 * - Ensure all configured client_id values are connected to the @repo/server.
 */

import type {AppConfig} from '../config/types';
import {fetchConnectedClients} from './listClients';

type RequiredClient = {
    label: string;
    client_id: string;
};

function getRequiredClients(config: AppConfig): RequiredClient[] {
    const required: RequiredClient[] = [];

    for (const agentId of config.workflow.order) {
        const agent = config.agents[agentId];
        if (agent) {
            required.push({label: `agent:${agentId}`, client_id: agent.client_id});
        }
    }

    if (config.judge.enabled && config.judge.client_id) {
        required.push({label: 'judge', client_id: config.judge.client_id});
    }

    return required;
}

export async function preflightCheckClients(
    config: AppConfig,
    opts?: {timeoutMs?: number}
): Promise<{connected: string[]; required: RequiredClient[]}> {
    const connected = await fetchConnectedClients(config.server.url, {
        timeoutMs: opts?.timeoutMs,
    });
    const connectedSet = new Set(connected);
    const required = getRequiredClients(config);

    const missing = required.filter(r => !connectedSet.has(r.client_id));
    if (missing.length > 0) {
        const missingStr = missing.map(m => `${m.label}=${m.client_id}`).join(', ');
        const connectedStr = connected.length > 0 ? connected.join(', ') : '(none)';

        throw new Error(
            [
                `Missing required connected client(s): ${missingStr}`,
                `Connected clients: ${connectedStr}`,
                `Fix: open/refresh the ChatGPT tabs for the missing clients (and ensure the extension + @repo/server are running).`,
            ].join('\n')
        );
    }

    return {connected, required};
}
