const NAMED_SCOPES = [
  'website',
  'brett',
  'arena',
  'brain',
  'infra',
  'db',
  'security',
  'ops',
  'docs',
  'deps',
  'plans',
  'plan',
  'ci',
  'test',
  'factory',
  'e2e',
  'coaching',
  'assistant',
  'admin',
  'billing',
  'talk',
  'collabora',
  'secrets',
  'janus',
  'keycloak',
  'portal',
  'livekit',
  'whiteboard',
  'nextcloud',
  'openclaw',
  'scripts',
  'agent-guide',
  'fleet',
  'mcp',
  'dev-flow',
  'prompt-library',
  'tickets',
  'recovery',
  'test01', 'test02', 'test03', 'test04', 'test05',
  'cq01', 'cq02', 'cq03', 'cq04', 'cq05', 'cq06', 'cq07', 'cq08',
  'size01', 'size02', 'size03', 'size04',
  'ci01', 'ci02', 'ci03', 'cd01', 'cd02',
  'dora01', 'dora02', 'dora03',
  'dep01', 'dep02', 'dep03',
  'doc01', 'doc02', 'doc03', 'doc04',
  'fe01', 'fe02', 'fe03',
  'img01', 'img02',
  'k8s01', 'k8s02', 'k8s03',
  'spec01', 'spec02', 'spec03',
  'sec01', 'sec02', 'sec03', 'sec04', 'sec05',
  'openspec',
  'quality',
  'goals',
  'terminal',
  'wg',
  'auto',
];

const TICKET_SCOPE_RE = /^T\d{6}$/;
const HEALTH_GOAL_SCOPE_RE = /^G-[A-Z][A-Z0-9]+$/;

module.exports = {
  namedScopes: NAMED_SCOPES,
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-allowed': (parsed) => {
          if (!parsed || !parsed.scope) return [true];
          if (NAMED_SCOPES.includes(parsed.scope)) return [true];
          if (TICKET_SCOPE_RE.test(parsed.scope)) return [true];
          if (HEALTH_GOAL_SCOPE_RE.test(parsed.scope)) return [true];
          return [false, `scope "${parsed.scope}" is not allowed. Must be a named scope, health goal (G-XXX), or ticket number (Tdddddd)`];
        },
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 150],
    'scope-allowed': [2, 'always'],
  },
};
