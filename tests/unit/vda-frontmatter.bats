#!/usr/bin/env bats
# vda-frontmatter.bats — tests for scripts/vda/frontmatter.sh
# Replaces the deprecated plan-frontmatter-hook.bats + frontmatter-batch.bats.

bats_require_minimum_version 1.5.0
load test_helper

VDA="${PROJECT_DIR}/scripts/vda.sh"

setup() {
  TMP="$(mktemp -d)"

  # A — NO frontmatter at all
  cat > "$TMP/a-none.md" <<'EOF'
# My Plan

This plan touches k3d/ manifests and kustomize overlays.
EOF

  # B — present but domains: [] (orphaned); body has infra+db signals
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

  # C — present but missing the status line entirely
  cat > "$TMP/c-missing-status.md" <<'EOF'
---
title: NoStatus
domains: [infra]
---

# Plan

Touches k3d/ manifests.
EOF

  # D — deliberate non-active status must be PRESERVED
  cat > "$TMP/d-deliberate-done.md" <<'EOF'
---
title: Done plan
domains: [infra]
status: done
---

# Plan

Touches k3d/ manifests.
EOF

  # E — already complete: idempotent no-op
  cat > "$TMP/e-complete.md" <<'EOF'
---
title: Complete
ticket_id: null
domains: [infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan

Touches k3d/ manifests.
EOF

  # F — domains: null with website signals
  cat > "$TMP/f-null-domains.md" <<'EOF'
---
title: NullDomains
domains: null
status: active
---

# Plan

Touches the website/ astro and svelte components.
EOF

  # G — incomplete frontmatter missing batch fields
  cat > "$TMP/g-missing-batch.md" <<'EOF'
---
title: BatchTest
ticket_id: T000999
domains: [infra]
status: active
pr_number: null
---

# Plan

Touches k3d/ manifests.
EOF
}

teardown() { rm -rf "$TMP"; }

# ── Case A: no frontmatter → derive, prepend ──────────────────────────

@test "no frontmatter: prepends a full block with derived domains + status:active" {
  run bash "$VDA" frontmatter "$TMP/a-none.md"
  [ "$status" -eq 0 ]
  head -1 "$TMP/a-none.md" | grep -q '^---'
  grep -Eq '^domains:.*infra' "$TMP/a-none.md"
  grep -Eq '^status: active$' "$TMP/a-none.md"
}

@test "no frontmatter: includes batch fields" {
  run bash "$VDA" frontmatter "$TMP/a-none.md"
  [ "$status" -eq 0 ]
  grep -q 'file_locks: \[\]' "$TMP/a-none.md"
  grep -q 'shared_changes: false' "$TMP/a-none.md"
  grep -q 'batch_id: null' "$TMP/a-none.md"
  grep -q 'parent_feature: null' "$TMP/a-none.md"
  grep -q 'depends_on_plans: \[\]' "$TMP/a-none.md"
}

# ── Case B/C: incomplete frontmatter → repair ─────────────────────────

@test "domains: [] is re-derived and filled from the body (infra+db)" {
  run bash "$VDA" frontmatter "$TMP/b-empty-domains.md"
  [ "$status" -eq 0 ]
  grep -Eq '^domains:.*infra' "$TMP/b-empty-domains.md"
  grep -Eq '^domains:.*db' "$TMP/b-empty-domains.md"
  grep -q 'ticket_id: T000999' "$TMP/b-empty-domains.md"
}

@test "missing status: gets status: active added, domains preserved" {
  run bash "$VDA" frontmatter "$TMP/c-missing-status.md"
  [ "$status" -eq 0 ]
  grep -Eq '^status: active$' "$TMP/c-missing-status.md"
  grep -Eq '^domains:.*infra' "$TMP/c-missing-status.md"
}

@test "domains: null is treated as incomplete and filled (website)" {
  run bash "$VDA" frontmatter "$TMP/f-null-domains.md"
  [ "$status" -eq 0 ]
  grep -Eq '^domains:.*website' "$TMP/f-null-domains.md"
  ! grep -Eq '^domains: *null' "$TMP/f-null-domains.md"
}

@test "missing batch fields are added to incomplete frontmatter" {
  run bash "$VDA" frontmatter "$TMP/g-missing-batch.md"
  [ "$status" -eq 0 ]
  grep -q 'file_locks: \[\]' "$TMP/g-missing-batch.md"
  grep -q 'shared_changes: false' "$TMP/g-missing-batch.md"
  grep -q 'batch_id: null' "$TMP/g-missing-batch.md"
}

# ── Guards: must hold before AND after ────────────────────────────────

@test "deliberate status: done is preserved, not forced to active" {
  run bash "$VDA" frontmatter "$TMP/d-deliberate-done.md"
  [ "$status" -eq 0 ]
  grep -Eq '^status: done$' "$TMP/d-deliberate-done.md"
  ! grep -Eq '^status: active$' "$TMP/d-deliberate-done.md"
}

@test "complete frontmatter is idempotent (no churn on re-run)" {
  before="$(cat "$TMP/e-complete.md")"
  run bash "$VDA" frontmatter "$TMP/e-complete.md"
  [ "$status" -eq 0 ]
  after="$(cat "$TMP/e-complete.md")"
  [ "$before" = "$after" ]
}

@test "CRLF complete frontmatter is not duplicated (idempotent, \\r-tolerant)" {
  printf -- '---\r\ntitle: X\r\ndomains: [infra]\r\nstatus: active\r\npr_number: null\r\n---\r\n\r\n# Plan\r\n\r\nTouches k3d/.\r\n' > "$TMP/crlf.md"
  run bash "$VDA" frontmatter "$TMP/crlf.md"
  [ "$status" -eq 0 ]
  count="$(awk '{sub(/\r$/,"")} /^---$/{c++} END{print c+0}' "$TMP/crlf.md")"
  [ "$count" -eq 2 ]
}

@test "no duplicate frontmatter block is ever created" {
  bash "$VDA" frontmatter "$TMP/b-empty-domains.md" >/dev/null
  [ "$(head -1 "$TMP/b-empty-domains.md")" = "---" ]
  count="$(awk '/^---$/{c++} END{print c+0}' "$TMP/b-empty-domains.md")"
  [ "$count" -eq 2 ]
}

# ── --activate ────────────────────────────────────────────────────────

@test "--activate forces status:active even over an existing completed value" {
  cat > "$TMP/d-completed.md" <<'EOF'
---
title: Done Plan
domains: [infra]
status: completed
---

# Done Plan
Touches k3d/ kustomize overlays.
EOF
  run bash "$VDA" frontmatter --activate "$TMP/d-completed.md"
  [ "$status" -eq 0 ]
  grep -q "^status: active$" "$TMP/d-completed.md"
}

@test "without --activate a deliberate completed status is preserved" {
  cat > "$TMP/e-keep.md" <<'EOF'
---
title: Keep Plan
domains: [infra]
status: completed
---

# Keep Plan
Touches k3d/ kustomize overlays.
EOF
  run bash "$VDA" frontmatter "$TMP/e-keep.md"
  [ "$status" -eq 0 ]
  grep -q "^status: completed$" "$TMP/e-keep.md"
}

# ── --spec ────────────────────────────────────────────────────────────

@test "--spec adds spec frontmatter to a spec missing it" {
  cat > "$TMP/f-spec.md" <<'EOF'
# My Feature Design

Some design prose.
EOF
  run bash "$VDA" frontmatter --spec "$TMP/f-spec.md"
  [ "$status" -eq 0 ]
  head -1 "$TMP/f-spec.md" | grep -q '^---$'
  grep -q '^ticket_id:' "$TMP/f-spec.md"
  grep -q '^plan_ref:' "$TMP/f-spec.md"
  grep -q '^status: active$' "$TMP/f-spec.md"
  grep -q '^date:' "$TMP/f-spec.md"
}

@test "--spec is idempotent when frontmatter already present" {
  cat > "$TMP/g-spec.md" <<'EOF'
---
ticket_id: T000999
plan_ref: null
status: active
date: 2026-06-13
---

# Already Has It
EOF
  before="$(cat "$TMP/g-spec.md")"
  run bash "$VDA" frontmatter --spec "$TMP/g-spec.md"
  [ "$status" -eq 0 ]
  [ "$before" == "$(cat "$TMP/g-spec.md")" ]
}

# ── ticket_id derivation ──────────────────────────────────────────────

@test "no frontmatter: ticket_id derived from body **Ticket:** line" {
  cat > "$TMP/h-body-ticket.md" <<'EOF'
# Plan — Some Feature

**Ticket:** T000886
**Branch:** feature/t000886

Touches scripts/ and skills.
EOF
  run bash "$VDA" frontmatter "$TMP/h-body-ticket.md"
  [ "$status" -eq 0 ]
  grep -q '^ticket_id: T000886$' "$TMP/h-body-ticket.md"
  ! grep -Eq '^ticket_id: *null' "$TMP/h-body-ticket.md"
}

@test "no frontmatter: ticket_id derived from filename slug when body lacks it" {
  cat > "$TMP/2026-06-16-t000884.md" <<'EOF'
# Plan — Loops

Touches scripts/factory and tests/.
EOF
  run bash "$VDA" frontmatter "$TMP/2026-06-16-t000884.md"
  [ "$status" -eq 0 ]
  grep -q '^ticket_id: T000884$' "$TMP/2026-06-16-t000884.md"
}

@test "incomplete frontmatter: null ticket_id is repaired when derivable from body" {
  cat > "$TMP/i-null-ticket.md" <<'EOF'
---
title: Repair me
ticket_id: null
domains: []
status: active
---

# Plan

**Ticket:** T000999

Touches k3d/ manifests.
EOF
  run bash "$VDA" frontmatter "$TMP/i-null-ticket.md"
  [ "$status" -eq 0 ]
  grep -q '^ticket_id: T000999$' "$TMP/i-null-ticket.md"
  grep -Eq '^domains:.*infra' "$TMP/i-null-ticket.md"
}

@test "ticket_id null stays null (idempotent) when NOT derivable" {
  cat > "$TMP/j-undeterminable.md" <<'EOF'
---
title: Generic
ticket_id: null
domains: [infra]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan

Touches k3d/ manifests.
EOF
  before="$(cat "$TMP/j-undeterminable.md")"
  run bash "$VDA" frontmatter "$TMP/j-undeterminable.md"
  [ "$status" -eq 0 ]
  [ "$before" = "$(cat "$TMP/j-undeterminable.md")" ]
}

# ── --validate ────────────────────────────────────────────────────────

@test "--validate auto-fills a missing title from the first H1" {
  cat > "$TMP/v-no-title.md" <<'EOF'
---
ticket_id: T000910
domains: [infra]
status: active
---

# Derived Title Plan

Touches k3d/ manifests.
EOF
  run bash "$VDA" frontmatter --validate "$TMP/v-no-title.md"
  [ "$status" -eq 0 ]
  grep -q '^title: Derived Title Plan$' "$TMP/v-no-title.md"
}

@test "--validate exits 1 when domains is missing and cannot be derived" {
  cat > "$TMP/v-no-domains.md" <<'EOF'
---
title: Has Title
ticket_id: T000910
status: active
domains: []
---

# Has Title

Prose with no routing signals whatsoever zzz.
EOF
  run bash "$VDA" frontmatter --validate "$TMP/v-no-domains.md"
  [ "$status" -eq 1 ]
}
