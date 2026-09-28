# p1 — plan-runner

Target files: `scripts/llm/plan-runner/workers.mjs`.

### Task 1: --dir streichen, --model mitgeben

- In `runWorker` das Argument `'--dir', worktree` entfernen (`cwd: worktree` bleibt).
- Neue Funktion `agentModel(agent)`: liest `<repo>/.opencode/agent-models.jsonc` (Repo = drei Ebenen über
  dieser Datei), entfernt Zeilenkommentare (`^\s*//.*$`) und Blockkommentare, parst JSON und gibt
  `agent[<name>].model` zurück, sonst `null`. Ergebnis pro Agent cachen.
- Argumente: `['run', '--agent', agent, ...(model ? ['--model', model] : []), prompt]`.
- Kopfkommentar der Datei und von `runWorker` auf den neuen Aufruf anpassen.
