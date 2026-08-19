#!/usr/bin/env bats
# tests/spec/software-factory/babysit-prs-conflict-guard-T012500.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012500 — der D7-Guard ("CONFLICTING: label + notify, never fix")
# verglich mergeStateStatus gegen "CONFLICTING". Diesen Wert kennt das Enum
# nicht: es fuehrt BEHIND/BLOCKED/CLEAN/DIRTY/DRAFT/HAS_HOOKS/UNKNOWN/UNSTABLE,
# der Konflikt heisst dort DIRTY. CONFLICTING ist der Wert des SEPARATEN Feldes
# mergeable — das die gh-pr-list-Abfrage bis T012500 nicht einmal anforderte.
#
# Der Guard konnte damit nie feuern. Ein Konflikt-PR wurde stattdessen ueber den
# Rot-Check-Zweig ausgewaehlt und fiel in den Fix-Pfad, den er laut D7 nie
# erreichen soll.
#
# BELEGTER VORFALL (2026-08-19, T012414): an PR #4780 arbeitete die Factory
# ueber 25 Minuten und rund 30.000 erzeugte Token, ohne Commit, Push oder
# PR-Aenderung; der Branch stand seit 5,5 Stunden unveraendert. Bei jedem Tick
# begann das von vorn. Am lebenden PR:
#   gh pr view 4780 --json mergeStateStatus,mergeable
#   -> mergeStateStatus=DIRTY  mergeable=CONFLICTING
#   gh pr view 4780 --json labels -> leer (das Label haette gesetzt sein muessen)
#
# PRUEFMODUS: Output-Verifikation. babysit-prs.sh laeuft mit FACTORY_DRY_RUN=true
# und gh-Stub als echter Kommandoaufruf; geprueft wird die Ausgabe, kein
# Source-Grep. Muster uebernommen von babysit-prs-red-detection.bats.

load '_sf_common'

setup()    { _sf_setup; _t012500_setup; }
teardown() { _sf_teardown; }

_t012500_setup() {
  BIN_DIR="${BATS_TEST_TMPDIR}/t012500-bin"
  rm -rf "$BIN_DIR"; mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  GUARDS_REPO_DIR="${BATS_TEST_TMPDIR}/t012500-guards-repo"
  rm -rf "$GUARDS_REPO_DIR"; mkdir -p "$GUARDS_REPO_DIR/scripts"
  cat > "$GUARDS_REPO_DIR/scripts/ticket.sh" <<'TSTUB'
#!/usr/bin/env bash
echo "off"
exit 0
TSTUB
  chmod +x "$GUARDS_REPO_DIR/scripts/ticket.sh"
  export GUARDS_REPO="$GUARDS_REPO_DIR"

  export AGENT_LOCK_DIR="${BATS_TEST_TMPDIR}/t012500-agent-locks"
  rm -rf "$AGENT_LOCK_DIR"; mkdir -p "$AGENT_LOCK_DIR"
  export TMPDIR="$BATS_TEST_TMPDIR"
  export FACTORY_DRY_RUN=true
  export CLAUDE_BIN="/bin/false"
}

# _stub_gh <mergeStateStatus> <mergeable> <rollup-conclusion>
# Bildet die echte GitHub-Antwort nach: die beiden Felder sind unabhaengig.
_stub_gh() {
  local mss="$1" mergeable="$2" conclusion="$3"
  cat > "$BIN_DIR/gh" <<GHSTUB
#!/usr/bin/env bash
case "\$*" in
  "pr list"*)
    echo '[{"number":123,"headRefName":"testbranch-1","isDraft":false,"mergeStateStatus":"$mss","mergeable":"$mergeable","statusCheckRollup":[{"name":"CI Job X","conclusion":"$conclusion"}],"author":{"login":"tester"},"labels":[]}]'
    ;;
  *"pr view"*"--json comments"*) echo '{"comments":[]}' ;;
  *"run view"*) printf '%s\n' "generated artifact(s) are stale" "run 'task freshness:regenerate'" ;;
  *) exit 0 ;;
esac
GHSTUB
  chmod +x "$BIN_DIR/gh"
}

# ── Positiv-Anker zuerst [T002356-M1] ───────────────────────────────────────
# Ohne ihn waeren die Aussagen unten vakuos: bliebe der Scan-Pfad ueberhaupt
# unerreicht, sagte "kein Fix-Pfad" nichts ueber den Guard aus.

@test "T012500: ein roter, konfliktfreier PR erreicht den Fix-Pfad (Positiv-Anker)" {
  _stub_gh "BLOCKED" "MERGEABLE" "FAILURE"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -q "selected PR #123" <<<"$output" \
    || { echo "Positiv-Anker verletzt: roter PR wurde nicht selektiert — Testaufbau kaputt, nicht der Fix"; echo "$output"; false; }
  grep -qi "merge conflicts" <<<"$output" \
    && { echo "Positiv-Anker verletzt: konfliktfreier PR wurde als Konflikt behandelt"; echo "$output"; false; }
  return 0
}

# ── Der eigentliche Gegenstand ──────────────────────────────────────────────

@test "T012500: DIRTY + CONFLICTING wird als Konflikt behandelt, nicht repariert" {
  # Der reale Fall aus PR #4780: mergeStateStatus DIRTY, mergeable CONFLICTING,
  # dazu ein roter Check (deshalb wurde er ueberhaupt ausgewaehlt).
  _stub_gh "DIRTY" "CONFLICTING" "FAILURE"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -q "selected PR #123" <<<"$output" \
    || { echo "PR wurde gar nicht selektiert — erwartet war Selektion PLUS Konflikt-Abbruch"; echo "$output"; false; }

  # D7: melden statt reparieren. Vor dem Fix lief der PR in den Fix-Pfad weiter.
  grep -qi "merge conflicts" <<<"$output" \
    || { echo "❌ Bug reproduziert: Konflikt-PR wurde NICHT als Konflikt gemeldet — der D7-Guard hat nicht gefeuert"; echo "$output"; false; }
}

@test "T012500: mergeable=CONFLICTING allein genuegt, auch wenn mergeStateStatus etwas anderes sagt" {
  # Robustheit gegen die andere Richtung: GitHub liefert die beiden Felder
  # unabhaengig und zeitversetzt.
  _stub_gh "BLOCKED" "CONFLICTING" "FAILURE"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -qi "merge conflicts" <<<"$output" \
    || { echo "❌ Konflikt ueber mergeable allein wurde nicht erkannt"; echo "$output"; false; }
}

@test "T012500: mergeable=UNKNOWN ist KEIN Konflikt" {
  # Waehrend GitHub die Mergebarkeit berechnet, steht mergeable auf UNKNOWN.
  # Das als Konflikt zu werten, wuerde jeden frischen PR faelschlich stilllegen —
  # die Umkehrung des behobenen Fehlers.
  _stub_gh "BLOCKED" "UNKNOWN" "FAILURE"

  run bash "$REPO/scripts/factory/babysit-prs.sh"

  grep -qi "merge conflicts" <<<"$output" \
    && { echo "❌ UNKNOWN wurde als Konflikt gewertet — frische PRs wuerden stillgelegt"; echo "$output"; false; }
  return 0
}
