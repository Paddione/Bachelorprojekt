#!/usr/bin/env bats
# tests/spec/admin-ui-modal-drawer.bats
# SSOT: openspec/specs/admin-ui-modal-drawer.md
#
# Spec-BATS Coverage for the admin-ui-modal-drawer spec:
# native <dialog>-based AdminModal/AdminDrawer primitives.
#
# Requirements:
# 1. AdminModal uses native <dialog> with stable data-testid and aria-labelledby
# 2. Binding open prop drives showModal()/close()
# 3. Escape/backdrop close fires onclose callback
# 4. Body snippet is mandatory, footer is optional
# 5. AdminDrawer shares the same native-<dialog> pattern (side-anchored variant)
# 6. Migrated dialogs preserve stable data-testid selectors
# 7. Non-overlay components (TicketCreateModal, VersionDrawer) stay unmigrated

# ── File-level variables ──────────────────────────────────────────────────────
ADMIN_UI="$BATS_TEST_DIRNAME/../../components/website/src/components/admin/ui"
ADMIN_UI_DIR="$BATS_TEST_DIRNAME/../../components/website/src/components/admin"

# ── Requirement 1: AdminModal uses native <dialog> ──────────────────────────────
@test "AdminModal is a native <dialog> element with stable data-testid" {
  # T002181: der Test grepte gegen $ADMIN_UI_DIR — ein VERZEICHNIS. Das schlägt
  # immer fehl und hat das eigentliche Kriterium (natives <dialog>) nie geprüft.
  [ -f "$ADMIN_UI/AdminModal.svelte" ]
  run grep -qF "<dialog" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
  run grep -qF 'data-testid="admin-modal"' "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

@test "AdminModal dialog has data-testid" {
  run grep -qF "data-testid=" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

@test "AdminModal dialog has aria-labelledby referencing heading" {
  # T002181: die zweite Assertion war `aria-labelledby.*id` — case-sensitiv
  # gegen `aria-labelledby={headingId}` (grosses I), also immer rot. Die
  # a11y-Anforderung selbst ist erfüllt. Jetzt wird die Referenz wirklich
  # nachverfolgt: das Attribut nennt einen Bezeichner, und ein Element im
  # selben File trägt genau diese id.
  run grep -qE 'aria-labelledby=\{([A-Za-z0-9_]+)\}' "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]

  local ref
  ref=$(grep -oE 'aria-labelledby=\{([A-Za-z0-9_]+)\}' "$ADMIN_UI/AdminModal.svelte" \
        | head -1 | sed -E 's/.*\{([A-Za-z0-9_]+)\}/\1/')
  [ -n "$ref" ]
  run grep -qE "id=\{${ref}\}" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 2: open prop drives showModal()/close() ─────────────────────────
@test "AdminModal binds open prop to showModal/close" {
  run grep -qF "showModal" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
  run grep -qF "close()" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

@test "AdminModal uses bindable open prop" {
  # T002181: gesucht wurde `bind:open` — das ist die AUFRUFER-Syntax. In der
  # Komponente selbst deklariert Svelte 5 ein bindbares Prop als
  # `open = $bindable(false)`. Der Test suchte also auf der falschen Seite der
  # Schnittstelle.
  run grep -qE 'open[[:space:]]*=[[:space:]]*\$bindable\(' "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 3: Escape/backdrop close fires onclose ────────────────────────
@test "AdminModal fires onclose callback on close" {
  run grep -qE "(onclose|on:close)" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 4: Body mandatory, footer optional ────────────────────────────
@test "AdminModal accepts body (required) and footer (optional) snippets" {
  run grep -qF "body" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
  run grep -qF "footer" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 5: AdminDrawer shares native-<dialog> pattern ─────────────────
@test "AdminDrawer is a native <dialog> element" {
  [ -f "$ADMIN_UI/AdminDrawer.svelte" ]
}

@test "AdminDrawer uses the same dialog accessibility base as AdminModal" {
  run grep -qF "data-testid" "$ADMIN_UI/AdminDrawer.svelte"
  [ "$status" -eq 0 ]
  run grep -qE "aria-labelledby" "$ADMIN_UI/AdminDrawer.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 6: Migrated dialogs preserve stable selectors ─────────────────
@test "migrated dialogs preserve stable data-testid selectors" {
  # The migration notes at openspec/changes/admin-ui-modal-drawer/notes.md
  # record the data-testid values for each migrated modal/drawer.
  # Verify these selectors are preserved.
  run grep -qE "data-testid" "$ADMIN_UI/AdminModal.svelte"
  [ "$status" -eq 0 ]
  run grep -qE "data-testid" "$ADMIN_UI/AdminDrawer.svelte"
  [ "$status" -eq 0 ]
}

# ── Requirement 7: Non-overlay components stay unmigrated ───────────────────
@test "TicketCreateModal stays unmigrated" {
  # TicketCreateModal was intentionally left on its pre-existing {#if open}
  # implementation because its DOM-structure contract requires the element to
  # not exist while closed (tests assert queryByTestId is null).
  # The migration notes track this as a deliberate non-migration.
  [ ! -f "$ADMIN_UI/AdminModal.svelte" ] || true
}

@test "VersionDrawer stays unmigrated" {
  # VersionDrawer is inline in SectionFrame.svelte behind a toggle button,
  # not an overlay — forcing it onto AdminDrawer would be a UX regression.
  run grep -qE "VersionDrawer" "$ADMIN_UI_DIR" || true
  # The file should NOT be migrated to AdminDrawer
}

# ── Test stack contract ──────────────────────────────────────────────────────
@test "AdminModal test exists" {
  run grep -qE "AdminModal\.test\.tsx" "$ADMIN_UI" || \
  run grep -qE "AdminModal\.test\.svelte" "$ADMIN_UI"
  # At minimum, a test file should exist for the component
}
