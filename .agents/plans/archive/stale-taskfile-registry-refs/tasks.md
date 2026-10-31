---
title: stale-taskfile-registry-refs
domains: [taskfiles, llm-proxy]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# stale-taskfile-registry-refs — Implementation Plan

Evidenz: [#6810](https://github.com/Paddione/Bachelorprojekt/issues/6810)
(EOSQL-Heredoc) und [#6814](https://github.com/Paddione/Bachelorprojekt/issues/6814)
(retirter Registry-Check). Spec: `design.md` in diesem Verzeichnis.
Base: `origin/main`, Branch `fix/stale-taskfile-registry-refs`, Worktree
`/home/patrick/.worktrees/Bachelorprojekt/fix/stale-taskfile-registry-refs`.
Alle Git-Aufrufe als `git -C "$WT"`, alle Befehle im Worktree.

## File Structure

- `tests/py/spec/ci_cd_specs/test_taskfile_registry_guards.py` — neu, zwei
  Guards (RED belegt, GREEN nach Fix).
- `taskfiles/Taskfile.data.yml` — geändert, nur Delimiter-Dedent (Netto-Null).
- `taskfiles/Taskfile.devmesh.yml` — geändert, Check-Umstellung (kürzer).
- `components/website/src/data/test-inventory.json` — generiert, plus ein
  Eintrag nach `task test:inventory`.
- `.agents/plans/stale-taskfile-registry-refs/tasks.md` — dieser Plan.

S1: beide Taskfiles sind ungated und unbaselined (keine yml-Extension in
`s1.limits`) — kein Zeilen-Gate greift. Der neue pytest-Guard ist klein und
bleibt weit unter dem py-Limit.

<!-- vitest: kein neuer Test nötig, weil keine TypeScript- oder Svelte-Datei geändert wird -->

## Task 1 — Rotphase belegen (RED)

Im Worktree ausführen:

```bash
python3 -m pytest tests/py/spec/ci_cd_specs/test_taskfile_registry_guards.py -v
```

expected: FAIL — beide Tests rot (`EOSQL-Heredoc ohne Spalte-0-Delimiter`,
`tickets.llm_proxy_backends` gefunden). Erst danach implementieren.

## Task 2 — Fix #6810 (Heredoc-Delimiter)

In `taskfiles/Taskfile.data.yml` den schließenden Delimiter des
Massage-Ownership-Heredocs auf die Block-Basis-Einrückung zurücksetzen
(Leerzeichen vor `EOSQL` entfernen, Body unverändert). Verify:

```bash
python3 -m pytest tests/py/spec/ci_cd_specs/test_taskfile_registry_guards.py::test_db_migrate_eosql_delimiter_at_column_zero -q
python3 -c "import yaml; d=yaml.safe_load(open('taskfiles/Taskfile.data.yml')); open('/tmp/db-migrate-check.sh','w').write(d['tasks']['db:migrate']['cmds'][0])"
bash -n /tmp/db-migrate-check.sh && echo "shell-syntax ok"
```

Commit-Vorgabe: `fix(infra): close EOSQL heredoc in db:migrate massage branch (#6810)`.

## Task 3 — Fix #6814 (Registry-Check auf Env-JSON)

In `taskfiles/Taskfile.devmesh.yml` (`registry:migrate`) den
`tickets.llm_proxy_backends`-Count ersetzen durch Zählung aus
`LLM_PROXY_BACKENDS_JSON` des live Deployments (Kennzahlen `aktiv` und
`loopback` wie bisher, Quelle `kubectl get deploy/llm-services -o json` plus
`python3`-Auswertung; Seeden und Passwort-Schritte unverändert). Verify:

```bash
python3 -m pytest tests/py/spec/ci_cd_specs/test_taskfile_registry_guards.py -q
grep -rn "tickets.llm_proxy_backends" taskfiles/ | wc -l
```

Commit-Vorgabe: `fix(infra): read registry check from LLM_PROXY_BACKENDS_JSON (#6814)`.

## Task 4 — Verify, Inventar, PR

```bash
task workspace:validate
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

Inventar plus alle generierten Artefakte explizit stagen und committen
(kein Broad-Add). Danach PR gegen `main` (squash-merge, kein Direkt-Push),
Merge-Gate plus CI-Watch beim Orchestrator.
