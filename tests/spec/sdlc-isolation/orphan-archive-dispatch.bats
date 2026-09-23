#!/usr/bin/env bats
# T900338 — Poller-Aufgabe `archive` und Dispatcher fuer verwaiste OpenSpec-Changes.
# SSOT: openspec/specs/sdlc-isolation.md
#   "The local poller dispatches archiving of orphaned OpenSpec changes"
#
# PRUEFMODUS: command output verification [T002448-M4]. Dispatcher und Poller
# werden mit gestubbtem gh und psql (FACTORY_PG_URL) AUSGEFUEHRT; geprueft wird,
# welche gh-Aufrufe sie absetzen und was sie melden.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/orphan-archive-dispatch.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  DISPATCH="$REPO_ROOT/scripts/factory/openspec-orphan-dispatch.sh"
  POLLER="$REPO_ROOT/scripts/factory/github-poller.sh"
  STUBDIR="$BATS_TEST_TMPDIR/bin"
  GH_LOG="$BATS_TEST_TMPDIR/gh.log"
  mkdir -p "$STUBDIR"
  : > "$GH_LOG"

  # Szenario-Steuerung ueber Umgebungsvariablen, vom gh-/psql-Stub gelesen:
  #   STUB_SLUGS         offene Change-Verzeichnisse auf main (Leerzeichen-getrennt)
  #   STUB_TICKET_<slug> Inhalt der .ticket-Datei
  #   STUB_STATUS_<Tid>  Ticket-Status in der DB
  #   STUB_AGE_HOURS     Alter des Einfuehrungs-Commits in Stunden
  #   STUB_OPEN_PR       Titel eines offenen PRs (leer = keiner)
  #   STUB_RUN_ACTIVE    1 = ein Workflow-Run laeuft bereits
  cat > "$STUBDIR/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
args="$*"
case "$args" in
  *"workflow run"*) exit 0 ;;
  *"run list"*)
    [ "${STUB_RUN_ACTIVE:-0}" = 1 ] && echo "12345"
    exit 0 ;;
  *"pr list"*)
    [ -n "${STUB_OPEN_PR:-}" ] && printf '%s\n' "$STUB_OPEN_PR"
    exit 0 ;;
  *"/.ticket"*)
    slug="$(printf '%s' "$args" | sed -n 's#.*openspec/changes/\([^/]*\)/\.ticket.*#\1#p')"
    var="STUB_TICKET_${slug//-/_}"
    [ -n "${!var:-}" ] || exit 1
    printf '%s\n' "${!var}"
    exit 0 ;;
  *"commits"*)
    date -u -d "-${STUB_AGE_HOURS:-3} hours" +%Y-%m-%dT%H:%M:%SZ
    exit 0 ;;
  *"contents/openspec/changes"*)
    for s in ${STUB_SLUGS:-}; do echo "$s"; done
    exit 0 ;;
esac
exit 0
STUB
  chmod +x "$STUBDIR/gh"

  cat > "$STUBDIR/psql" <<'STUB'
#!/usr/bin/env bash
sql="$*"
[ -t 0 ] || sql="$sql $(cat)"
tid="$(printf '%s' "$sql" | grep -o 'T[0-9]\{6\}' | head -1)"
var="STUB_STATUS_${tid}"
printf '%s\n' "${!var:-}"
STUB
  chmod +x "$STUBDIR/psql"
}

_dispatch() {
  run env PATH="$STUBDIR:$PATH" GH_LOG="$GH_LOG" FACTORY_PG_URL=stub BRAND=mentolder \
    bash "$DISPATCH" "$@"
}

# Negativ-Zusage mit Positiv-Anker (T002356-M1): der Dispatcher hat den Bestand
# ueberhaupt abgefragt, und trotzdem ging kein workflow run hinaus.
_not_dispatched() {
  grep -q 'contents/openspec/changes' "$GH_LOG"
  [ "$(grep -c 'workflow run' "$GH_LOG")" -eq 0 ]
}

@test "T900338: fertiger, gealterter Change wird genau einmal dispatcht" {
  export STUB_SLUGS="alt-fertig" STUB_TICKET_alt_fertig=T000101 STUB_STATUS_T000101=done STUB_AGE_HOURS=3
  _dispatch
  [ "$status" -eq 0 ]
  [ "$(grep -c 'workflow run openspec-orphan-archive.yml' "$GH_LOG")" -eq 1 ]
  grep -q 'slugs=alt-fertig' "$GH_LOG"
}

@test "T900338: Ticket nicht done wird uebersprungen und nicht dispatcht" {
  export STUB_SLUGS="offen1" STUB_TICKET_offen1=T000102 STUB_STATUS_T000102=in_progress STUB_AGE_HOURS=3
  _dispatch
  [ "$status" -eq 0 ]
  [[ "$output" == *offen1*in_progress* ]]
  _not_dispatched
}

@test "T900338: Change in der Karenzzeit wird uebersprungen" {
  export STUB_SLUGS="jung1" STUB_TICKET_jung1=T000103 STUB_STATUS_T000103=done STUB_AGE_HOURS=0
  _dispatch
  [ "$status" -eq 0 ]
  [[ "$output" == *jung1* ]]
  _not_dispatched
}

@test "T900338: offener PR mit dem Slug im Titel verhindert den Dispatch" {
  export STUB_SLUGS="pr1" STUB_TICKET_pr1=T000104 STUB_STATUS_T000104=done STUB_AGE_HOURS=3
  export STUB_OPEN_PR="chore(plans): archive pr1 -> openspec/archive [T000104]"
  _dispatch
  [ "$status" -eq 0 ]
  [[ "$output" == *pr1* ]]
  _not_dispatched
}

@test "T900338: laufender Archiv-Workflow unterdrueckt den Dispatch" {
  export STUB_SLUGS="alt2" STUB_TICKET_alt2=T000105 STUB_STATUS_T000105=done STUB_AGE_HOURS=3
  export STUB_RUN_ACTIVE=1
  _dispatch
  [ "$status" -eq 0 ]
  _not_dispatched
}

@test "T900338: --dry-run waehlt aus, dispatcht aber nicht" {
  export STUB_SLUGS="dry2" STUB_TICKET_dry2=T000106 STUB_STATUS_T000106=done STUB_AGE_HOURS=3
  _dispatch --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *dry2* ]]
  _not_dispatched
}

@test "T900338: Poller kennt die Aufgabe archive und delegiert an den Dispatcher" {
  export STUB_SLUGS="alt3" STUB_TICKET_alt3=T000107 STUB_STATUS_T000107=done STUB_AGE_HOURS=3
  run env PATH="$STUBDIR:$PATH" GH_LOG="$GH_LOG" FACTORY_PG_URL=stub BRAND=mentolder \
    bash "$POLLER" --task archive --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"== archive =="* ]]
  [[ "$output" == *alt3* ]]
}
