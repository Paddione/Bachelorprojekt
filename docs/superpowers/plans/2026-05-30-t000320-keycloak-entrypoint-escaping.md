---
title: Fix T000320 — Keycloak realm-import entrypoint: doubled-dollar escaping
ticket_id: T000320
domains: [infra, ops, test, security]
status: active
pr_number: null
---

# Fix T000320 — Keycloak realm-import entrypoint: doubled-dollar escaping

**Goal:** Remove the `$$` doubled-dollar escaping artifacts from `prod/import-entrypoint.sh` so the Keycloak realm-import container stops emitting `line 45: ${$${var}:-}: bad substitution` on every startup.

**Root cause:** `prod/import-entrypoint.sh` is loaded **verbatim** into the `realm-template` ConfigMap by the `configMapGenerator` (`behavior: replace`) in both `prod-mentolder/` and `prod-korczewski/` (both inherit base `prod/` — no override). Kustomize does no `$$`→`$` de-escaping, and the prod manifest-level `envsubst` leaves `$$` untouched. So the literal `$${$${var}:-}` reaches `/bin/sh` and throws `bad substitution`. Non-fatal today (KC still boots) but the `sed`/`eval` substitution loop is silently broken, and the file's own header warns that an unsubstituted `${VAR}` landing in the KC DB breaks auth flows later.

The two canonical siblings — `scripts/import-entrypoint.sh` and `k3d/realm-import-entrypoint.sh` — use single `$` and are the known-good reference.

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `prod/import-entrypoint.sh` | De-double all `$$` → `$` (12 occurrences across 9 lines) |
| (test) | `tests/unit/keycloak-entrypoint-escaping.bats` | Already staged & failing (red) — guards parity with siblings |

## Task 1: De-double the escaping

The fix is a global de-doubling. Verified by dry-run that `sed 's/\$\$/\$/g'` reconstructs the **exact** canonical idiom — e.g. line 45 `\$${$${var}:-}` → `\${${var}:-}`, byte-identical to `scripts/import-entrypoint.sh:27`. The de-double does not touch the prod-specific variable list.

- [x] **Step 1: Apply the de-double**

```bash
sed -i 's/\$\$/\$/g' prod/import-entrypoint.sh
```

- [ ] **Step 2: Verify zero artifacts remain & syntax is valid**

```bash
grep -c '\$\$' prod/import-entrypoint.sh   # expect 0
sh -n prod/import-entrypoint.sh            # expect clean exit
```

- [ ] **Step 3: Confirm the substitution loop now matches the canonical sibling**

```bash
diff <(sed -n '44,57p' prod/import-entrypoint.sh) <(sed -n '26,40p' scripts/import-entrypoint.sh) || true
# Differences should be limited to the comment/var-list lines, NOT the
# eval/sed/grep substitution mechanics.
```

- [ ] **Step 4: Run the gate test — must go green**

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-entrypoint-escaping.bats
task test:all
```

## Verification

- `task test:all` green (includes the new BATS test).
- `task workspace:validate` (manifests touched indirectly via configMapGenerator input).
- Post-merge deploy: `task feature:deploy` (both clusters), then confirm the
  realm-import container logs no `bad substitution` on next Keycloak restart:
  `task workspace:logs ENV=mentolder -- keycloak` and `ENV=korczewski`.

## Notes

- Single fix covers **both** clusters — `prod/` is the shared base inherited by both overlays.
- No realm JSON or var-list changes; purely an escaping correction.
