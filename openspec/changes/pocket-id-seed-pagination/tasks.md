---
title: "pocket-id-seed-pagination — Implementation Plan"
ticket_id: T001996
domains: [infra, auth]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-seed-pagination — Implementation Plan

_Ticket: T001996_

## File Structure

```
k3d/pocket-id-client-seed.yaml           (modified — find_client_id() pagination loop)
tests/spec/pocket-id-client-seed-pagination.bats   (new — RED test, already added)
```

## Root Cause (from spec)

`find_client_id()` (`k3d/pocket-id-client-seed.yaml:231-235`) issues a single
`GET ${API}/api/oidc/clients` with no pagination parameter. Pocket-ID v2.9.0
hard-caps `itemsPerPage` at 20 server-side and ignores any requested override
(live-verified). Past 20 `oidc_clients` rows, names on page 2+ are invisible
to the lookup, so the job creates duplicate client rows instead of reusing
the existing one.

## Tasks

- [x] **Failing-Test-Step (RED).** `tests/spec/pocket-id-client-seed-pagination.bats`
      already added — asserts `find_client_id()` issues a `pagination[page]`
      parameter and reads `totalPages` to terminate. Currently FAILS because
      the function does neither.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-pagination.bats
# expected: FAIL (red — the pagination loop is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** In `k3d/pocket-id-client-seed.yaml`, rewrite
      `find_client_id()` to loop:

  ```sh
  find_client_id() {
    name="$1"
    page=1
    while :; do
      list=$(curl -fsS $CURL_RETRY -H "$AUTH" "${API}/api/oidc/clients?pagination%5Bpage%5D=${page}" </dev/null 2>/dev/null || true)
      id=$(echo "$list" | grep -o "\"id\":\"[^\"]*\",\"name\":\"${name}\"" | head -1 | sed -E 's/"id":"([^"]*)".*/\1/')
      if [ -n "$id" ]; then
        echo "$id"
        return
      fi
      total_pages=$(echo "$list" | grep -o '"totalPages":[0-9]*' | head -1 | sed -E 's/"totalPages":([0-9]*)/\1/')
      if [ -z "$total_pages" ] || [ "$page" -ge "$total_pages" ]; then
        echo ""
        return
      fi
      page=$((page + 1))
    done
  }
  ```

  Preserve the existing comment block above the function (T001327 retry
  rationale) — only the function body changes. Run
  `tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-pagination.bats`
  again — both assertions must now pass.

- [ ] **Manifest validation.** `task workspace:validate` (kustomize build must
      still succeed — this is a shell-script-in-ConfigMap change, no YAML
      structure change).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
