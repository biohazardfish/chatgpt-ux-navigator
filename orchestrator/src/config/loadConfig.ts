/**
 * Configuration loader: reads YAML, validates, applies defaults, and normalizes
 * Implements Ticket 001 spec
 */

import {parse as parseYaml} from 'yaml';
import {configSchema, formatValidationErrors} from './schema';
import type {AppConfig} from './types';

/**
 * Derives run.id from config file path
 * Example: /path/to/debate.yml -> "debate"
 */
function deriveRunId(configPath: string): string {
    try {
        const filename = configPath.split('/').pop() || 'run';
        return filename.replace(/\.(yml|yaml)$/, '') || 'run';
    } catch {
        return 'run';
    }
}

/**
 * Normalizes string values: trims all "trimmed length >= 1" fields
 */
function normalizeConfig(config: any): AppConfig {
    return {
        ...config,
        server: {
            url: config.server.url.trim(),
            request_timeout: config.server.request_timeout ?? 360,
        },
        agents: Object.fromEntries(
            Object.entries(config.agents).map(([id, agent]: [string, any]) => [
                id,
                {
                    client_id: agent.client_id.trim(),
                    system: agent.system.trim(),
                    new_chat: agent.new_chat ?? false,
                },
            ])
        ),
        run: {
            id: (config.run?.id || config.run?.id)?.trim() || config.run?.id || '',
            out_dir:
                (config.run?.out_dir || config.run?.out_dir)?.trim() || config.run?.out_dir || '',
        },
        seed: {
            from: 'user' as const,
            content: config.seed.content.trim(),
        },
        judge: {
            ...config.judge,
            client_id: config.judge.client_id?.trim(),
            rubric: config.judge.rubric?.trim(),
        },
        workflow: {
            ...config.workflow,
            start: config.workflow.start?.trim() || '',
        },
    };
}

/**
 * Checks for duplicate client_id values and logs warnings
 */
function checkDuplicateClientIds(config: AppConfig): void {
    const clientIds = new Map<string, string[]>();

    // Collect agent client_ids
    Object.entries(config.agents).forEach(([agentId, agent]) => {
        const clientId = agent.client_id;
        if (!clientIds.has(clientId)) {
            clientIds.set(clientId, []);
        }
        clientIds.get(clientId)!.push(`agent:${agentId}`);
    });

    // Collect judge client_id
    if (config.judge.enabled && config.judge.client_id) {
        const clientId = config.judge.client_id;
        if (!clientIds.has(clientId)) {
            clientIds.set(clientId, []);
        }
        clientIds.get(clientId)!.push('judge');
    }

    // Warn if duplicates found
    clientIds.forEach((sources, clientId) => {
        if (sources.length > 1) {
            console.warn(
                `⚠️  Duplicate client_id "${clientId}" detected in: ${sources.join(', ')}. ` +
                    `This may cause request conflicts on the server.`
            );
        }
    });
}

/**
 * Loads a YAML config file, validates it, applies defaults, and returns typed AppConfig
 *
 * @param configPath Path to YAML config file (relative to cwd)
 * @returns Normalized, validated AppConfig
 * @throws Error with deterministic, sorted validation errors
 */
export async function loadConfig(configPath: string): Promise<AppConfig> {
    // Resolve path relative to CWD
    const resolvedPath = new URL(configPath, `file://${process.cwd()}/`).pathname;

    // Read file from disk
    let content: string;
    try {
        content = await Bun.file(resolvedPath).text();
    } catch (error) {
        throw new Error(
            `Failed to read config file at "${configPath}": ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }

    // Parse YAML
    let parsed: unknown;
    try {
        parsed = parseYaml(content);
    } catch (error) {
        throw new Error(
            `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    // Validate against schema
    const result = configSchema.safeParse(parsed);
    if (!result.success) {
        const errors = formatValidationErrors(result.error);
        throw new Error(
            `Invalid config: ${errors.length} validation error(s)\n` + errors.join('\n')
        );
    }

    let config = result.data;

    // Apply defaults
    config = {
        ...config,
        server: {
            ...config.server,
            // Override from environment variable if present
            request_timeout: process.env.REQUEST_TIMEOUT
                ? parseInt(process.env.REQUEST_TIMEOUT, 10)
                : config.server.request_timeout ?? 360,
        },
        run: {
            // Default out_dir to "runs"
            out_dir: config.run?.out_dir || 'runs',
            // Default id to derived filename
            id: config.run?.id || deriveRunId(configPath),
        },
        // Default workflow.start to first agent in order
        workflow: {
            ...config.workflow,
            start: config.workflow.start || config.workflow.order[0],
        },
    };

    // Normalize: trim all string fields marked "trimmed length >= 1"
    const normalizedConfig = normalizeConfig(config) as AppConfig;

    // Check for duplicate client_ids (warning only)
    checkDuplicateClientIds(normalizedConfig);

    return normalizedConfig;
}
