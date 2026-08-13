#!/usr/bin/env bats
# tests/spec/local-llm-proxy/bge-role-routes.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T003205
#
# PRUEFMODUS (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Der Test
# schickt echte HTTP-Requests an den laufenden Proxy und bewertet Status, Header
# und Body. Ein grep auf server.mjs wuerde nur belegen, dass dort ein Pfad
# steht — ob der Proxy darauf antwortet, sagt allein die Anfrage.
#
# WAS HIER GESICHERT WIRD
# bge (Embedding + Reranking) war bis T003205 am Proxy vorbeigefuehrt: die
# lokalen Konsumenten sprachen die Backend-Ports direkt an (:8081 und :8093 als
# Port-Forwards in den Cluster), waehrend die beiden bge-CPU-Loadouts zwar vom
# Proxy verwaltet, aber von niemandem geroutet wurden. Diese Datei sichert die
# Gegenrichtung: /v1/embeddings und /v1/rerank sind am Tor :18235 erreichbar.
#
# ZWEI ZUSICHERUNGEN, DIE ZUSAMMENGEHOEREN
# 1. Die Rollen-Routen antworten (positiver Fall).
# 2. /v1/models enthaelt WEITERHIN kein bge-Modell (negativer Fall). Das ist
#    keine Kosmetik: waere bge in der Chat-Modellliste, koennte ein Client, der
#    sich das erste Modell der Liste greift, bge-m3 eine Chat-Completion
#    schicken — exakt die Fehlerklasse, die T003203 behoben hat.
#
# POSITIV-ANKER (T002356-M1): Die Negativ-Aussage in Punkt 2 waere vakuos
# erfuellt, sobald /v1/models leer ist oder der Proxy gar nicht antwortet. Jeder
# @test prueft deshalb ZUERST, dass /v1/models eine nichtleere Modellliste
# liefert, und erst danach die eigentliche Aussage.
#
# ERREICHBARKEITS-GUARD: Laeuft kein Proxy auf :18235, wird geskippt statt rot.
# Ein Fehlschlag wuerde dort die Ausstattung des Runners messen statt den
# Zustand des Codes (T002716) — CI hat weder GPU noch bge-Modelldateien. Die
# Failover-SEMANTIK haengt deshalb nicht an dieser Datei, sondern an den
# Stub-Tests in scripts/llm-proxy/bge-routes.test.mjs, die ohne echtes bge
# auskommen und in CI regulaer laufen.

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO_ROOT
  export PROXY_URL="${LLM_PROXY_URL:-http://127.0.0.1:18235}"
}

setup() {
  load helpers/llm-endpoint
}

# Skippt, wenn der Proxy nicht laeuft. Bewusst ueber den HTTP-Status und nicht
# ueber den curl-Exit-Code (siehe Kopfkommentar in helpers/llm-endpoint.bash).
_require_proxy() {
  local code
  if ! code=$(llm_endpoint_healthy "${PROXY_URL}/v1/models" 5); then
    skip "llm-proxy auf ${PROXY_URL} nicht erreichbar (HTTP ${code}) — kein Aussagewert"
  fi
}

# Skippt, wenn die LAUFENDE Instanz die Route nicht kennt.
#
# Der Guard oben belegt nur, dass an :18235 UEBERHAUPT ein Proxy antwortet — nicht,
# dass es der Code unter Test ist. Vor dem Merge bedient den Port regelmaessig die
# systemd-Instanz aus dem Hauptcheckout (llm-proxy.service, WorkingDirectory=Repo-Wurzel),
# die diese Routen noch nicht hat und mit 501 antwortet. Ohne diese Unterscheidung misst
# der Test die INSTALLIERTE VERSION statt den Zustand des Codes — dieselbe Fehlerklasse,
# die der Kopfkommentar fuer die Runner-Ausstattung nennt (T002716), nur mit der Version
# als Stoergroesse. Er waere damit strukturell erst NACH dem Merge gruen und als
# Vor-Merge-Gate wertlos.
#
# Bewusst eng gefasst: NUR 501/404 (Route unbekannt) skippen. Jeder andere Nicht-200-Status
# bleibt ein Fehlschlag — sonst verdeckt der Guard den Fall "Route vorhanden, aber kaputt",
# und der Test bestuende vakuos, sobald die Implementierung fehlerhaft ist.
_require_route_known() {
  local path="$1" payload="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "${PROXY_URL}${path}" -H 'Content-Type: application/json' -d "$payload") || return 0
  if [ "$code" = "501" ] || [ "$code" = "404" ]; then
    skip "laufende Proxy-Instanz kennt ${path} nicht (HTTP ${code}) — misst nicht den Code unter Test; nach Merge + 'systemctl --user restart llm-proxy.service' erneut pruefen"
  fi
}

# Positiv-Anker: der Proxy antwortet und liefert eine nichtleere Modellliste.
# Wird von jedem @test aufgerufen, bevor die eigentliche Aussage geprueft wird.
_assert_proxy_answers() {
  run curl -s --max-time 10 "${PROXY_URL}/v1/models"
  [ "$status" -eq 0 ]
  run bash -c "printf '%s' '$output' | jq -r '.data | length'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "T003205: POST /v1/embeddings wird ueber die Rolle embed bedient" {
  _require_proxy
  _require_route_known /v1/embeddings '{"model":"bge-m3","input":["test"]}'
  _assert_proxy_answers

  run curl -s -D - -o /dev/null --max-time 60 \
    -X POST "${PROXY_URL}/v1/embeddings" \
    -H 'Content-Type: application/json' \
    -d '{"model":"bge-m3","input":["test"]}'
  [ "$status" -eq 0 ]
  # T003737-Begleitfix: $output in lokaler Variable sichern — das Zwischen-run
  # (HTTP-Zeile) ueberschreibt $output sonst, und der Header-Grep prueft nur
  # noch die Statuszeile (Test konnte lokal nie gruen werden; CI skippt ohne
  # Proxy, der Defekt war dort unsichtbar).
  local resp="$output"

  # Semantik statt Darstellung (T002716): geprueft wird der Statuscode und die
  # ANWESENHEIT eines nichtleeren Upstream-Headers, nicht dessen Wortlaut.
  run bash -c "printf '%s' '$resp' | grep -i '^HTTP/' | tail -1"
  [[ "$output" == *" 200"* ]]

  run bash -c "printf '%s' '$resp' | grep -i '^x-llm-proxy-bge-upstream:' | tr -d '\r' | cut -d' ' -f2-"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "T003205: POST /v1/rerank wird ueber die Rolle rerank bedient" {
  _require_proxy
  _require_route_known /v1/rerank '{"model":"bge-reranker-v2-m3","query":"a","documents":["b","c"]}'
  _assert_proxy_answers

  run curl -s -D - -o /dev/null --max-time 60 \
    -X POST "${PROXY_URL}/v1/rerank" \
    -H 'Content-Type: application/json' \
    -d '{"model":"bge-reranker-v2-m3","query":"a","documents":["b","c"]}'
  [ "$status" -eq 0 ]
  # T003737-Begleitfix: wie im embed-Test — $output vor dem Zwischen-run sichern.
  local resp="$output"

  run bash -c "printf '%s' '$resp' | grep -i '^HTTP/' | tail -1"
  [[ "$output" == *" 200"* ]]

  run bash -c "printf '%s' '$resp' | grep -i '^x-llm-proxy-bge-upstream:' | tr -d '\r' | cut -d' ' -f2-"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "T003205: /v1/models enthaelt kein bge-Modell" {
  _require_proxy
  # Positiv-Anker zuerst: ohne ihn waere 'kein bge in []' trivial erfuellt.
  _assert_proxy_answers

  run curl -s --max-time 10 "${PROXY_URL}/v1/models"
  [ "$status" -eq 0 ]
  run bash -c "printf '%s' '$output' | jq -r '.data[].id' | grep -ic 'bge' || true"
  [ "$output" -eq 0 ]
}
