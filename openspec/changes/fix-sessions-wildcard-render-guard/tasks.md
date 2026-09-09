---
title: "fix-sessions-wildcard-render-guard — Implementation Plan"
ticket_id: T900029
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-sessions-wildcard-render-guard — Implementation Plan

_Ticket: T900029 — [SA-SEC-01] sessions-wildcard, sev=critical. Nur
mentolder-Scope (korczewski separat); Guard als gemeinsames Helper-Skript
`scripts/render-guard.sh`, kein Duplikat in beiden Render-Pfaden. Die
statische Haelfte (SESSIONS_DOMAIN in schema.yaml/mentolder.yaml) steht seit
Parent-Commit 654b4b8ae (T900042) — hier fehlt nur die fail-closed
Guard-Haelfte._

## File Structure

```
scripts/render-guard.sh                                  # NEW — fail-closed Guard-Helper
scripts/flux-render-artifact.sh                          # MODIFIED — Guard-Aufruf in render_component
Taskfile.yml                                             # MODIFIED — Guard im prod-Zweig von workspace:deploy
tests/spec/sessions-server/wildcard-render-guard.bats    # NEW — BATS Rot-Gruen-Guard
openspec/changes/fix-sessions-wildcard-render-guard/     # Plan-Artefakte (proposal, specs, tasks)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1-render-guard | tasks.d/p1-render-guard.md | impl | scripts/render-guard.sh, scripts/flux-render-artifact.sh, Taskfile.yml |  |
| p2-guard-tests | tasks.d/p2-guard-tests.md | tests | tests/spec/sessions-server/wildcard-render-guard.bats | p1-render-guard |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test aus p2 reproduziert den
      Bug auf dem unfixten Stand (leere Wildcard-Reste + unsubstituierte
      Platzhalter → Build-Fehler). Details + Runner-Aufruf stehen in
      `tasks.d/p2-guard-tests.md` (`expected: FAIL` auf Rot).

- [ ] **Fix-Step (GREEN).** p1 implementieren (Helper + Einbindung in beide
      Render-Pfade). Der BATS-Test aus dem vorherigen Schritt muss nun
      vollstaendig passen; `SESSIONS_DOMAIN=""`-Voll-Render bricht mit
      Guard-Meldung ab (Exit 1), gesunder Render passiert ohne False Positive
      (mentolder + korczewski verifiziert).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
