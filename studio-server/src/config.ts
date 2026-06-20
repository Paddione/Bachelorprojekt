export interface Config {
  port: number;
  dbUrl: string;
  issuers: { url: string; brand: 'mentolder' | 'korczewski' }[];
  llmRouterUrl: string;
  whisperUrl: string;
  logLevel: string;
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
}

export function loadConfig(env = process.env): Config {
  return {
    port: parseInt(env.PORT ?? '8092', 10),
    dbUrl: need(env, 'STUDIO_DB_URL'),
    issuers: [
      { url: need(env, 'KEYCLOAK_ISSUER_MENTOLDER'), brand: 'mentolder' },
    ],
    llmRouterUrl: env.LLM_ROUTER_URL ?? 'http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234',
    whisperUrl: env.WHISPER_URL ?? 'http://whisper.workspace.svc.cluster.local:8000',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
