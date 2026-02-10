/**
 * Type definitions for Nexus configuration
 * Based on Ticket 001 — Config & Validation spec
 */

export type AppConfig = {
    version: 1;
    server: {
        url: string;
        /**
         * Request timeout in seconds for agent and judge calls.
         * Optional; defaults to 360 (6 minutes).
         */
        request_timeout?: number;
    };
    run: {
        id: string;
        out_dir: string;
    };
    agents: Record<string, AgentConfig>;
    workflow: {
        type: 'round_robin';
        order: string[];
        start: string;
    };
    delivery: {
        type: 'next_speaker';
    };
    seed: {
        from: 'user';
        content: string;
    };
    judge: {
        enabled: boolean;
        client_id?: string;
        rubric?: string;
        summary?: {
            enabled: boolean;
            prompt?: string;
            max_chars?: number;
            window?: {
                type: 'last_round' | 'last_n_turns';
                n?: number;
            };
        };
    };
    termination: {
        max_turns: number;
        judge_stop: boolean;
    };
};

export type AgentConfig = {
    client_id: string;
    system: string;
    /**
     * If true, this agent's prompts are sent via POST /responses/:clientId/new to force a fresh chat.
     * If false, this agent's prompts are sent via POST /responses/:clientId (continue current chat).
     * Optional; defaults to false.
     */
    new_chat?: boolean;
};
