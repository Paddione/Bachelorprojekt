---
ticket_id: T900687
plan_ref: openspec/changes/review-gate-optional/tasks.md
status: active
date: 2026-09-27
---

# T900687 — Code-Review-Gate optional: Design-Spec

**Ticket:** T900687 · **Anlass:** T900655 / PR #6062 · **Nutzerentscheid:** 2026-09-27

## 1. Ausgangslage

- `.opencode/skills/dev-flow-execute/SKILL.md` Schritt 3.8 heißt „Code-Review-Gate (Orchestrator, PFLICHT vor Auto-Merge)". Bei `check-pr-automerge.sh` rc=1 bricht das Gate fail-closed ab und überlässt dem Operator die Entscheidung (Design D2 aus T006282).
- Der CI-Workflow „Enable Auto-Merge" aktiviert Auto-Merge auf PRs selbst. Belegt an PR #6062: `auto_squash_enabled` durch den Workflow, nach manuellem `--disable-auto` erneut aktiv nach dem nächsten grünen Push, Merge 2026-09-27T18:17:54Z vor dem dritten Review.
- `openspec/specs/agent-skills.md` schreibt das fail-closed-Verhalten als SHALL fest (Requirement „dev-flow-execute erkennt extern aktivierten Auto-Merge"). Das Finalizer-Requirement setzt „nach dem bestandenen Code-Review-Gate" voraus.
- Guards: `tests/spec/agent-skills/review-gate-before-auto-merge.bats` (Abschnitt `Code-Review-Gate` mit `gh pr merge --auto` und `requesting-code-review`), `automerge-preflight-check.bats` (Gate-Abschnitt ruft `check-pr-automerge.sh`), `dev-flow-lifecycle-contract.bats` (Reihenfolge Review < Phase-Chain < Merge < Finalizer, Regex auf „re-review").

## 2. Entscheidungen

- **D1 Merge-Kriterium:** Grüne Required Checks plus bestandener Phase-Chain-Assert. Ein Review ist keine Merge-Voraussetzung.
- **D2 Review-Trigger:** Nur auf ausdrücklichen Zuruf des Operators in der laufenden Session. Default: kein Review. Kein neuer Env-Schalter.
- **D3 Aktives Auto-Merge:** `check-pr-automerge.sh` rc=1 heißt „Auto-Merge bereits aktiv, Merge läuft bei grüner CI". Der Orchestrator deaktiviert Auto-Merge nie und bricht nicht ab. rc=2 bleibt Abbruch als Umgebungsfehler.
- **D4 Späte Findings:** Läuft ein verlangtes Review und der PR ist schon gemergt, gehen Findings als Folge-Ticket (`type=bug` bei Defekten) und Folge-PR raus. Vor dem Merge gehen sie per `SendMessage` an den bereits gespawnten Implementer.
- **D5 Unverändert:** `scripts/check-pr-automerge.sh`, Pre-Flight 1.4.7 (Doppel-Execution-Abbruch bei aktivem Auto-Merge auf fremdem PR), Implementer fordert selbst kein Auto-Merge an, Phase-Chain-Assert bleibt fail-closed vor `gh pr merge --auto --squash`.

## 3. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `.opencode/skills/dev-flow-execute/SKILL.md` | Schritt 3.8 neu als „Merge-Gate, Code-Review optional (Orchestrator)"; Verweise in Schritt 2, 3.9, 5, 5.5 angleichen |
| `.opencode/skills/dev-flow-execute/references/implementer-handoff.md` | „Code-Review-Gate"/„Review-Gate" → „Merge-Gate" |
| `.opencode/skills/references/dev-flow-lifecycle.md` | Review nur auf Zuruf; Re-Entry nennt Phase-Chain und CI, Review nur wenn verlangt |
| `.opencode/skills/OVERVIEW.md` | Tabelle und Verifikations-Leiter: Stufe 3 optional auf Zuruf |
| `openspec/changes/review-gate-optional/specs/agent-skills.md` | MODIFIED: zwei Requirements |
| `tests/spec/agent-skills/*.bats` (3 Dateien) | Guards auf das neue Verhalten |
| `components/website/src/data/test-inventory.json` | regeneriert |
