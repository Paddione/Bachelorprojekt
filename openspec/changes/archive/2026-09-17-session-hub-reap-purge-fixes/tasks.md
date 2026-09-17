---
title: "session-hub-reap-purge-fixes — Implementation Plan"
ticket_id: T016251
domains: [sessions, infra, website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [T016250]
---

# session-hub-reap-purge-fixes — Implementation Plan

_Ticket: T016251_

Design-Entscheidungen und verworfene Alternativen: `design.md`.
Der RED-Test (`tests/spec/sessions-server/reap-untracked.bats`) ist im Stage-Commit
enthalten und muss gegen den Unverändert-Stand rot laufen (STRUCT2 unten).

## File Structure

```
scripts/session-hub.sh                                          # MODIFIED — RC1 reap-untracked, RC2 Sync-Ziele, RC4 Domain-Fallback
k3d/configmap-domains.yaml                                      # MODIFIED — RC4 SESSIONS_DOMAIN-Eintrag
k3d/sessions-server.yaml                                        # MODIFIED — RC4 server_name via ${SESSIONS_DOMAIN}, Nit: health default_type
prod-fleet/mentolder/sessions-server.yaml                       # MODIFIED — RC3 middlewares + /oauth2-Route
prod-fleet/mentolder/oauth2-proxy-sessions.yaml                 # NEW — RC3 oauth2-proxy ForwardAuth (Muster aus k3d/dev-stack/)
components/website/src/lib/sessions/archive.ts                  # MODIFIED — RC2 RegistryEntry angleichen, Endung je Content-Type
components/website/src/pages/api/admin/sessions/index.ts        # MODIFIED — RC2 SessionEntry angleichen
tests/spec/sessions-server/reap-untracked.bats                  # RED (bereits vorhanden) → GREEN nach Fix
tests/spec/sessions-server/domain-config.bats                   # NEW — RC4 Guard (zentrale Domain, keine Hardcode-Neuzüchtung)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-implement.md | implement | scripts/session-hub.sh, k3d/configmap-domains.yaml, k3d/sessions-server.yaml, prod-fleet/mentolder/sessions-server.yaml, prod-fleet/mentolder/oauth2-proxy-sessions.yaml, components/website/src/lib/sessions/archive.ts, components/website/src/pages/api/admin/sessions/index.ts | |
| p2 | tasks.d/p2-tests.bats.md | tests | tests/spec/sessions-server/reap-untracked.bats, tests/spec/sessions-server/domain-config.bats | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der mitgestagte Test reproduziert RC1 und
      muss gegen den Unverändert-Stand scheitern. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
cd <worktree> && tests/unit/lib/bats-core/bin/bats tests/spec/sessions-server/reap-untracked.bats
# expected: FAIL (red — cmd_reap löscht register-Einträge mit server_pid=0)
```

- [ ] **Fix-Step (GREEN).** Partials p1+p2 umsetzen; danach alle Suiten grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sessions-server*
(cd components/website && pnpm test:unit)
bash scripts/openspec.sh validate session-hub-reap-purge-fixes
task workspace:validate
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
