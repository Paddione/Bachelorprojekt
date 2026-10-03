---
title: "toolset-bp-roles — bp-*-Rollen in der Toolset-Kette"
ticket_id: T900980
domains: [agent-skills, dev-tooling, scripts]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# toolset-bp-roles — Implementation Plan

T900858 hat die sechs `bachelorprojekt-*`-Agenten durch `bp-build`/`bp-run`/`bp-ship` ersetzt und
nur `plan-context.sh` + `agents.yaml` nachgezogen. `AGENTS.md` verlangt
`toolset-context.sh <bp-*>`; das Skript kennt die Rollen nicht, bricht fail-closed mit Exit 2 ab,
und der Dispatch-Snippet lässt den `<toolset>`-Block still weg. Kein Domain-Subagent bekommt
heute einen kuratierten Werkzeug-Block; der Implementer aus `dev-flow-execute` bekam nie einen.

**Beleg (Symptom, reproduzierbar):**

```bash
for r in bp-build bp-run bp-ship; do bash scripts/toolset-context.sh "$r" >/dev/null; echo "$r rc=$?"; done
# bp-build rc=2 / bp-run rc=2 / bp-ship rc=2
```

**Ursache (belegt):** Das Rollenvokabular steht viermal hart kodiert — `scripts/toolset-context.sh`
(`VALID_ROLES`, `WILDCARD_ROLES`), `scripts/toolset/check.mjs`, `scripts/toolset/sync.mjs`,
`scripts/toolset/lib/resolve.mjs` — plus 82 `roles:`-Einträge und der `harnesses`-Block in
`capabilities.yaml`. Keine dieser Stellen wurde mit T900858 migriert.

_Ticket: T900980_

## Entscheidungen

- **D1 — Eine Quelle:** neues Modul `scripts/toolset/lib/roles.mjs` mit `ROLES`, `WILDCARD_ROLES`,
  `LEGACY_ROLE_ALIASES` und `resolveRole()`. `check.mjs`, `sync.mjs`, `resolve.mjs` und der
  Node-Teil von `toolset-context.sh` importieren es; die Bash-Arrays entfallen.
- **D2 — Zuordnung wie `plan-context.sh` (T900858):** `bp-build` = infra + security,
  `bp-run` = ops + db, `bp-ship` = website + test.
- **D3 — Aufrufer vs. Registry:** `toolset-context.sh` nimmt eine Legacy-Rolle noch an, löst sie
  auf die bp-Rolle auf und schreibt einen `veraltet`-Hinweis nach stderr. In der Registry ist eine
  Legacy-Rolle ein Fehler von `check.mjs` (mit Ersatzvorschlag) — die Registry wird in diesem PR
  vollständig migriert, ein Rückfall soll rot werden.
- **D4 — Fail-loud am Dispatch:** Der Snippet in `AGENTS.md` bricht bei Exit ≠ 0 ab, statt ohne
  Block zu dispatchen. `implementer-handoff.md` injiziert den Block mit der bp-Rolle aus den
  Plan-`domains`.
- **Außerhalb des Scopes:** `scripts/code-quality/validate.mjs` (`owner_agent`),
  `scripts/health-goals-check.sh`, `scripts/datamodel/workflow-map.yaml` nutzen die alten Namen
  als Agenten-Labels, nicht als Toolset-Rollen — eigenes Folgeticket.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/toolset/lib/roles.mjs` | 0 (neu) | 800 |
| `scripts/toolset-context.sh` | 158 | 642 |
| `scripts/toolset/check.mjs` | 253 | 547 |
| `scripts/toolset/sync.mjs` | 154 | 646 |
| `scripts/toolset/lib/resolve.mjs` | 65 | 735 |
| `docs/agent-guide/registry/capabilities.yaml` | 958 | n/a (S1-ungated) |
| `AGENTS.md` | 154 | n/a (S1-ungated) |
| `.opencode/skills/dev-flow-execute/references/implementer-handoff.md` | 46 | n/a (S1-ungated) |
| `.opencode/skills/toolset-curate/SKILL.md` | 151 | n/a (S1-ungated) |
| `taskfiles/Taskfile.agents.yml` | 471 | n/a (S1-ungated) |
| `tests/spec/toolset-registry/bp-roles.bats` | 100 (neu, Failing Test) | n/a (S1-ungated) |
| `tests/spec/toolset-registry/context-injection.bats` | 161 | n/a (S1-ungated) |
| `tests/spec/toolset-registry/schema-gate.bats` | 255 | n/a (S1-ungated) |

Budget geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <datei>`.

<!-- vitest: kein neuer Test nötig, weil keine Website-Datei berührt wird; die Regression deckt tests/spec/toolset-registry/bp-roles.bats über die Ausgabe von toolset-context.sh und check.mjs ab -->

## Task 1: Failing Test bestätigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/bp-roles.bats
```

expected: FAIL. Tests 1–7 schlagen fehl (bp-Rollen unbekannt, Legacy-Rolle in der Registry wird
akzeptiert). Test 8 (echte Registry besteht `check.mjs`) ist schon grün und muss es bleiben.

## Task 2: `roles.mjs` als einzige Quelle

- [ ] `scripts/toolset/lib/roles.mjs` anlegen: `ROLES` (`bp-build`, `bp-run`, `bp-ship`,
      `orchestrator`, `big-pickle`, `pi`, `all`), `WILDCARD_ROLES` (alle außer `pi` und `all`),
      `LEGACY_ROLE_ALIASES` nach D2, `resolveRole(name)` → `{ role, legacy }` oder `null`.
- [ ] `check.mjs`, `sync.mjs`, `lib/resolve.mjs`: lokale Listen durch Import ersetzen.
      `check.mjs` meldet eine Legacy-Rolle als `legacy role 'X' — use 'bp-…'` (Exit 1).
- [ ] `toolset-context.sh`: Validierung in den Node-Teil verlegen (Import von `roles.mjs`),
      Exit 2 + Usage mit den gültigen Rollen bei unbekannter Rolle beibehalten, Legacy-Rolle
      auflösen und `veraltet` auf stderr melden.

## Task 3: Registry migrieren

- [ ] Alle `roles:`-Listen in `capabilities.yaml` nach D2 umschreiben (deduplizieren,
      Reihenfolge bp-build, bp-run, bp-ship, Rest).
- [ ] `harnesses.claude.roles` → `[bp-build, bp-run]`, `harnesses.codex.roles` → `[bp-ship]`.
- [ ] `node scripts/toolset/sync.mjs && node scripts/toolset/check.mjs` → Exit 0, kein Drift.

## Task 4: Dispatch-Stellen

- [ ] `AGENTS.md` „Agent Routing": Snippet bricht bei Exit ≠ 0 von `toolset-context.sh` ab.
- [ ] `implementer-handoff.md` §Kontext-Injektion: `<toolset>`-Block mit der bp-Rolle aus den
      Plan-`domains` (Zuordnung D2), Fallback `orchestrator` bei gemischten Domains.
- [ ] `toolset-curate/SKILL.md`: Rollentabelle und Beispiele auf bp-*; `Taskfile.agents.yml`:
      `desc` auf `ROLE=bp-run`.
- [ ] `context-injection.bats` und `schema-gate.bats`: Fixtures auf bp-Rollen umstellen.

## Task 5: Finale Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/
node --test scripts/toolset/*.test.mjs
for r in bp-build bp-run bp-ship; do bash scripts/toolset-context.sh "$r" | grep -c '^### '; done
task test:changed
task freshness:regenerate
task freshness:check
```
