#!/usr/bin/env bats
# T002659 — scripts/openspec-embed-local.sh probt das Embedding-Backend mit
# `curl --max-time 3`, obwohl die reale Backend-Latenz gemessen stabil bei
# 10,7-10,9 s liegt (drei Messungen gegen http://127.0.0.1:8081/v1/embeddings,
# kalt und warm — siehe Ticket-Beschreibung). Der Probe schlaegt deshalb
# systematisch fehl, der Wrapper bricht ab, und es wird kein OpenSpec-Change
# in knowledge.chunks indiziert, obwohl das Backend funktioniert.
#
# Pruefmodus: command output verification [T002448-M4]. Der Test startet
# einen echten, langsamen HTTP-Server und fuehrt den Wrapper GEGEN diesen aus
# — kein Grep auf scripts/openspec-embed-local.sh.
#
# Ein echter ~11s-langsamer Server waere fuer CI unnoetig teuer; die Probe
# braucht nur einen Server, der ZUVERLAESSIG ueber dem alten 3s-Timeout und
# unter dem neuen Timeout antwortet, um denselben Fehlermodus auszuloesen.
# Der reale Latenzsockel (10,7-10,9s) bleibt Eigenbefund von T002580 und wird
# hier nicht angefasst — nur der Client-seitige Probe-Timeout.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WRAPPER="${REPO_ROOT}/scripts/openspec-embed-local.sh"

  # Langsamer HTTP-Server: antwortet erst nach 5s mit 200 auf POST
  # /v1/embeddings — deutlich ueber dem alten 3s-Probe-Timeout, deutlich
  # unter jedem sinnvollen neuen Timeout (Backend-Latenz real 10,7-10,9s).
  SLOW_SERVER_LOG="$(mktemp)"
  node -e '
    const http = require("http");
    const srv = http.createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{\"data\":[{\"embedding\":[0.1]}]}");
      }, 5000);
    });
    srv.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(srv.address().port));
    });
  ' > "${SLOW_SERVER_LOG}" &
  SLOW_SERVER_PID=$!

  # Auf die Portausgabe warten (Server braucht nur zum Listen-Start Zeit,
  # nicht die volle 5s-Antwortverzoegerung).
  for _ in $(seq 1 50); do
    [ -s "${SLOW_SERVER_LOG}" ] && break
    sleep 0.1
  done
  SLOW_PORT="$(cat "${SLOW_SERVER_LOG}")"
  [ -n "${SLOW_PORT}" ]
}

teardown() {
  kill "${SLOW_SERVER_PID}" 2>/dev/null || true
  wait "${SLOW_SERVER_PID}" 2>/dev/null || true
  rm -f "${SLOW_SERVER_LOG}"
}

@test "T002659: Wrapper kommt bei einem langsamen (aber gesunden) Backend ueber die Probe hinaus" {
  # Ungueltige, aber syntaktisch wohlgeformte DB_URL auf einen garantiert
  # verweigernden Port (1) — der Wrapper soll NICHT an der Probe scheitern,
  # sondern (erwartbar) erst am DB-Connect. Das trennt die beiden Fehlerpfade.
  run timeout 15 env \
    LLM_EMBED_URL="http://127.0.0.1:${SLOW_PORT}" \
    SESSIONS_DATABASE_URL="postgres://u:p@127.0.0.1:1/db" \
    bash "${WRAPPER}" "dummy-slug-T002659"

  # Positiv-Anker zuerst [T002356-M1]: der Wrapper muss tatsaechlich bis zur
  # naechsten Stufe (Embedding-Skript-Aufruf / DB-Fehlerpfad) vorgedrungen
  # sein — nicht bloss "irgendein anderer Fehler", sondern der konkrete,
  # unterscheidbare Folgefehler hinter der Probe.
  [[ "${output}" == *"FEHLER: Embedding wurde NICHT indiziert"* ]]

  # Negativ-Aussage: der Probe-spezifische Fehler darf NICHT mehr auftreten,
  # weil das Backend innerhalb des (jetzt ausreichenden) Timeouts antwortet.
  [[ "${output}" != *"kein Embedding-Backend erreichbar"* ]]
}

@test "T002659: Sanity — ein sofort antwortendes Backend war nie das Problem" {
  # Kontrollfall ohne Verzoegerung: muss unabhaengig vom Timeout-Wert immer
  # ueber die Probe hinauskommen. Belegt, dass der Testaufbau selbst
  # funktioniert (Server, Wrapper-Aufruf, Assertions) und nicht zufaellig
  # aus anderem Grund gruen wird.
  FAST_LOG="$(mktemp)"
  node -e '
    const http = require("http");
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{\"data\":[{\"embedding\":[0.1]}]}");
    });
    srv.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(srv.address().port));
    });
  ' > "${FAST_LOG}" &
  FAST_PID=$!
  for _ in $(seq 1 50); do
    [ -s "${FAST_LOG}" ] && break
    sleep 0.1
  done
  FAST_PORT="$(cat "${FAST_LOG}")"

  run timeout 10 env \
    LLM_EMBED_URL="http://127.0.0.1:${FAST_PORT}" \
    SESSIONS_DATABASE_URL="postgres://u:p@127.0.0.1:1/db" \
    bash "${WRAPPER}" "dummy-slug-T002659-fast"

  kill "${FAST_PID}" 2>/dev/null || true
  wait "${FAST_PID}" 2>/dev/null || true
  rm -f "${FAST_LOG}"

  [[ "${output}" == *"FEHLER: Embedding wurde NICHT indiziert"* ]]
  [[ "${output}" != *"kein Embedding-Backend erreichbar"* ]]
}
