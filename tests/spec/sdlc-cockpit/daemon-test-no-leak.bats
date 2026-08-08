#!/usr/bin/env bats

# daemon-test-no-leak.bats — T002724
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Dieser
# Test fuehrt den fraglichen bats-Lauf wirklich aus und misst danach, ob noch
# ein Prozess auf dem Testport lauscht. Es wird kein Quelltext gegrept — ob ein
# Prozess zurueckbleibt, laesst sich am Code ohnehin nicht ablesen.
#
# Hintergrund: daemon-runtime-contract.bats Test 3 startete den Daemon per
# `npx tsx … &` und merkte sich `$!`. `npx tsx` erzeugt aber eine VIERSTUFIGE
# Prozesskette:
#
#     npm exec tsx …
#       └─ sh -c tsx …
#            └─ node …/tsx/dist/cli.mjs …
#                 └─ node --require …/preflight.cjs … server.ts   ← der Server
#
# `$!` liefert nur die oberste Ebene. Das `kill` vor der Assertion beendete
# damit den Wrapper, waehrend der Server weiterlief — er hielt den Port und
# antwortete weiter auf /health.
#
# Warum das mehr ist als Unordnung: Ein geleakter Daemon laesst einen
# Positiv-Anker bestehen (er antwortet ja), schreibt aber in ein laengst
# geloeschtes BATS_TEST_TMPDIR. Bei T002721 hat genau dieses Bild zeitweise wie
# ein Implementierungsfehler ausgesehen, bis der Anker den falschen Erfolg
# abfing. Vor T002708 fiel der Leak nicht auf, weil der damalige Port 49199 im
# Hyper-V-Reservierungsbereich lag und der Test auf WSL2 ohnehin immer rot war.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
}

setup() {
  cd "${REPO_ROOT}" || return 1
  # Der Port, den daemon-runtime-contract.bats Test 3 fest verdrahtet.
  CONTRACT_PORT=39199
  export CONTRACT_PORT
}

# port_free <port> — 0, wenn niemand antwortet.
port_free() {
  ! curl -s -m 1 "http://127.0.0.1:${1}/health" >/dev/null 2>&1
}

# kill_listeners <port> — beendet, was dort lauscht. Stellt die Ausgangslage
# her, damit ein Leck aus einem FRUEHEREN Lauf diesen Test nicht rot faerbt.
kill_listeners() {
  ss -ltnp 2>/dev/null | grep ":${1}\b" | grep -oE 'pid=[0-9]+' | cut -d= -f2 \
    | while read -r p; do kill "$p" 2>/dev/null || true; done
  sleep 1
}

@test "T002724 ein Lauf von daemon-runtime-contract.bats hinterlaesst keinen Daemon" {
  kill_listeners "${CONTRACT_PORT}"

  # POSITIV-ANKER 1: die Ausgangslage stimmt. Ohne diese Pruefung koennte der
  # Test spaeter einen Fremdprozess als Leck melden — oder umgekehrt einen
  # bereits belegten Port als "unveraendert" durchwinken.
  port_free "${CONTRACT_PORT}"

  # Der fragliche Lauf. `env -u COCKPIT_DAEMON_REQUIRED` haelt ihn unabhaengig
  # davon, ob diese Suite selbst unter gesetzter Variable laeuft (in CI der
  # Normalfall) — sonst entschiede die Umgebung mit, ob Test 3 ueberhaupt bis
  # zum Daemon-Start kommt.
  run env -u COCKPIT_DAEMON_REQUIRED ./tests/unit/lib/bats-core/bin/bats \
    tests/spec/sdlc-cockpit/daemon-runtime-contract.bats \
    -f "Daemon startet aus dem Checkout"

  # POSITIV-ANKER 2: der Lauf war erfolgreich. Ein fehlgeschlagener Test kaeme
  # womoeglich gar nicht bis zum Daemon-Start — dann waere "kein Leck" trivial
  # erfuellt und wuerde nichts belegen.
  [ "$status" -eq 0 ]

  # Der eigentliche Gegenstand: nach dem Lauf lauscht niemand mehr.
  # Kurz gepollt, weil ein regulaer beendeter Prozess einen Moment zum Sterben
  # braucht — ein Leck dagegen bleibt beliebig lange bestehen.
  local leaked=1 _
  for _ in $(seq 1 20); do
    if port_free "${CONTRACT_PORT}"; then
      leaked=0
      break
    fi
    sleep 0.5
  done

  if [ "$leaked" -ne 0 ]; then
    echo "--- es lauscht noch jemand auf ${CONTRACT_PORT} ---"
    ss -ltnp 2>/dev/null | grep ":${CONTRACT_PORT}\b" || true
    kill_listeners "${CONTRACT_PORT}"
  fi
  [ "$leaked" -eq 0 ]
}
