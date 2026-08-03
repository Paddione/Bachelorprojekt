#!/usr/bin/env bats
# Ziele G-LLM01..G-LLM05 — LLM-Stack-Betrieb [T002442]
#
# PRÜFMODUS: command output verification (T002448-M4).
# Jeder Test FÜHRT `scripts/lib/llm-stack-measure.sh <subcommand>` gegen eine echte
# Fixture AUS und prüft `$output`/`$status`. Kein `grep` auf den Skriptquelltext —
# geprüft wird das Messergebnis, nicht dessen Schreibweise.
#
# AUFBAU je Ziel (Positiv-Anker zuerst, T002356-M1):
#   1. Anker-Test    — ohne Messgrundlage MUSS `n/a` kommen und NICHT `0`.
#   2. Verletzungs-Test — mit präparierter Verletzung MUSS die Verletzung gezählt
#      werden, und ein gültiger Nachbarfall in derselben Fixture darf NICHT
#      mitgezählt werden.
#
# Fixtures sind netz- und datenbankfrei: statische Dateien über einen lokalen
# `python3 -m http.server`-Prozess, Loadout-/MCP-/Unit-Registry über Datei- und
# Kommando-Overrides.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  MEASURE="$REPO_ROOT/scripts/lib/llm-stack-measure.sh"
  FIX="$(mktemp -d)"
  unset CI || true
  # Produktionsvorgaben ausblenden, damit die Fixture allein entscheidet.
  unset LLM_PROXY_URL LLM_MEASURE_LOADOUTS LLM_MEASURE_BACKENDS_CMD \
        LLM_MEASURE_MCP_REGISTRY LLM_MEASURE_UNIT_DIRS LLM_MEASURE_UNIT_STATE_CMD || true
}

teardown() {
  # Alle gestarteten http.server-Prozesse dieser Fixture beenden.
  if [ -n "${HTTP_PIDS:-}" ]; then
    for p in $HTTP_PIDS; do kill "$p" 2>/dev/null || true; done
  fi
  [ -n "${FIX:-}" ] && rm -rf "$FIX"
  return 0
}

# ── Fixture-Helfer ────────────────────────────────────────────────────────────

# Freien TCP-Port ermitteln (bind auf 127.0.0.1:0).
free_port() {
  python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'
}

# Statischen HTTP-Server auf einem freien Port starten, der die Dateien aus $1
# (ein Verzeichnis) ausliefert. Gibt den Port aus und registriert die PID.
# Ein "toter Port" ist ein Port, auf dem NICHTS gestartet wurde.
# Alle FDs werden umgeleitet, damit bats nicht auf offene Kanäle wartet.
serve_dir() { # <verzeichnis>
  local dir="$1" port
  port="$(free_port)"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" \
    >"$FIX/http-$port.log" 2>&1 </dev/null &
  HTTP_PIDS="${HTTP_PIDS:-} $!"
  # Warten, bis der Server wirklich lauscht.
  for _ in $(seq 1 50); do
    if curl -s -m 1 "http://127.0.0.1:$port/" >/dev/null 2>&1; then break; fi
    sleep 0.05
  done
  printf '%s' "$port"
}

# Loadout-Registry-Fixture schreiben. Erwartet JSON auf stdin.
# Referenziert über LLM_MEASURE_LOADOUTS.
write_loadouts() {
  cat > "$FIX/loadouts.json"
  export LLM_MEASURE_LOADOUTS="$FIX/loadouts.json"
}

# Backend-Registry-Kommando-Override: gibt Zeilen "name<TAB>base_url" aus.
# In Produktion die factory_psql-Abfrage auf tickets.llm_proxy_backends.
backend_cmd() { # <zeilen...>
  local f="$FIX/backends.txt"
  : > "$f"
  for line in "$@"; do printf '%s\n' "$line" >> "$f"; done
  export LLM_MEASURE_BACKENDS_CMD="cat $f"
}

# MCP-Registry-Fixture schreiben (Pfad-Override).
write_mcp_registry() {
  cat > "$FIX/mcp.yaml"
  export LLM_MEASURE_MCP_REGISTRY="$FIX/mcp.yaml"
}

# Unit-Verzeichnis + Zustands-Kommando-Override.
# unit_state_cmd <state> wendet EINEN Zustand auf alle Units an. Die Override-
# Datei ist ein Skript (kein Inline-Kommando): das Messskript hängt "$u" als
# Argument an und splittet das Kommando an Wortgrenzen — Inline-Funktionen mit
# Anführungszeichen überleben das nicht.
unit_state_cmd() { # <state> -> enabled|disabled (gilt fuer alle Units)
  local s="$1"
  cat > "$FIX/unit-state.sh" <<EOF
#!/usr/bin/env bash
printf '%s' '$s'
EOF
  chmod +x "$FIX/unit-state.sh"
  export LLM_MEASURE_UNIT_STATE_CMD="bash $FIX/unit-state.sh"
}

# ── G-LLM01 — Modellserver-Verfügbarkeit (exclusiveGroup-bewusst) ────────────

@test "G-LLM01: ohne Loadout-Registry meldet server-availability n/a, nicht 0" {
  # Positiv-Anker zuerst: mit Registry + erreichbarem /livez MUSS eine Zahl kommen.
  local port
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  write_loadouts <<EOF
{"version":1,"loadouts":[{"slug":"a","port":$port,"exclusiveGroup":"g"}]}
EOF
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: keine Registry (nicht-existente Datei) => n/a, niemals 0.
  export LLM_MEASURE_LOADOUTS="$FIX/gibt-es-nicht.json"
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM01: exclusiveGroup zählt nur Gruppen ohne lebendes Mitglied" {
  # Drei Einträge einer Gruppe, genau einer lebendig => Gruppe verfügbar, zählt nicht.
  local live dead1 dead2
  live="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  echo ok > "$FIX/health"
  export LLM_PROXY_URL="http://127.0.0.1:$live"
  dead1="$(free_port)"; dead2="$(free_port)"
  write_loadouts <<EOF
{"version":1,"loadouts":[
  {"slug":"a","port":$live,"exclusiveGroup":"g"},
  {"slug":"b","port":$dead1,"exclusiveGroup":"g"},
  {"slug":"c","port":$dead2,"exclusiveGroup":"g"}
]}
EOF
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]

  # Zweite Gruppe komplett tot => zählt 1.
  local dead3 dead4
  dead3="$(free_port)"; dead4="$(free_port)"
  write_loadouts <<EOF
{"version":1,"loadouts":[
  {"slug":"a","port":$live,"exclusiveGroup":"g"},
  {"slug":"b","port":$dead1,"exclusiveGroup":"g"},
  {"slug":"c","port":$dead2,"exclusiveGroup":"g"},
  {"slug":"d","port":$dead3,"exclusiveGroup":"tot"},
  {"slug":"e","port":$dead4,"exclusiveGroup":"tot"}
]}
EOF
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "G-LLM01: gruppenloser Loadout-Port ohne Listener zählt einzeln" {
  local live dead
  live="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  echo ok > "$FIX/health"
  export LLM_PROXY_URL="http://127.0.0.1:$live"
  dead="$(free_port)"
  write_loadouts <<EOF
{"version":1,"loadouts":[
  {"slug":"a","port":$live,"exclusiveGroup":"g"},
  {"slug":"b","port":$dead}
]}
EOF
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  # Positiv-Anker: der lebende Gruppen-Port zählt NICHT mit — sonst wäre die Zahl 2.
  [ "$output" = "1" ]
}

@test "G-LLM01: Objekt-statt-Liste (reale Form) liefert eine Zahl, kein n/a" {
  # Der Bestandsbefehl iterierte über das Objekt und fiel mit AttributeError in n/a.
  local port
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  echo ok > "$FIX/health"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  write_loadouts <<EOF
{"version":1,"modelRoots":{},"defaults":{},"loadouts":[{"slug":"a","port":$port,"exclusiveGroup":"g"}]}
EOF
  run bash "$MEASURE" server-availability
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]
}

# ── G-LLM02 — llm-proxy-Bereitschaft ─────────────────────────────────────────

@test "G-LLM02: ohne /health-Antwort meldet proxy-readiness n/a, nicht 0" {
  # Positiv-Anker zuerst: mit gültiger Antwort MUSS eine Zahl kommen.
  local port
  port="$(serve_dir "$FIX")"
  cat > "$FIX/health" <<EOF
{"status":"ok","ready":true,"degraded":[],"checked":1}
EOF
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  run bash "$MEASURE" proxy-readiness
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: kein Server => n/a.
  export LLM_PROXY_URL="http://127.0.0.1:$(free_port)"
  run bash "$MEASURE" proxy-readiness
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM02: Feldname degraded statt providers — zählt die Länge von degraded" {
  # Der Bestandsbefehl las data.get('providers', []) — existiert nicht => falsch grün 0.
  local port
  port="$(serve_dir "$FIX")"
  cat > "$FIX/health" <<EOF
{"status":"ok","ready":true,"degraded":[{"name":"deepseek"},{"name":"opencode-zen"}],"checked":3}
EOF
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  run bash "$MEASURE" proxy-readiness
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

@test "G-LLM02: Antwort ohne degraded und ohne checked meldet n/a (Form-Anker)" {
  local port
  port="$(serve_dir "$FIX")"
  cat > "$FIX/health" <<EOF
{"status":"ok","ready":true}
EOF
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  run bash "$MEASURE" proxy-readiness
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM02: ready:false zählt checked als Zahl, kein Statuswort" {
  local port
  port="$(serve_dir "$FIX")"
  cat > "$FIX/health" <<EOF
{"status":"ok","ready":false,"degraded":[{"name":"a"},{"name":"b"},{"name":"c"}],"checked":3}
EOF
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  run bash "$MEASURE" proxy-readiness
  [ "$status" -eq 0 ]
  [ "$output" = "3" ]
  [[ "$output" =~ ^[0-9]+$ ]]
}

# ── G-LLM03 — Konfig-gegen-Laufzeit-Drift (Modell-ID) ────────────────────────

@test "G-LLM03: ohne Loadout-Registry meldet model-drift n/a, nicht 0" {
  # Positiv-Anker zuerst: mit Registry + erreichbarem /livez MUSS eine Zahl kommen.
  local port
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  write_loadouts <<EOF
{"version":1,"loadouts":[{"slug":"a","port":$port,"model":"m1.gguf"}]}
EOF
  run bash "$MEASURE" model-drift
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  export LLM_MEASURE_LOADOUTS="$FIX/gibt-es-nicht.json"
  run bash "$MEASURE" model-drift
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM03: /v1/models-ID nicht im Loadout geführt zählt, geführte nicht" {
  local port
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  # Der Port führt drei Slugs; die gemeldete ID entspricht einem davon => zählt nicht.
  mkdir -p "$FIX/v1"
  cat > "$FIX/v1/models" <<EOF
{"object":"list","data":[{"id":"gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"}]}
EOF
  write_loadouts <<EOF
{"version":1,"loadouts":[
  {"slug":"a","port":$port,"model":"unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"},
  {"slug":"b","port":$port,"model":"unsloth/gemma-4-12B-it-qat-UD-Q4_K_XL/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf"},
  {"slug":"c","port":$port,"model":"gemma4/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf"}
]}
EOF
  run bash "$MEASURE" model-drift
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]

  # Drift: gemeldete ID ist für diesen Port nicht geführt => zählt 1.
  cat > "$FIX/v1/models" <<EOF
{"object":"list","data":[{"id":"gptoss20/gpt-oss-20b-Q8_0.gguf"}]}
EOF
  run bash "$MEASURE" model-drift
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── G-LLM04 — Autostart-Abdeckung ────────────────────────────────────────────

@test "G-LLM04: ohne Unit-Dateien meldet autostart-coverage n/a, nicht 0" {
  # Positiv-Anker zuerst: mit einer Unit MUSS eine Zahl kommen.
  mkdir -p "$FIX/units"
  cat > "$FIX/units/foo.service" <<EOF
[Unit]
Description=foo
[Service]
ExecStart=/bin/true
[Install]
WantedBy=default.target
EOF
  export LLM_MEASURE_UNIT_DIRS="$FIX/units"
  unit_state_cmd enabled
  run bash "$MEASURE" autostart-coverage
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: kein Verzeichnis => n/a.
  export LLM_MEASURE_UNIT_DIRS="$FIX/kein-units"
  run bash "$MEASURE" autostart-coverage
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM04: deklarierte Unit ohne enabled-Zustand zählt, enabled nicht" {
  mkdir -p "$FIX/units"
  cat > "$FIX/units/foo.service" <<EOF
[Unit]
Description=foo
[Service]
ExecStart=/bin/true
[Install]
WantedBy=default.target
EOF
  cat > "$FIX/units/bar.service" <<EOF
[Unit]
Description=bar
[Service]
ExecStart=/bin/true
[Install]
WantedBy=default.target
EOF
  export LLM_MEASURE_UNIT_DIRS="$FIX/units"
  # foo enabled, bar disabled => zählt 1.
  cat > "$FIX/unit-state.sh" <<EOF
#!/usr/bin/env bash
[ "\$1" = 'foo.service' ] && printf '%s' enabled || printf '%s' disabled
EOF
  chmod +x "$FIX/unit-state.sh"
  export LLM_MEASURE_UNIT_STATE_CMD="bash $FIX/unit-state.sh"
  run bash "$MEASURE" autostart-coverage
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

# ── G-LLM05 — Tote lokale Endpunkt-Verweise ──────────────────────────────────

@test "G-LLM05: ohne Backend-Registry meldet dead-endpoints n/a, nicht 0" {
  # Positiv-Anker zuerst: mit Registry + erreichbarem /livez MUSS eine Zahl kommen.
  local port
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  backend_cmd "alive	http://127.0.0.1:$port/v1"
  run bash "$MEASURE" dead-endpoints
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]

  # Negativ-Aussage: keine Registry (leeres Kommando) => n/a.
  : > "$FIX/leer.txt"
  export LLM_MEASURE_BACKENDS_CMD="cat $FIX/leer.txt"
  run bash "$MEASURE" dead-endpoints
  [ "$status" -eq 0 ]
  [ "$output" = "n/a" ]
  [ "$output" != "0" ]
}

@test "G-LLM05: Familiengrenze — MCP-Registry-Endpunkt wird nicht doppelt gezählt" {
  local port dead
  port="$(serve_dir "$FIX")"
  echo ok > "$FIX/livez"
  export LLM_PROXY_URL="http://127.0.0.1:$port"
  dead="$(free_port)"
  # Zwei lokale Endpunkte ohne Listener; einer davon zusätzlich in der MCP-Registry.
  backend_cmd \
    "a	http://127.0.0.1:$dead/v1" \
    "b	http://127.0.0.1:$(free_port)/v1"
  write_mcp_registry <<EOF
clients:
  mcp-x:
    transport: http
    endpoint: http://127.0.0.1:$dead/mcp
EOF
  run bash "$MEASURE" dead-endpoints
  [ "$status" -eq 0 ]
  # Positiv-Anker: der MCP-Registry-Endpunkt zählt NICHT mit — sonst wäre die Zahl 2.
  [ "$output" = "1" ]
}

# ── Querschnitt ──────────────────────────────────────────────────────────────

@test "llm-stack-measure: unbekanntes Subkommando bricht ab statt n/a zu melden" {
  run bash "$MEASURE" gibt-es-nicht
  [ "$status" -ne 0 ]
  [ "$output" != "n/a" ]
}
