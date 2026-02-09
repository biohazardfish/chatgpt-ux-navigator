/**
 * Type definitions for Nexus configuration
 * Based on Ticket 001 — Config & Validation spec
 */

export type AppConfig = {
    version: 1;
    server: {
        url: string;
        /**
         * If true, agent prompts are sent via POST /responses/:clientId/new to force a fresh chat.
         * If false, agent prompts are sent via POST /responses/:clientId (continue current chat).
         * Optional in config; defaults to true.
         */
        agents_new_chat?: boolean;
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
    };
    termination: {
        max_turns: number;
        judge_stop: boolean;
    };
};

export type AgentConfig = {
    client_id: string;
    system: string;
};
