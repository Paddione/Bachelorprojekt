#!/usr/bin/env bats
# tests/spec/agent-skills/automerge-workflow-disable.bats
# SSOT: openspec/specs/agent-skills.md (Delta: automerge-gate-workflow-distinction, T015915)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4) — das Skript wird AUSGEFÜHRT und gegen
# einen gh-Stub im PATH gemessen (kein Ambient-gh, Muster T003137). Der Stub behandelt
# `pr view` UND `pr merge --disable-auto` (Aufrufe werden in einer Counter-Datei
# verzeichnet, damit Tests die Deaktivierung nachweisen können statt nur Exit-Codes).
#
# Regression für T015915: Der Workflow 'Auto-enable Auto-Merge' setzt das Flag bei
# PR-Anlage mit dem PAT des Operators (Identität Paddione — gemessen an den
# Freshness-Regen-Commits, 2026-08-24). GitHub mergte PR #5197 beim ersten grünen
# Stand, bevor das Review-Gate lief; das Gate meldete nur BLOCK, ohne deaktivieren
# zu dürfen. Neu: maschinell erkennbare Auto-Merges (Bot-Regel oder PAT-Regel mit
# Aktivierungsfenster) werden deaktiviert, menschliche bleiben fail-closed.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BIN_DIR="${BATS_TEST_TMPDIR}/amwd-bin"
  COUNTER="$BIN_DIR/disable-calls"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"
}

# _stub_gh <view-json> [merge_exit]
# view-json: vollständiges JSON für `gh pr view`; merge_exit: exit code für --disable-auto
_stub_gh() {
  local view_json="$1"
  local merge_exit="${2:-0}"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  *"pr view"*)
    printf '%s\n' '$view_json'
    exit 0 ;;
  *"--disable-auto"*)
    echo "called: \$*" >> "$COUNTER"
    exit $merge_exit ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
  rm -f "$COUNTER"
}

_disable_count() {
  if [ -f "$COUNTER" ]; then wc -l < "$COUNTER" | tr -d ' '; else printf '0'; fi
}

# ── Maschinen-Erkennung → Deaktivierung + rc=0 ─────────────────────────────

@test "T015915: Workflow-Auto-Merge im Fenster (Paddione, +30s) → rc=0, einmal deaktiviert" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-24T00:00:30Z","mergeMethod":"SQUASH","enabledBy":{"login":"Paddione"}}}'
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF "42"
  echo "$output" | grep -qF "deaktiviert"
  [ "$(_disable_count)" = "1" ]
}

@test "T015915: Bot-gesetzter Auto-Merge ([bot]-Login) → rc=0, unabhängig vom Fenster deaktiviert" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-25T00:00:00Z","mergeMethod":"SQUASH","enabledBy":{"login":"github-actions[bot]"}}}'
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF "deaktiviert"
  [ "$(_disable_count)" = "1" ]
}

# ── Fail-closed bleibt: Mensch oder nicht einordenbar → rc=1, keine Deaktivierung ──

@test "T015915: gleicher Login außerhalb des Fensters (+3600s) → rc=1, nicht deaktiviert" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-24T01:00:00Z","mergeMethod":"SQUASH","enabledBy":{"login":"Paddione"}}}'
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 1 ]
  echo "$output" | grep -qF "42"
  calls="$(cat "$COUNTER" 2>/dev/null || true)"
  [ -z "$calls" ]
}

@test "T015915: fremder menschlicher Login → rc=1, nicht deaktiviert" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-24T00:00:10Z","mergeMethod":"SQUASH","enabledBy":{"login":"some-human"}}}'
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 1 ]
  calls="$(cat "$COUNTER" 2>/dev/null || true)"
  [ -z "$calls" ]
}

@test "T015915: enabledBy fehlt → rc=1 fail-closed, nicht deaktiviert" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-24T00:00:10Z","mergeMethod":"SQUASH"}}'
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 1 ]
  calls="$(cat "$COUNTER" 2>/dev/null || true)"
  [ -z "$calls" ]
}

# ── Gescheiterte Deaktivierung ist kein stiller Erfolg ─────────────────────

@test "T015915: disable-auto scheitert technisch → rc=2" {
  _stub_gh '{"number":42,"createdAt":"2026-08-24T00:00:00Z","autoMergeRequest":{"enabledAt":"2026-08-24T00:00:30Z","mergeMethod":"SQUASH","enabledBy":{"login":"github-actions[bot]"}}}' 1
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 2 ]
}
