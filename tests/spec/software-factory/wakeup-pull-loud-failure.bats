#!/usr/bin/env bats
# tests/spec/software-factory/wakeup-pull-loud-failure.bats
# SSOT: openspec/specs/software-factory.md
# T011581 — der Pre-Tick-Pull in wakeup.sh darf nicht mehr STUMM scheitern.
#
# Hintergrund: `git pull --ff-only origin main 2>/dev/null || true` verschluckte
# jeden Fehlgrund. Beobachtet 2026-08-17: eine lokal modifizierte, upstream
# gelöschte Datei blockierte den ff-Pull; der Checkout blieb 7 Commits hinter
# origin/main und zwei Ticks fuhren einen Executor OHNE die eine Stunde zuvor
# gemergten Factory-Fixes (PR #4700). Fail-open bleibt (Tick läuft weiter),
# aber Fehlgrund + Rückstand gehören ins Journal.
#
# Prüfmodus: Output-Verifikation (T002448-M4). Die Tests FÜHREN wakeup.sh gegen
# ein Fixture-Repo AUS. Der Tick selbst wird über den vorab gehaltenen
# flock-Lock abgefangen: der Pull liegt VOR dem single-flight-Lock, das
# "skipping"-Bail danach ist der Positiv-Anker, dass der Pull-Block durchlaufen
# wurde — kein echter Tick, kein Netz, keine DB. Semantik statt Darstellung
# (T002716): geprüft werden Exit-Code, das Vorhandensein der Fehlermeldung und
# (im Erfolgsfall) der tatsächlich vorgerückte HEAD — keine Zeilenanker.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  WAKEUP="$REPO_ROOT/scripts/factory/wakeup.sh"

  # Fixture: Bare-Origin + Factory-Checkout.
  ORIGIN="$BATS_TEST_TMPDIR/origin.git"
  git init -q --bare "$ORIGIN"
  # Bare-Default-HEAD zeigt auf master; ohne Umbiegen klont der Zweit-Klon
  # unten einen nicht existierenden Ref und landet branchlos.
  git -C "$ORIGIN" symbolic-ref HEAD refs/heads/main
  CHECKOUT="$BATS_TEST_TMPDIR/checkout"
  git init -q -b main "$CHECKOUT"
  git -C "$CHECKOUT" config user.email t@example.invalid
  git -C "$CHECKOUT" config user.name Test
  echo base > "$CHECKOUT/file.txt"
  git -C "$CHECKOUT" add -A
  git -C "$CHECKOUT" commit -qm "base"
  git -C "$CHECKOUT" remote add origin "$ORIGIN"
  git -C "$CHECKOUT" push -q -u origin main

  # Upstream-Fortschritt über einen zweiten Klon einspielen.
  OTHER="$BATS_TEST_TMPDIR/other"
  git clone -q "$ORIGIN" "$OTHER"
  git -C "$OTHER" config user.email t@example.invalid
  git -C "$OTHER" config user.name Test
  echo upstream > "$OTHER/upstream.txt"
  git -C "$OTHER" add -A
  git -C "$OTHER" commit -qm "upstream: neuer Stand"
  git -C "$OTHER" push -q origin main

  # Tick-Abfang: Lock VOR dem Lauf halten → wakeup.sh bail't direkt nach dem
  # Pull-Block ("a factory tick is already running … skipping", Exit 0).
  LOCKFILE="$BATS_TEST_TMPDIR/tick.lock"
  exec 8>"$LOCKFILE"
  flock -n 8
}

teardown() {
  exec 8>&- || true
}

_run_wakeup() {
  run env FACTORY_REPO="$CHECKOUT" \
    FACTORY_ENV_FILE="$BATS_TEST_TMPDIR/no-such-env" \
    FACTORY_TICK_LOCK="$LOCKFILE" \
    bash "$WAKEUP"
}

@test "T011581: scheiternder ff-Pull wird laut gemeldet (Fehlgrund + Rückstand), Tick bleibt fail-open" {
  # Divergenz: lokaler Commit im Checkout, anderer Commit upstream → ff-only scheitert.
  echo local > "$CHECKOUT/local.txt"
  git -C "$CHECKOUT" add -A
  git -C "$CHECKOUT" commit -qm "lokal: divergiert"

  _run_wakeup
  [ "$status" -eq 0 ]
  # Positiv-Anker: der Pull-Block wurde durchlaufen, der Lock-Bail kam danach.
  [[ "$output" == *"skipping"* ]]
  # Kernaussage: der Fehlschlag ist sichtbar, samt Rückstands-Zähler.
  [[ "$output" == *"fehlgeschlagen"* ]]
  [[ "$output" == *"hinter origin/main"* ]]
}

@test "T011581: erfolgreicher Pull bleibt still und rückt HEAD tatsächlich vor" {
  _run_wakeup
  [ "$status" -eq 0 ]
  [[ "$output" == *"skipping"* ]]
  [[ "$output" != *"fehlgeschlagen"* ]]
  # Semantischer Beweis statt Log-Anker: HEAD steht jetzt auf origin/main.
  [ "$(git -C "$CHECKOUT" rev-parse HEAD)" = "$(git -C "$CHECKOUT" rev-parse origin/main)" ]
}
