# Decision-Routen → Worker-Lineup

Stand: 2026-10-13. Verbindet den Prompt-Shaper/Dispatch aus
`unsloth-boxes/decision-train` (Routen `simple_worker`, `deep_worker`,
`sandbox_exec`, `ops_git`, `web_research`; `WorkerPool` mit 5070-Ti- und
3060-Ti-Schiene) mit den realen Rails aus `.opencode/agent-models.jsonc`
(SSOT), `docs/agent-guide/registry/runtimes.md` und
`scripts/llm/plan-runner/workers.mjs`. Die interaktive Leiter in
`.opencode/skills/references/subagent-provisioning.md` §1 ist seit diesem
Change vollständig (vLLM- und CPU-2B-Zeilen ergänzt).

## Ideales Lineup: Route → Rail

| Decision-Route | Primär-Rail | Warum | Überlauf |
|---|---|---|---|
| `simple_worker` (non-thinking, ≤1024 Tok) | `:8096` Qwen3.5-2B, 4 Slots | Entspricht exakt dem WorkerPool-Default (non-thinking → 3060 Ti) | `:8080` 4B, dann vLLM |
| `deep_worker` (thinking, ≤8192 Tok) | `:8123` vLLM w4a4 (5070 Ti) | Thinking läuft im WorkerPool immer auf der 5070 Ti; vLLM ist dort der Durchsatz-stärkste Thinking-Track | `:8080` 4B mit Thinking, dann `:1919` 27B |
| `sandbox_exec` (Code-Shortcut) | Sandbox `/v1/execute`, `:8096` 4 Slots | Guard-geprüfte Snippets umgehen das LLM; `:8096` bedient bis zu 4 Sandbox-Slots parallel | LLM-Pfad (`simple_worker`) bei Guard-Alarm |
| `ops_git` (Kommandos, ≤1024 Tok) | `:8096` Qwen3.5-2B | Mechanisch, klein, kein Urteil nötig — gleiche Klasse wie `simple_worker` | `:8080` 4B |
| `web_research` (thinking, ≤4096 Tok) | `:8123` vLLM w4a4 | Thinking-Track mit großem Kontext-Fenster (bis 40k je Anfrage) für Quellenarbeit | `:8080` 4B, dann `local` `:1919` |

## Wo der Dispatch hängt

- **Decision-Dispatch** (`decision-train/src/dispatch.py`): Batch-Entscheidung
  (`/v1/route_batch` + `/v1/triage_batch`), dann parallele Worker-Calls.
  Kennt heute nur zwei Schienen (5070 Ti `:8123`, 3060 Ti `:8096`).
- **plan-runner** (`scripts/llm/plan-runner/workers.mjs`): Dispatch-Policy
  4B (`:8080`) → vLLM (`:8123`, opt-in `--vllm-slots`) → self (`:1919`).
- **Interaktiv**: Orchestrator klassifiziert Partials nach
  `subagent-provisioning.md` §3 (Datei-Menge, S1-Budget, Rolle,
  Abhängigkeitstiefe) auf Begrenzt / Standard / Schwer / Eskalation.

## Bewusst außerhalb (kein Code in diesem Change)

- `:1919` (27B), `:18199` (CPU-2B) und `exe-muse` (Cloud) sind **keine**
  Decision-Dispatch-Ziele — der Dispatch bleibt lokal und klein.
- Soll eine Route später dorthin (z. B. `deep_worker`-Spillover auf `:1919`
  statt `:8080`), ist das eine `WorkerPool`-Code-Änderung mit eigener
  Review — nicht Teil dieses Lineups.
