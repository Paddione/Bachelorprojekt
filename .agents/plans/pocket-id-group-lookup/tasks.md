---
title: pocket-id-client-seed Lookup unabhaengig von der JSON-Feldreihenfolge
ticket_id: T900804
domains: [infra, auth]
status: implemented
---

# pocket-id-group-lookup — Implementation Plan

## File Structure

- `k3d/pocket-id-client-seed.yaml` — Seed-Skript: gemeinsamer Helper `id_by_name`, `find_client_id` und `find_group_id` nutzen ihn
- `tests/spec/pocket-id-client-seed-group-lookup.bats` — RED-Test (bereits committed), wird durch P1 gruen
- `components/website/src/data/test-inventory.json` — Inventareintrag (bereits committed)
- `.agents/plans/pocket-id-group-lookup/tasks.md` — dieser Index
- `.agents/plans/pocket-id-group-lookup/tasks.d/p1-id-by-name.md` — Fix
- `.agents/plans/pocket-id-group-lookup/tasks.d/p2-group-lookup-tests.md` — Testabnahme

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-id-by-name.md | impl | k3d/pocket-id-client-seed.yaml |  |
| P2 | tasks.d/p2-group-lookup-tests.md | tests | tests/spec/pocket-id-client-seed-group-lookup.bats | P1 |

## Root Cause (belegt)

Symptom (Fakt): `flux-staging` Ready=False seit 2026-09-28, `Job/workspace-staging/pocket-id-client-seed` BackoffLimitExceeded.

Ursache (live belegt 2026-10-05): Eine Diagnose-Kopie des Jobs (`restartPolicy: Never`) auf `fleet/workspace-staging` lieferte: alle 19 Clients `updated … secret unchanged`, danach `curl: (22) The requested URL returned error: 409`. Pocket ID v2.14.0 liefert `/api/user-groups` als `{"id":…,"friendlyName":…,"name":"workspace-users"}`. `find_group_id` greppt `"id":"…","name":"<name>"` als benachbarte Felder, findet die vorhandene Gruppe nicht, `ensure_group` POSTet erneut, Pocket ID antwortet 409, `set -e` beendet den Job. Der API-Key ist gueltig (GET `/api/oidc/clients` mit `X-API-KEY` → HTTP 200). `find_client_id` traegt dieselbe Reihenfolge-Annahme; sie haelt heute nur, weil Clients `id,name` benachbart liefern.

```bash
# Reproduktion der Ursache (Diag-Kopie des Jobs, Logs bleiben erhalten)
kubectl --context fleet -n workspace-staging get job pocket-id-client-seed -o json \
  | python3 -c 'import json,sys; j=json.load(sys.stdin); j["metadata"]={"name":"pocket-id-client-seed-diag","namespace":"workspace-staging"}; s=j["spec"]; s.pop("selector",None); s["template"]["metadata"]["labels"]={"app":"pocket-id-client-seed"}; s["backoffLimit"]=0; s["template"]["spec"]["restartPolicy"]="Never"; j.pop("status",None); print(json.dumps(j))' \
  | kubectl --context fleet create -f -
kubectl --context fleet -n workspace-staging logs job/pocket-id-client-seed-diag --all-containers | tail -3
```

## Task 1 — P1 umsetzen

Siehe `tasks.d/p1-id-by-name.md`. Failing-Test-Step:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats
# vor dem Fix  -> expected: FAIL (Test 1 und 2 rot, Test 3 gruen)
# nach dem Fix -> 3/3 ok
```

## Task 2 — P2 Testabnahme

Siehe `tasks.d/p2-group-lookup-tests.md`: RED-Test unveraendert gruen, Seed-Specs ohne Regression.

## Task 3 — Verify

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/pocket-id-client-seed*   # alle Seed-Specs gruen
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```

Nach dem Merge und Flux-Reconcile: `kubectl --context fleet get kustomizations -n flux-system flux-staging` zeigt `READY=True`, und das Log des neuen Seed-Jobs endet mit `group workspace-users exists (id=…)` und `seed complete`.
