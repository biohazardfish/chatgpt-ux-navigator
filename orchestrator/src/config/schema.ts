/**
 * Zod schema for strict validation of Nexus configuration
 * Implements all validation rules from Ticket 001
 */

import {z} from 'zod';
import type {AppConfig, AgentConfig} from './types';

/**
 * Regex for agent IDs: ^[A-Za-z][A-Za-z0-9_-]{0,31}$
 * - Must start with letter
 * - 0-31 alphanumeric/underscore/dash chars
 * - Total length 1-32 chars
 */
const AGENT_ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/**
 * Validates a URL string using the built-in URL constructor
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Base string validator: non-empty after trimming
 */
const trimmedString = z.string().trim().min(1, 'required');

/**
 * AgentConfig schema
 */
const agentConfigSchema = z
    .object({
        client_id: trimmedString,
        system: trimmedString,
        new_chat: z.boolean().optional(),
    })
    .strict();

/**
 * Judge config schema with conditional validation
 */
const judgeSchema = z
    .object({
        enabled: z.boolean(),
        client_id: z.string().optional(),
        rubric: z.string().optional(),
        summary: z
            .object({
                enabled: z.boolean(),
                prompt: z.string().optional(),
                max_chars: z.number().int().min(1).optional(),
                window: z
                    .object({
                        type: z.enum(['last_round', 'last_n_turns']),
                        n: z.number().int().min(1).optional(),
                    })
                    .optional(),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine((judge, ctx) => {
        if (judge.enabled) {
            if (!judge.client_id || judge.client_id.trim().length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['client_id'],
                    message: 'required when judge.enabled is true',
                });
            }
            if (!judge.rubric || judge.rubric.trim().length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['rubric'],
                    message: 'required when judge.enabled is true',
                });
            }
        } else if (judge.summary?.enabled) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['summary', 'enabled'],
                message: 'cannot be true when judge.enabled is false',
            });
        }

        if (judge.summary?.enabled) {
            if (!judge.summary.prompt || judge.summary.prompt.trim().length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['summary', 'prompt'],
                    message: 'required when judge.summary.enabled is true',
                });
            }

            if (judge.summary.window?.type === 'last_n_turns') {
                if (!judge.summary.window.n || judge.summary.window.n < 1) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['summary', 'window', 'n'],
                        message: 'required when summary.window.type is last_n_turns',
                    });
                }
            }
        }
    });

/**
 * Raw config schema (before defaults and normalization)
 */
const rawConfigSchema = z
    .object({
        version: z.literal(1),
        server: z.object({
            url: trimmedString.superRefine((url, ctx) => {
                if (!isValidUrl(url)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'must be a valid URL',
                    });
                }
            }),
            request_timeout: z.number().optional(),
        }),
        run: z
            .object({
                id: z.string().optional(),
                out_dir: z.string().optional(),
            })
            .optional(),
        agents: z.record(trimmedString, agentConfigSchema).superRefine((agents, ctx) => {
            const agentIds = Object.keys(agents);

            // Check agent count (2..20)
            if (agentIds.length < 2) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [],
                    message: `agents must have 2..20 entries; found ${agentIds.length}`,
                });
            } else if (agentIds.length > 20) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [],
                    message: `agents must have 2..20 entries; found ${agentIds.length}`,
                });
            }

            // Check agent IDs match regex
            agentIds.forEach(id => {
                if (!AGENT_ID_REGEX.test(id)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: [id],
                        message: `agent id must match ^[A-Za-z][A-Za-z0-9_-]{0,31}$`,
                    });
                }
            });
        }),
        workflow: z
            .object({
                type: z.literal('round_robin'),
                order: z.array(z.string()),
                start: z.string().optional(),
            })
            .superRefine((workflow, ctx) => {
                if (!workflow.order || workflow.order.length === 0) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['order'],
                        message: 'required',
                    });
                }
            }),
        delivery: z.object({
            type: z.literal('next_speaker'),
        }),
        seed: z.object({
            from: z.literal('user'),
            content: trimmedString,
        }),
        judge: judgeSchema,
        termination: z.object({
            max_turns: z.number().int().min(1).max(1000),
            judge_stop: z.boolean(),
        }),
    })
    .strict(); // Reject unknown fields

/**
 * Full validation with cross-field checks
 */
export const configSchema = rawConfigSchema.superRefine((config, ctx) => {
    // Validate workflow.order against agents
    const agentIds = Object.keys(config.agents);
    const orderIds = config.workflow.order;

    if (orderIds.length !== agentIds.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['workflow', 'order'],
            message: `must contain exactly ${agentIds.length} agent IDs; found ${orderIds.length}`,
        });
    }

    // Check for duplicates in order
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    orderIds.forEach(id => {
        if (seen.has(id)) {
            duplicates.add(id);
        }
        seen.add(id);
    });
    if (duplicates.size > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['workflow', 'order'],
            message: `contains duplicate agents: ${Array.from(duplicates).join(', ')}`,
        });
    }

    // Check for unknown agents in order
    const unknownInOrder = orderIds.filter(id => !agentIds.includes(id));
    if (unknownInOrder.length > 0) {
        unknownInOrder.forEach(id => {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['workflow', 'order'],
                message: `unknown agent ID: "${id}"`,
            });
        });
    }

    // Validate workflow.start if present
    if (config.workflow.start && !orderIds.includes(config.workflow.start)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['workflow', 'start'],
            message: `must be one of the agent IDs in order`,
        });
    }

    // Validate judge_stop logic
    if (!config.judge.enabled && config.termination.judge_stop) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['termination', 'judge_stop'],
            message: `must be false when judge.enabled is false`,
        });
    }
});

/**
 * Parse Zod errors into deterministic, sorted error messages
 */
export function formatValidationErrors(errors: z.ZodError): string[] {
    const errorMessages: string[] = [];

    errors.issues.forEach(issue => {
        const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
        errorMessages.push(`${pathStr}: ${issue.message}`);
    });

    // Sort lexicographically for deterministic output
    errorMessages.sort();

    return errorMessages;
}
