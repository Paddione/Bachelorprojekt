---
id: P2
role: impl
ticket: T901014
depends_on:
target_files:
  - scripts/llm/plan-runner/plan.mjs
---

# P2 — Maschinen-Format (plan.mjs)

## Ziel
`parseManifest` und `buildWorkerPrompt` in `plan.mjs` auf ein
low-quant-ausfuehrbares Format umstellen: kleine Modelle erhalten ein
kompaktes, strikt strukturiertes Prompt-Format statt freier Markdown-Reste.
Context-Rerank je Edit, Web-Search und Headed-Runs bleiben bewusst
scoping-offene Punkte ohne Vorannahmen (0 Priors) und sind nicht Teil von P2.

## Betroffene Datei
- `scripts/llm/plan-runner/plan.mjs` (einzige Datei dieses Partials)

## Concrete-Steps
1. `parseManifest` sichten und Manifest-Felder (id, role, targets, deps) fixieren.
2. Maschinenlesbares Partial-Schema (JSON-nah, knappe Feldnamen) definieren.
3. `buildWorkerPrompt` auf das kompakte Format umstellen (kein Fliesstext-Ballast).
4. Low-quant-taugliche Kuerzungen einbauen (Feld-Reihenfolge, Pflichtfelder zuerst).
5. Prompt-Laenge gegen 4B-Kontextbudget pruefen (Budget einhalten, ggf. trimmen).
6. Runner-Dry-Run mit Beispiel-Partial durchfuehren und Output validieren.
7. `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` bis PASS.
8. `llm-local-dev`-BATS fuer P2-Scope gruen bekommen.

## Gate
- `plan-lint` PASS plus `llm-local-dev`-BATS gruen.

## Disjunktheit
- P2 fasst nur `plan.mjs` an. P1 deckt `workers.mjs`/`plan-runner.mjs` ab,
  P3 `plan-lint.sh`, P4 die Tests unter `tests/spec/llm-local-dev/`.
