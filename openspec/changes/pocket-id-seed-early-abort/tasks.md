---
title: "pocket-id-seed-early-abort — Implementation Plan"
ticket_id: T001995
domains: [infra, auth]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-seed-early-abort — Implementation Plan

_Ticket: T001995_

## File Structure

```
k3d/pocket-id-client-seed.yaml                      (modified — up-front auth check)
tests/spec/pocket-id-client-seed-early-abort.bats   (new — RED test, already added)
```

## Root Cause (from spec)

`find_client_id()` (`k3d/pocket-id-client-seed.yaml`) swallows curl failures
(`|| true`), so an invalid `POCKET_ID_API_KEY` (401/403 on every admin API
call) is silently treated as "client not found" by `upsert()`, which then
attempts a POST to create a duplicate client — before `set -e` finally kills
the script. Each `restartPolicy: OnFailure` retry repeats this, creating
more zombie `oidc_clients` rows per retry (root cause behind the 45 zombie
rows found on `workspace-korczewski` in T001992).

## Tasks

- [x] **Failing-Test-Step (RED).** `tests/spec/pocket-id-client-seed-early-abort.bats`
      already added — asserts an `http_code`-based check exists before the
      `ROWS` processing loop and that it rejects on 401/403. Currently FAILS
      because no such check exists yet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-early-abort.bats
# expected: FAIL (red — the early-abort auth check is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** In `k3d/pocket-id-client-seed.yaml`, right after
      the existing lines

      ```sh
      AUTH="X-API-KEY: ${POCKET_ID_API_KEY}"
      CT="Content-Type: application/json"
      ```

      add an up-front auth check, before the `ROWS="..."` heredoc is even
      relevant (place it directly after `CT=...`, before `ROWS=`):

      ```sh
      # T001995: verify the API key BEFORE touching any client row. Without
      # this, an invalid key (401/403 on every call) is silently swallowed
      # by find_client_id()'s `|| true` and treated as "client not found" --
      # upsert() then attempts a POST (create) for every single row before
      # `set -e` finally kills the script, and restartPolicy: OnFailure
      # repeats this on every retry, each time adding more zombie
      # oidc_clients rows (T001992).
      auth_check_code=$(curl -fsS $CURL_RETRY -o /dev/null -w '%{http_code}' -H "$AUTH" "${API}/api/oidc/clients" </dev/null 2>/dev/null || echo "000")
      case "$auth_check_code" in
        401|403)
          echo "ERROR: POCKET_ID_API_KEY rejected by Pocket-ID (HTTP ${auth_check_code}) -- aborting before processing any client row. Check for API-key drift (see T001992)." >&2
          exit 1
          ;;
      esac
      ```

      Note `$CURL_RETRY` is defined later in the file (next to
      `find_client_id`) — move its definition (and the comment block above
      it) up to before this new check, since both need it. Run
      `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-early-abort.bats`
      again — both assertions must now pass.

- [ ] **Manifest validation.** `task workspace:validate` (kustomize build
      must still succeed — shell-script-in-ConfigMap change only).

- [ ] **Regression check.** Re-run the existing pocket-id-client-seed BATS
      files (`-auth-header`, `-secret-writeback`, `-timeout`,
      `-pagination`) to confirm no interference from moving `CURL_RETRY`'s
      definition earlier in the script.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
