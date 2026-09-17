---
title: "embed-hook-live-backend — Implementation Plan"
ticket_id: T900209
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# embed-hook-live-backend — Implementation Plan

_Ticket: T900209_ · Proposal: `openspec/changes/embed-hook-live-backend/proposal.md`

## File Structure

```
tests/spec/openspec-embedding/embed-probe-fail-fast.bats   (neu, RED-Test)
scripts/openspec-embed-local.sh                            (Probe: connect-timeout, Bearer, Exit 3)
scripts/openspec-embed.mjs                                 (defaultEmbed: Bearer)
.githooks/post-commit-embed                                (kein Retry nach Exit 3)
openspec/changes/embed-hook-live-backend/specs/openspec-embedding.md
```

S1-Budgets (Limit aus `docs/code-quality/gates.yaml`, keine der Dateien gebaselined):
`openspec-embed-local.sh` 209 → ~221 von 800 (.sh), `openspec-embed.mjs` 585 → ~589 von 800
(.mjs), `.githooks/post-commit-embed` 83 → ~89 (keine Endung, nicht gemessen).

## Task 1 — Failing Test (RED)

- [ ] `tests/spec/openspec-embedding/embed-probe-fail-fast.bats` anlegen: Wrapper gegen einen
      toten Port (Exit 3, curl 7), gegen HTTP 401 (Exit 3, nennt `LLM_PROXY_ADMIN_TOKEN`),
      gegen HTTP 500 (Exit 1, Anker), Bearer in Probe und `defaultEmbed()`, Hook-Aufrufzahl
      bei Wrapper-Exit 3 (1×) und Exit 1 (3×, Anker).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/embed-probe-fail-fast.bats
# expected: FAIL (Tests 1, 2, 4, 5, 6 rot; 3 und 7 sind Regressions-Anker und gruen)
```

## Task 2 — Fix (GREEN)

- [ ] `scripts/openspec-embed-local.sh`: `probe_embed` mit
      `--connect-timeout "${OPENSPEC_EMBED_CONNECT_TIMEOUT:-3}"` und optionalem
      `Authorization: Bearer ${LLM_PROXY_ADMIN_TOKEN}`; `probe_diagnosis` nennt bei 401/403 den
      Token; nach der Remediation `exit 3` fuer `6:*|7:*|0:401|0:403|0:404`, sonst `exit 1`;
      Remediation-Text auf `devmesh-forward.service`, Token und `LLM_EMBED_URL`.
- [ ] `scripts/openspec-embed.mjs`: `defaultEmbed()` sendet den Bearer, wenn
      `LLM_PROXY_ADMIN_TOKEN` gesetzt ist.
- [ ] `.githooks/post-commit-embed`: Exit-Code des Wrappers erfassen, bei 3 ohne Retry
      abbrechen (WARN bleibt non-fatal).

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-embedding* \
  tests/spec/local-llm-proxy/gateway-consumer-lint.bats tests/spec/local-llm-proxy/embed-probe-timeout.bats
# expected: PASS
```

## Task 3 — Final Verification

- [ ] Die drei CI-Gates laufen gruen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
