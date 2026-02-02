export interface Config {
  serverBaseUrl: string;
  stateDir: string;
}

export function loadConfig(): Config {
  return {
    serverBaseUrl: Bun.env.NEXUS_SERVER_BASE_URL || 'http://localhost:8765',
    stateDir: Bun.env.NEXUS_STATE_DIR || './nexus_state',
  };
}
