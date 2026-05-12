export interface Config {
  port: number;
  dbUrl: string;
  issuers: { url: string; brand: 'mentolder' | 'korczewski' }[];
  logLevel: string;
}

function need(env: Record<string, string | undefined>, k: string): string {
  const v = env[k];
  if (!v) throw new Error(`Missing required env var: ${k}`);
  return v;
}

export function loadConfig(env = process.env): Config {
  return {
    port: parseInt(env.PORT ?? '8090', 10),
    dbUrl: need(env, 'DB_URL'),
    issuers: [
      { url: need(env, 'KEYCLOAK_ISSUER_MENTOLDER'), brand: 'mentolder' },
      { url: need(env, 'KEYCLOAK_ISSUER_KORCZEWSKI'), brand: 'korczewski' },
    ],
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}