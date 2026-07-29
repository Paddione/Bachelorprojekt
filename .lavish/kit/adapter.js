// adapter.js — Data adapter contract + fixtures
// brand='mentolder' hardcoded per E16
// In K2 this file is replaced by a real daemon connection

const data = (() => {
  const brand = 'mentolder';

  // ---- Fixtures ----
  const fixtures = {
    tickets: [
      { id: 'T002460', title: 'K1: Lavish Design-Kit', status: 'in_progress', priority: 'hoch', epic: 'T002458' },
      { id: 'T002461', title: 'K2: Daten-Adapter', status: 'triage', priority: 'hoch', epic: 'T002458' },
      { id: 'T002462', title: 'K3: Layout-Engine', status: 'triage', priority: 'mittel', epic: 'T002458' },
      { id: 'T002464', title: 'K5: Epic-Canvas', status: 'triage', priority: 'hoch', epic: 'T002458' },
      { id: 'T002452', title: 'LOC-Gates Headroom', status: 'done', priority: 'hoch', epic: null },
    ],
    agents: [
      { sid: '1941661', label: 'opencode-flow-execute', ticket: 'T002460', worktree: '.worktrees/sdlc-cockpit-design', status: 'active', started: '2026-07-28T20:13Z' },
      { sid: '559e73c1', label: 'ci-fix-loop', ticket: 'T002342', worktree: '.worktrees/mishap-dev-flow-scripts', status: 'active', started: '2026-07-28T18:30Z' },
      { sid: 'd4d44684', label: 'dev-flow-plan', ticket: 'T002447', worktree: '.worktrees/agent-lock-release-guard', status: 'idle', started: '2026-07-28T17:45Z' },
    ],
    ci: [
      { run: 3516, workflow: 'chore(plans): Mishap-Bundle', status: 'in_progress', started: '2026-07-28T19:00Z', branch: 'feature/mishap-bundle-T002457' },
      { run: 3515, workflow: 'fix(agents): same-tool-fallback', status: 'success', started: '2026-07-28T18:30Z', branch: 'fix/agent-identity-T002447' },
    ],
    cluster: {
      pods: [
        { name: 'ollama-llama-cpp-7f9d6', status: 'Running', restarts: 0, age: '3d', gpu: 'Tesla T4' },
        { name: 'website-84b2c', status: 'Running', restarts: 1, age: '5d' },
        { name: 'postgres-0', status: 'Running', restarts: 0, age: '12d' },
        { name: 'flux-65432', status: 'Running', restarts: 0, age: '7d' },
      ],
      warnings: ['ollama-llama-cpp: GPU memory 78% used']
    },
    factory: {
      queue_depth: 3,
      running: 'T002460',
      waiting: ['T002461', 'T002462', 'T002464'],
      last_tick: '2026-07-28T20:15Z'
    },
    models: [
      { name: 'gemma-4-12b', port: 8091, status: 'running', vram_gb: 7.2, slot: 1, ctx_k: 262144, slots_total: 1 },
      { name: 'deepseek-v4-flash', port: null, status: 'remote', provider: 'opencode-go', ctx_k: 1048576 },
    ]
  };

  return {
    // ---- Read methods ----
    tickets: () => Promise.resolve(fixtures.tickets),
    agents: () => Promise.resolve(fixtures.agents),
    ci: () => Promise.resolve(fixtures.ci),
    cluster: () => Promise.resolve(fixtures.cluster),
    factory: () => Promise.resolve(fixtures.factory),
    models: () => Promise.resolve(fixtures.models),

    // ---- Write stubs (real in K4) ----
    ticketAction: (ticketId, action) => Promise.resolve({ ok: true, message: `[K1 fixture] ${action} on ${ticketId} — real in K4` }),
    agentAction: (sid, action) => Promise.resolve({ ok: true, message: `[K1 fixture] ${action} on ${sid} — real in K4` }),
  };
})();

window.data = data;
