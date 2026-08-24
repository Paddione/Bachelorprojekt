---
title: "openspec-validate-slug-arg — Implementation Plan"
ticket_id: T015825
domains: [scripts-infra]
status: active
file_locks:
  - scripts/openspec.sh
shared_changes: false
batch_id: null
parent_feature: T015917
depends_on_plans:
  - openspec/changes/stray-dir-validate-guard/tasks.md
---

# openspec-validate-slug-arg — Implementation Plan

_Ticket: T015825 · Batch-Anker: T015917 · Parent-Spec: `openspec/specs/openspec-workflow.md`_

## File Structure

| Datei | Aktion | Ist-Zeilen | Budget |
|---|---|---|---|
| `scripts/openspec.sh` | modified | 506 | 294 |
| `tests/spec/openspec-workflow/validate-slug-arg.bats` | new | ~0 | neu unter Limit 800 (.sh) |
| `openspec/changes/openspec-validate-slug-arg/specs/openspec-workflow.md` | new (Delta) | — | — |

Budget-Hinweis: `scripts/openspec.sh` ist nicht gebaselined (`jq -r '."S1:scripts/openspec.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`), wirksame Schwelle ist das statische Extension-Limit `.sh: 800` aus `docs/code-quality/gates.yaml`; Ist 506 → Restbudget 294 Zeilen. Der geplante Umbau von `cmd_validate` braucht deutlich weniger (+~25 Zeilen); kein Split nötig.

## Koordination mit T015759 (PFLICHT vor Execute)

T015759 (Stray-Dir-Guard in `cmd_validate`, Change `stray-dir-validate-guard`) läuft parallel
in Execution und ändert dieselbe Funktion in `scripts/openspec.sh`. Dieser Plan schreibt gegen
main-Stand 5cbaa7c7 und nimmt KEINE Rücksicht auf den Guard-Umbau. **Der Executor MUSS vor dem
ersten Task den Branch auf main rebasen, sobald T015759 gemergt ist** — Konflikterwartung im
Loop-Körper von `cmd_validate`. Die Slug-Argument-Logik dieses Plans sitzt am Funktionskopf
(Argument-Parsing vor der Glob-Schleife) und ist mit dem Stray-Dir-Guard im Loop-Körper
inhaltlich unabhängig; der Rebase löst die textuellen Konflikte. Ist T015759 noch offen,
wartet der Executor auf den Merge (Ticket wurde mit `execution_released=false` gestaged).

## Tasks

### Task 1 — RED: BATS-Test für Slug-Argument-Verhalten anlegen

Neue Testdatei `tests/spec/openspec-workflow/validate-slug-arg.bats` (eigene Datei je
Vorgang, T002416), Muster: Sandbox-`OPENSPEC_ROOT` wie `archive-deliverable-guard.bats`
(`mkdir -p "$SANDBOX/openspec/changes/<slug>/specs"`, wohlgeformtes Delta + `.ticket`).
Output-Verifikation statt Source-Grep (T002448-M4), semantische Zusicherungen ohne
Zeilenanker (T002716). Vier Tests:

1. `validate good` validiert gezielt nur `good`: Sandbox mit wohlgeformtem Change `good`
   UND regelverletzender Change `broken` (H2-Requirement-Fehler) → Exit 0, Ausgabe nennt
   `good` und nicht `broken`.
2. Unbekanntes Slug-Argument: `validate does-not-exist` → Exit ungleich 0, Ausgabe nennt
   den unbekannten Slug (fail-closed).
3. Voll-Lauf kenntlich: nur wohlgeformte Changes in der Sandbox → `validate` ohne Argument
   endet rc=0 mit Abschlusszeile, die den Voll-Lauf markiert (`all changes`).
4. Mehr als ein Positionsargument: `validate a b` → Exit ungleich 0 mit Usage-Hinweis;
   Positiv-Anker im selben Test (T002356-M1): der Ein-Argument-Aufruf derselben Sandbox
   läuft rc=0.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/validate-slug-arg.bats
# expected: FAIL (rot — cmd_validate liest $@ heute nie, alle vier Tests laufen ins alte Voll-Lauf-Verhalten)
```

### Task 2 — GREEN: cmd_validate um Slug-Argument-Logik erweitern

In `cmd_validate` (scripts/openspec.sh:419) am Funktionskopf:

- `$#`-Auswertung: `0` Argumente → Voll-Lauf wie heute, Abschlusszeile
  `openspec validate: OK (all changes)`; `1` Argument → Loop nur über
  `$OPENSPEC_ROOT/changes/<slug>/`; fehlt das Verzeichnis → `FAIL: no change named '<slug>'`
  auf stderr, rc=1; `>1` Argumente → Usage-Zeile auf stderr, rc=2, ohne Prüflauf.
- Abschlusszeile bei Slug-Lauf: `openspec validate: OK (<slug>)` — Präfix `openspec validate:`
  bleibt stabil (Spec-Scenario verlangt die Ausgabe `openspec validate: OK`; Health-Gate
  G-SPEC01 in `scripts/health-goals-check.sh:704` misst nur den Exit-Code, bleibt unberührt).
- Keine Änderung an `_validate_delta_file`, `_ticket_exempt_slug` oder der Prüflogik im
  Loop-Körper — genau das ist der Konfliktbereich mit T015759, siehe Abschnitt oben.
- Usage-Text in Skriptkopf (Zeile 9) ergänzen: `validate [slug]`.

Danach Task 1 erneut ausführen — alle vier Tests müssen grün sein, plus Regression über den
gesamten Spec-Ordner:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/
```

### Task 3 — Delta-Spec prüfen und Verify

- Delta `openspec/changes/openspec-validate-slug-arg/specs/openspec-workflow.md` liegt diesem
  Plan bei (MODIFIED des Requirements „Validate ist ein fail-closed CI-Gate für Delta-Dateien",
  bestehende vier Scenarios unverändert übernommen, drei neue Scenarios + Abweisungs-Senario).
- Gegenprobe auf dem echten Repo-Baum (kein Sandbox-Override):
  `bash scripts/openspec.sh validate openspec-validate-slug-arg` → rc=0, Ausgabe nennt nur
  diesen Slug; `bash scripts/openspec.sh validate` → rc=0 mit `(all changes)`-Kennzeichnung.

Finale Verifikation (CI-Äquivalent):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Nach der Test-Änderung `task test:inventory` ausführen und
`components/website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check sonst rot).
