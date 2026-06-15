module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // dev-flow commits append ticket refs like [T000235,T000236,T000237] which
    // can push a descriptive subject past the default 100-char limit.
    'header-max-length': [2, 'always', 150],
    'scope-enum': [
      2,
      'always',
      [
        'website',
        'brett',
        'arena',
        'infra',
        'db',
        'security',
        'ops',
        'docs',
        'deps',
        'plans',
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
        'recovery'
      ]
    ]
  },
};
