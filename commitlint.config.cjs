// Sechs Domänen-Scopes, deckungsgleich mit den Agent-Rollen in CLAUDE.md
// (.claude/agents/bachelorprojekt-*), plus acht Querschnitts-Scopes für das,
// was keiner Domäne gehört. Konsolidiert von 95 auf 14 in T002328 — die
// vollständige Herleitung steht in
// openspec/changes/commit-scope-consolidation/design.md.
const NAMED_SCOPES = [
  // Domänen
  'website',
  'infra',
  'db',
  'security',
  'ops',
  'test',
  // Querschnitt
  'plans',
  'factory',
  'agents',
  'skills',
  'ci',
  'scripts',
  'docs',
  'mcp',
  'deps',
];

// Ziel-Scope -> die Namen, die darin aufgegangen sind. Gruppiert statt als
// flache Paar-Map notiert: spart rund 40 Zeilen (das .cjs-Limit liegt bei 200)
// und macht die Zusammenfassung auf einen Blick lesbar.
const SCOPE_ALIAS_GROUPS = {
  website: ['brett', 'admin', 'billing', 'coaching', 'dashboard', 'arena', 'brain',
    'knowledge', 'mentolder-web', 'kore', 'cockpit', 'videovault', 'ui', 'content',
    'content-hub', 'questionnaire', 'sidekick', 'assistant', 'portal', 'art-library',
    'assets', 'api', 'stream', 'planungsbuero', 'mediaviewer', 'newsletter'],
  infra: ['k3d', 'fleet', 'flux', 'korczewski', 'mentolder', 'prod', 'deploy', 'env',
    'config', 'netpol', 'nextcloud', 'collabora', 'coturn', 'janus', 'platform',
    'dev-stack', 'dev', 'argocd', 'whiteboard', 'wg', 'talk'],
  db: ['database', 'schema', 'backup'],
  security: ['secrets', 'sso', 'auth', 'pocket-id', 'rbac', 'keycloak', 'pentest'],
  ops: ['llm', 'terminal', 'recovery', 'monitoring', 'graph', 'oracle', 'gemini', 'claude'],
  test: ['tests', 'testing', 'e2e', 'systemtest', 'dev-status'],
  plans: ['plan', 'openspec', 'spec', 'specs', 'brainstorm'],
  factory: ['dev-flow', 'tickets', 'factory-floor', 'auto', 'hooks'],
  agents: ['skills', 'agent-guide', 'opencode', 'prompt-library', 'knowledge-ingest',
    'openclaw'],
  ci: ['quality', 'goals', 'cqg', 'docs-gen'],
  mcp: ['mcp-task-runner'],
};

const SCOPE_ALIASES = Object.fromEntries(
  Object.entries(SCOPE_ALIAS_GROUPS).flatMap(([target, olds]) =>
    olds.map((old) => [old, target])),
);

// Systeme, die es nicht mehr gibt. Ein Alias wäre hier eine Falschauskunft —
// stattdessen nennt die Meldung den Grund des Wegfalls.
const SCOPE_RETIRED = {
  tracking: 'die Tracking-Pipeline wurde in PR #788/#993 entfernt',
  livekit: 'LiveKit wurde per T002184 entfernt',
};

// Synthetik-Codes aus abgeschlossenen Quality-Goals (cq07, sec03, dora01, …).
// Sie waren nie als Commit-Scope gedacht; der Health-Goal-Scope G-CQ07 deckt
// denselben Zweck ab und bleibt gültig.
const SYNTHETIC_SCOPE_RE = /^(cq|sec|dora|size|test|doc|fe|k8s|spec|ci|cd|dep|img)\d{2}$/;

const TICKET_SCOPE_RE = /^T\d{6}$/;
const HEALTH_GOAL_SCOPE_RE = /^G-[A-Z][A-Z0-9]+$/;

// Liefert die Zusatzzeile für einen abgelehnten Scope — oder '' wenn nichts
// Genaueres bekannt ist. Wird von der commitlint-Regel und (über den
// node -e-Pfad) von scripts/validate-commit-msg.sh benutzt.
function scopeHint(scope) {
  if (SCOPE_ALIASES[scope]) {
    return `'${scope}' wurde zu '${SCOPE_ALIASES[scope]}' konsolidiert (T002328)`;
  }
  if (SCOPE_RETIRED[scope]) {
    return `'${scope}' ist entfallen — ${SCOPE_RETIRED[scope]}`;
  }
  if (SYNTHETIC_SCOPE_RE.test(scope)) {
    return `'${scope}' war ein Quality-Goal-Code — nutze 'ci' oder den Health-Goal-Scope G-${scope.toUpperCase()}`;
  }
  return '';
}

module.exports = {
  namedScopes: NAMED_SCOPES,
  scopeAliases: SCOPE_ALIASES,
  scopeRetired: SCOPE_RETIRED,
  syntheticScopeRe: SYNTHETIC_SCOPE_RE.source,
  scopeHint,
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-allowed': (parsed) => {
          if (!parsed || !parsed.scope) return [true];
          if (NAMED_SCOPES.includes(parsed.scope)) return [true];
          if (TICKET_SCOPE_RE.test(parsed.scope)) return [true];
          if (HEALTH_GOAL_SCOPE_RE.test(parsed.scope)) return [true];
          const hint = scopeHint(parsed.scope);
          return [false, hint || `scope "${parsed.scope}" is not allowed. Must be a named scope, health goal (G-XXX), or ticket number (Tdddddd)`];
        },
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 150],
    'scope-allowed': [2, 'always'],
  },
};
