#!/usr/bin/env bats
# Tests for scripts/plan-frontmatter-hook.sh — verifies that an EXISTING but
# INCOMPLETE frontmatter block (placeholder domains / missing status) gets
# repaired in place instead of being skipped by the line-1-only guard. [T000422]
#
# RED-phase note: against the current hook (which bails at the first `---`),
# the "repair" cases below FAIL — that is the reproduction. After the fix they
# pass. The "preserve" / "idempotent" / "no-frontmatter" cases guard behavior
# that must remain true before AND after the fix.

setup() {
  HOOK="$BATS_TEST_DIRNAME/../../scripts/plan-frontmatter-hook.sh"
  TMP="$(mktemp -d)"

  # A — NO frontmatter at all (writing-plans output starts with `# `).
  cat > "$TMP/a-none.md" <<'EOF'
# My Plan

This plan touches k3d/ manifests and kustomize overlays.
EOF

  # B — present but domains: [] (orphaned from every role); body has infra+db signals.
  cat > "$TMP/b-empty-domains.md" <<'EOF'
---
title: Existing
ticket_id: T000999
domains: []
status: active
pr_number: null
---

# Existing Plan

Touches k3d/ kustomize overlays and a database schema query.
EOF

  # C — present but missing the status line entirely.
  cat > "$TMP/c-missing-status.md" <<'EOF'
---
title: NoStatus
domains: [infra]
---

# Plan

Touches k3d/ manifests.
EOF

  # D — deliberate non-active status must be PRESERVED, never forced to active.
  cat > "$TMP/d-deliberate-done.md" <<'EOF'
---
title: Done plan
domains: [infra]
status: done
---

# Plan

Touches k3d/ manifests.
EOF

  # E — already complete: re-running the hook must be a clean no-op (idempotent).
  cat > "$TMP/e-complete.md" <<'EOF'
---
title: Complete
ticket_id: null
domains: [infra]
status: active
pr_number: null
---

# Plan

Touches k3d/ manifests.
EOF

  # F — domains: null (literal) with website signals in the body.
  cat > "$TMP/f-null-domains.md" <<'EOF'
---
title: NullDomains
domains: null
status: active
---

# Plan

Touches the website/ astro and svelte components.
EOF
}

teardown() { rm -rf "$TMP"; }

# ── Regression guard: no-frontmatter path is unchanged ───────────────

@test "no frontmatter: prepends a full block with derived domains + status:active" {
  run bash "$HOOK" "$TMP/a-none.md"
  [ "$status" -eq 0 ]
  head -1 "$TMP/a-none.md" | grep -q '^---'
  grep -Eq '^domains:.*infra' "$TMP/a-none.md"
  grep -Eq '^status: active$' "$TMP/a-none.md"
}

# ── RED: incomplete-frontmatter repair (the T000422 bug) ─────────────

@test "domains: [] is re-derived and filled from the body (infra+db)" {
  run bash "$HOOK" "$TMP/b-empty-domains.md"
  [ "$status" -eq 0 ]
  grep -Eq '^domains:.*infra' "$TMP/b-empty-domains.md"
  grep -Eq '^domains:.*db'    "$TMP/b-empty-domains.md"
  # existing fields must be preserved
  grep -q 'ticket_id: T000999' "$TMP/b-empty-domains.md"
}

@test "missing status: gets status: active added, domains preserved" {
  run bash "$HOOK" "$TMP/c-missing-status.md"
  [ "$status" -eq 0 ]
  grep -Eq '^status: active$' "$TMP/c-missing-status.md"
  grep -Eq '^domains:.*infra'  "$TMP/c-missing-status.md"
}

@test "domains: null is treated as incomplete and filled (website)" {
  run bash "$HOOK" "$TMP/f-null-domains.md"
  [ "$status" -eq 0 ]
  grep -Eq '^domains:.*website' "$TMP/f-null-domains.md"
  ! grep -Eq '^domains: *null' "$TMP/f-null-domains.md"
}

# ── Guards: must hold before AND after the fix ───────────────────────

@test "deliberate status: done is preserved, not forced to active" {
  run bash "$HOOK" "$TMP/d-deliberate-done.md"
  [ "$status" -eq 0 ]
  grep -Eq '^status: done$' "$TMP/d-deliberate-done.md"
  ! grep -Eq '^status: active$' "$TMP/d-deliberate-done.md"
}

@test "complete frontmatter is idempotent (no churn on re-run)" {
  before="$(cat "$TMP/e-complete.md")"
  run bash "$HOOK" "$TMP/e-complete.md"
  [ "$status" -eq 0 ]
  after="$(cat "$TMP/e-complete.md")"
  [ "$before" = "$after" ]
}

@test "no duplicate frontmatter block is ever created" {
  bash "$HOOK" "$TMP/b-empty-domains.md" >/dev/null
  # exactly one frontmatter delimiter pair at the top: line 1 is --- and the
  # next --- closes it; there must be only ONE leading block.
  [ "$(head -1 "$TMP/b-empty-domains.md")" = "---" ]
  count="$(awk '/^---$/{c++} END{print c+0}' "$TMP/b-empty-domains.md")"
  # a single frontmatter block contributes exactly 2 delimiter lines
  [ "$count" -eq 2 ]
}
