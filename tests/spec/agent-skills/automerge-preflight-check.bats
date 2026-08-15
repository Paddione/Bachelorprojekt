#!/usr/bin/env bats
# tests/spec/agent-skills/automerge-preflight-check.bats
# SSOT: openspec/specs/agent-skills.md (Delta: devflow-automerge-preflight, T006366)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4) für das Script-Verhalten — das Skript
# wird AUSGEFÜHRT und gegen einen gh-Stub im PATH gemessen (kein Ambient-gh, Muster
# T003137). Die beiden Integrations-Guards (SKILL.md / phases.md) sind Source-Grep —
# dokumentierte Ausnahme: Doku-Konvention, das Ergebnis manifestiert sich ausschließlich
# im Quelltext der Skill-Dateien.
#
# Regression für T006282: Extern aktiviertes Auto-Merge (User-Klick oder parallele
# Session) konnte den PR während des Review-Gates mergen (PR #4524, Merge 23:31Z bei
# Verdict "With fixes"). dev-flow-execute prüfte den Auto-Merge-Zustand nirgends.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BIN_DIR="${BATS_TEST_TMPDIR}/am-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"
}

# _stub_gh <mode> — gh-Stub für `pr view`; Mode: AM_ACTIVE | AM_NONE | NO_PR
_stub_gh() {
  local mode="$1"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  *"pr view"*)
    case "$mode" in
      AM_ACTIVE) printf '%s\n' '{"number":42,"autoMergeRequest":{"enabledAt":"2026-08-15T00:00:00Z","mergeMethod":"SQUASH"}}'; exit 0 ;;
      AM_NONE)   printf '%s\n' '{"number":42,"autoMergeRequest":null}'; exit 0 ;;
      NO_PR)     echo 'no pull requests found for branch "fix/x"' >&2; exit 1 ;;
    esac ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# ── Script-Verhalten (Output-Verifikation) ─────────────────────────────────

@test "T006366: Auto-Merge aktiv → rc=1, Meldung nennt die PR-Nummer" {
  _stub_gh AM_ACTIVE
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 1 ]
  echo "$output" | grep -qF "42"
}

# Positiv-Anker (T002356-M1): ohne diesen Test wäre die Negativ-Aussage oben
# vakuos — ein Skript, das bei aktivem Auto-Merge trivial rc!=0 liefert, gäbe
# keinen Aufschluss über die erkennende Seite.
@test "T006366: kein Auto-Merge (autoMergeRequest null) → rc=0" {
  _stub_gh AM_NONE
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 0 ]
}

@test "T006366: kein PR für den Branch → rc=0 (Normalfall im Pre-Flight)" {
  _stub_gh NO_PR
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh"
  [ "$status" -eq 0 ]
}

@test "T006366: gh fehlt → rc=2 (kein Freibrief als 'kein Auto-Merge')" {
  # BIN_DIR enthält bewusst keinen gh-Stub; das Skript muss rc=2 melden
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 2 ]
}

# ── Integration (Source-Grep, dokumentierte Ausnahme) ─────────────────────

@test "T006366: Review-Gate (Schritt 3.8) führt den Auto-Merge-Check vor dem Review aus" {
  SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  GATE_SECTION="$(awk '/^## .*Code-Review-Gate/{flag=1; next} /^## /&&flag{exit} flag' "$SKILL")"
  run grep -qF "check-pr-automerge.sh" <<<"$GATE_SECTION"
  [ "$status" -eq 0 ]
}

@test "T006366: Pre-Flight (phases.md) führt den Auto-Merge-Check nach dem Doppelarbeit-Guard aus" {
  PHASES="$REPO_ROOT/.claude/skills/references/dev-flow-execute-phases.md"
  run grep -qF "check-pr-automerge.sh" "$PHASES"
  [ "$status" -eq 0 ]
}
