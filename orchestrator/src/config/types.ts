/**
 * Type definitions for Nexus configuration
 * Based on Ticket 001 — Config & Validation spec
 */

export type AppConfig = {
  version: 1;
  server: {
    url: string;
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
    eval_every_turn: true;
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
