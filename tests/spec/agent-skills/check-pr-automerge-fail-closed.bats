#!/usr/bin/env bats
# tests/spec/agent-skills/check-pr-automerge-fail-closed.bats
# SSOT: openspec/specs/agent-skills.md (Delta: devflow-main-checkout-guards-T900043, T900043)
#
# PRÜFMODUS: Output-Verifikation (T002448-M4) für das Skript-Verhalten — das Skript
# wird AUSGEFÜHRT und gegen einen gh-Stub im PATH gemessen (kein Ambient-gh, Muster
# T003137). Die Call-Site-Prüfung (phases.md 1.4.7) ist Source-Grep — dokumentierte
# Ausnahme: Doku-Konvention, das Ergebnis manifestiert sich ausschließlich im
# Quelltext der Skill-Datei.
#
# Regression T900043/Befund 2: Ein barer Aufruf `scripts/check-pr-automerge.sh`
# (weder --pr noch --branch) meldete `OK: Kein PR gefunden` (rc=0), weil `gh` die
# PR-Nummer aus dem ambient Branch (dort `main`) ableitete — genau die Regression
# T006282, die das Gate abfangen soll, blieb unsichtbar (beobachtet an PR #5409).
# Fail-closed: Der bare Call endet mit rc=2 und nennt den fehlenden Kontext; es gibt
# bewusst KEIN Env-Override (der Kontext ist pro Aufruf zu bestimmen, nicht global).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  BIN_DIR="${BATS_TEST_TMPDIR}/amfc-bin"
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
      NO_PR)     echo 'no pull requests found for branch "main"' >&2; exit 1 ;;
    esac ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# ── Positiv-Anker (T002356-M1): ohne sie wären die Negativ-Aussagen unten ──
# ── vakuos — ein Skript, das immer rc=2 lieferte, bestünde sie trivial. ─────

@test "T900043: expliziter --pr mit aktivem Auto-Merge -> rc=1, Meldung nennt die PR-Nummer" {
  _stub_gh AM_ACTIVE
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --pr 42
  [ "$status" -eq 1 ]
  echo "$output" | grep -qF "42"
}

@test "T900043: explizites --branch ohne PR -> rc=0 (expliziter Kontext bleibt gruen)" {
  _stub_gh NO_PR
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh" --branch fix/x-T900043
  [ "$status" -eq 0 ]
}

# ── Fail-closed: barer Call (rot bis zum Fix) ──────────────────────────────

@test "T900043: barer Call ohne PR-Kontext -> rc=2 statt OK/rc=0" {
  _stub_gh NO_PR
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh"
  [ "$status" -eq 2 ]
}

@test "T900043: barer Call nennt den fehlenden Kontext (--branch/--pr)" {
  _stub_gh NO_PR
  run bash "$REPO_ROOT/scripts/check-pr-automerge.sh"
  [ "$status" -eq 2 ]
  echo "$output" | grep -qF -- "--branch"
}

# ── Call-Site: phases.md 1.4.7 (rot bis zum Fix) ───────────────────────────

@test "T900043: Pre-Flight (phases.md 1.4.7) uebergibt --branch statt barem Call" {
  PHASES="$REPO_ROOT/.claude/skills/references/dev-flow-execute-phases.md"
  SECTION="$(awk '/^### Schritt 1\.4\.7/{flag=1; next} /^## /&&flag{exit} flag' "$PHASES")"
  echo "$SECTION" | grep -qF 'check-pr-automerge.sh --branch'
}
