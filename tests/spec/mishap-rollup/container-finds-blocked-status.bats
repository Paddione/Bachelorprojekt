#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T003533 — persistenter Rollup-Container bleibt `blocked` und wird von
# der Container-Aufloesung nicht gefunden; stattdessen entstehen Zweit-Container.
# Aktualisiert fuer T007056: Collect-Mode-Filter — ein blocked-Container wird
# nur noch gefunden, wenn er KEINEN FACTORY-PLAN-REF traegt (vor dem Staging);
# dispatchte Container (plan_staged/…) sind nie im Suchergebnis.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation mit einem kubectl-Mock
# (repo-Idiom, siehe tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats).
# Die Aussage haengt an dem SQL, das der Befehl als sein Verhalten an die Datenbank
# emittiert: Offline-CI kann das WHERE-Praedikat nicht gegen eine echte DB
# auswerten, also prueft der Test das emittierte Praedikat selbst — der Collect
# Mode (triage/backlog/planning + blocked ohne FACTORY-PLAN-REF) muss als
# positives Praedikat stehen, dispatchte Status duerfen nie gematcht werden.
#
# Positiv-Anker-Pflicht (T002356-M1): zuerst wird belegt, dass der Befehl laeuft
# und die Such-Query ueberhaupt emittiert (CAP nicht leer) — sonst waere die
# Praedikat-Aussage vakuos.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T003533: rollup-container findet einen blocked-Container ohne FACTORY-PLAN-REF statt einen neuen anzulegen" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  # _exec_sql transportiert das SQL in den ARGS (`psql ... -c <SQL>`), nicht
  # ueber stdin — der Mock protokolliert deshalb $* (nicht cat). stdin wird
  # nur beim create-Pfad (INSERT via stdin) benutzt.
  input="$(cat)"
  { echo "ARGS: $*"; echo "STDIN: $input"; } >> "$CAP"
  if [[ "$*" == *"type = 'chore'"* ]]; then
    # Step 1 (Suche): die DB hat einen blocked-Container OHNE FACTORY-PLAN-REF.
    echo "T003533"
    exit 0
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"

  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$REPO_ROOT/scripts/ticket.sh" rollup-container --brand mentolder

  # Positiv-Anker: das Kommando lief, und die Such-Query wurde tatsaechlich
  # emittiert — sonst pruefte das Praedikat eine leere CAP-Datei.
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [ "$(grep -c "type = 'chore'" "$cap")" -ge 1 ]

  # Eigentliche Aussage 1: der gefundene Container wird zurueckgegeben —
  # kein Create-Pfad, kein Diagnostik-Text, kein INSERT.
  [ "$output" = "T003533" ]
  [[ "$output" != *"kein offener Container"* ]]
  [ "$(grep -c "INSERT INTO tickets.tickets" "$cap")" -eq 0 ]

  # Eigentliche Aussage 2 (T007056): das emittierte Praedikat ist der positive
  # Collect-Mode-Filter inkl. blocked-Nuance — keine NOT-IN-Exclusion-Liste.
  [ "$(grep -c "status IN ('triage','backlog','planning')" "$cap")" -ge 1 ]
  [ "$(grep -c "status = 'blocked'" "$cap")" -ge 1 ]
  [ "$(grep -c "NOT EXISTS" "$cap")" -ge 1 ]
  [ "$(grep -c "FACTORY-PLAN-REF" "$cap")" -ge 1 ]
  [ "$(grep -c "status NOT IN (" "$cap")" -eq 0 ]

  rm -rf "$mockdir"
}
