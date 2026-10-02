# plan-runner-opencode-v2 — Design (T900729)

Symptom: Im Lauf für T900724 endete jeder 4B-Worker sofort mit „exit 1: no result line“.

| # | Ursache | Beleg |
|---|---|---|
| U1 | `opencode run --dir` gibt es in opencode v2.0.18 nicht mehr („Unrecognized flag: --dir“). | `opencode run --agent plan-worker-4b --dir <wt> "ok"` → Fehler |
| U2 | `opencode run --agent X` nutzt das Default-Modell, nicht das Agent-Modell. Anfragen gehen an :1919 statt :1920. | `journalctl --user -u qwen35-mtp --since -1min \| grep -c POST` → 0; mit `--model llamacpp-qwen35/Qwen3.5-4B-MTP` > 0 |

- D1: `--dir` an allen drei Aufrufstellen streichen, `cwd` ist bereits der Worktree bzw. das Arbeitsverzeichnis.
- D2: plan-runner gibt `--model` aus `.opencode/agent-models.jsonc` (Repo des Runners) pro Agent mit. Fehlt der Eintrag, ohne `--model` starten.
- Nicht im Scope: Modellwahl von glimmer-worker-mcp (eigener Agent, eigenes Ticket bei Bedarf).
