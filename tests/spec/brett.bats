#!/usr/bin/env bats
# tests/spec/brett.bats
# SSOT: openspec/specs/brett.md
#
# Structural gate for the Systembrett-Vollausbau change (T001931, brett-vollausbau).
# One .bats file per OpenSpec SSOT spec. Deterministic + offline (grep/existence
# only — no DB, no cluster). RED on the pre-change branch, GREEN as tasks 2–12 land.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  BRETT="${REPO_ROOT}/brett"
  SRC="${BRETT}/src"
}

# ── Task 2: shared types & message union ─────────────────────────────────────

@test "state.ts Figure carries hidden + opacity" {
  run grep -E 'hidden\?: boolean' "${SRC}/types/state.ts"
  [ "$status" -eq 0 ]
  run grep -E 'opacity\?: number' "${SRC}/types/state.ts"
  [ "$status" -eq 0 ]
}

@test "state.ts Zone carries variant" {
  run grep -E "variant\?: 'filled' \| 'frame'" "${SRC}/types/state.ts"
  [ "$status" -eq 0 ]
}

@test "messages.ts declares zone_update + figure_hide_set client variants" {
  run grep -E "type: 'zone_update'" "${SRC}/types/messages.ts"
  [ "$status" -eq 0 ]
  run grep -E "type: 'figure_hide_set'" "${SRC}/types/messages.ts"
  [ "$status" -eq 0 ]
}

@test "messages.ts declares zone_updated + figure_hidden_changed server variants" {
  run grep -E "type: 'zone_updated'" "${SRC}/types/messages.ts"
  [ "$status" -eq 0 ]
  run grep -E "type: 'figure_hidden_changed'" "${SRC}/types/messages.ts"
  [ "$status" -eq 0 ]
}

# ── Task 3/4: server admin gate registration ─────────────────────────────────

@test "ws-handler ADMIN_TYPES contains zone_update and figure_hide_set" {
  run grep -E "'zone_update'" "${SRC}/server/ws-handler.ts"
  [ "$status" -eq 0 ]
  run grep -E "'figure_hide_set'" "${SRC}/server/ws-handler.ts"
  [ "$status" -eq 0 ]
}

@test "figures.ts applyMutation handles zone_update and figure_hide_set" {
  run grep -E "case 'zone_update'" "${SRC}/server/figures.ts"
  [ "$status" -eq 0 ]
  run grep -E "case 'figure_hide_set'" "${SRC}/server/figures.ts"
  [ "$status" -eq 0 ]
}

# ── Task 4: server-side hidden filtering (E9) ────────────────────────────────

@test "hidden-filter.ts exists and exports the per-recipient filter API" {
  [ -s "${SRC}/server/hidden-filter.ts" ]
  run grep -E 'export function filterSnapshotFigures\b' "${SRC}/server/hidden-filter.ts"
  [ "$status" -eq 0 ]
  run grep -E 'export function translateBroadcastForRole\b' "${SRC}/server/hidden-filter.ts"
  [ "$status" -eq 0 ]
}

@test "rooms.ts exports broadcastRoleAware" {
  run grep -E 'export function broadcastRoleAware\b' "${SRC}/server/rooms.ts"
  [ "$status" -eq 0 ]
}

# ── Task 5: i18n core + locale dictionaries (E8) ─────────────────────────────

@test "i18n.ts exists and exports t + setLang" {
  [ -s "${SRC}/client/i18n.ts" ]
  run grep -E 'export function t\b' "${SRC}/client/i18n.ts"
  [ "$status" -eq 0 ]
  run grep -E 'export function setLang\b' "${SRC}/client/i18n.ts"
  [ "$status" -eq 0 ]
}

@test "all four locale dictionaries exist and export a default" {
  for lang in de en fr es; do
    [ -s "${SRC}/client/locales/${lang}.ts" ]
    run grep -E 'export default' "${SRC}/client/locales/${lang}.ts"
    [ "$status" -eq 0 ]
  done
}

@test "all four locale dictionaries have an identical key count" {
  local de en fr es
  de=$(grep -cE "^\s*'[a-zA-Z0-9_.]+':" "${SRC}/client/locales/de.ts")
  en=$(grep -cE "^\s*'[a-zA-Z0-9_.]+':" "${SRC}/client/locales/en.ts")
  fr=$(grep -cE "^\s*'[a-zA-Z0-9_.]+':" "${SRC}/client/locales/fr.ts")
  es=$(grep -cE "^\s*'[a-zA-Z0-9_.]+':" "${SRC}/client/locales/es.ts")
  [ "$de" -gt 0 ]
  [ "$de" -eq "$en" ]
  [ "$de" -eq "$fr" ]
  [ "$de" -eq "$es" ]
}

# ── Task 6: zones client + zone_updated handler ──────────────────────────────

@test "ws-message-ground handles zone_updated" {
  run grep -E "zone_updated" "${SRC}/client/ws-message-ground.ts"
  [ "$status" -eq 0 ]
}

@test "zone-editor.ts exists" {
  [ -s "${SRC}/client/ui/zone-editor.ts" ]
}

# ── Task 8: 2D/3D camera modes (E3) ──────────────────────────────────────────

@test "camera-modes.ts exists and exports the toggle API" {
  [ -s "${SRC}/client/camera-modes.ts" ]
  run grep -E 'export function (toggleMode|getActiveCamera)\b' "${SRC}/client/camera-modes.ts"
  [ "$status" -eq 0 ]
}

# ── Task 9: POV panel + dialog mode (E5) ─────────────────────────────────────

@test "pov-panel.ts exists" {
  [ -s "${SRC}/client/ui/pov-panel.ts" ]
}

# ── Task 10: viewing-cone indicator (E6) ─────────────────────────────────────

@test "view-cone.ts exists and exports updateCone" {
  [ -s "${SRC}/client/view-cone.ts" ]
  run grep -E 'export function updateCone\b' "${SRC}/client/view-cone.ts"
  [ "$status" -eq 0 ]
}

# ── Task 11: snapping & alignment guides (E7) ────────────────────────────────

@test "snapping.ts exists and exports snap" {
  [ -s "${SRC}/client/snapping.ts" ]
  run grep -E 'export function snap\b' "${SRC}/client/snapping.ts"
  [ "$status" -eq 0 ]
}

# ── Task 12: hidden-figure client wiring (E9 client) ─────────────────────────

@test "fig-panel wires figure_hide_set" {
  run grep -E "figure_hide_set" "${SRC}/client/ui/fig-panel.ts"
  [ "$status" -eq 0 ]
}

# ── Task 6: feature-flag default-enable ──────────────────────────────────────

@test "index.html seeds __brettFeatures defaults" {
  run grep -E "__brettFeatures" "${BRETT}/public/index.html"
  [ "$status" -eq 0 ]
}
