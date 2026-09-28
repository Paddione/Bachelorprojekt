# p2 — weitere Aufrufstellen

Target files: `scripts/glimmer-worker-mcp/server.mjs`, `scripts/llm/agent-bench/lib/roles/code-worker.mjs`.

### Task 1: --dir streichen

- `server.mjs`: `'--dir', job.cwd` aus dem `spawn`-Array entfernen (`cwd: job.cwd` bleibt).
- `code-worker.mjs`: `'--dir', workdir` aus `args` entfernen (`cwd: workdir` wird an `run` übergeben).
