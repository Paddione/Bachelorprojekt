#!/usr/bin/env bats
# tests/spec/mcp-gateway/mcp-postgres-readonly-role.bats
# SSOT: openspec/specs/mcp-gateway.md (Delta: openspec/changes/mcp-postgres-readonly-role)
# Ticket: T006335
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert. Jeder Test
# startet den echten Adapter (scripts/mcp-gateway/mcp-postgres-local.mjs) auf einem
# eigenen Port und prueft die JSON-RPC-Antwort per curl — kein Grep gegen den Quelltext.
#
# Hintergrund (T006335): Die textuellen Guards des Adapters (Prefix-Guard SELECT/WITH/EXPLAIN
# + Multi-Statement-Lexer) sind per data-modifying CTE (`WITH x AS (DELETE …) SELECT …`) und
# `EXPLAIN ANALYZE DELETE …` umgehbar — am 2026-08-15 empirisch verifiziert. Harte Grenze ist
# die Readonly-Rolle `mcp_readonly` (LOGIN, NOSUPERUSER, pg_read_all_data,
# default_transaction_read_only=on) auf DB-Ebene; der Adapter verbindet als diese Rolle.
#
# Externe Abhaengigkeit (T002820): Tests 1 und 4 brauchen die lokale k3d-Dev-DB auf :15432
# (trust-Auth, passwortlos) — in CI (keine lokale DB) skippen sie. Tests 2 und 3 pruefen den
# Pre-DB-Ablehnungspfad und laufen dadurch auch in CI.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SERVER="$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"

  command -v node >/dev/null 2>&1 || skip "node nicht verfuegbar"
  command -v curl >/dev/null 2>&1 || skip "curl nicht verfuegbar"

  # Freien Port suchen statt einen festen zu belegen — parallele BATS-Laeufe
  # und der echte Dienst auf :13001 duerfen sich nicht ins Gehege kommen.
  PORT=""
  for candidate in $(seq 19760 19790); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      PORT="$candidate"
      break
    fi
  done
  [ -n "$PORT" ] || skip "kein freier Port im Bereich 19760-19790"
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  if [ -n "${DB_URL_DEV:-}" ] && command -v psql >/dev/null 2>&1; then
    psql -X -q "$DB_URL_DEV" -c "DROP TABLE IF EXISTS public.__t006335_ro_probe" >/dev/null 2>&1 || true
  fi
}

# startet den Adapter (ohne DATABASE_URL → Default-Identität) und wartet auf den Listener
start_server() {
  local db_url="$1"
  DATABASE_URL="$db_url" PORT="$PORT" node "$SERVER" >/dev/null 2>&1 &
  SERVER_PID=$!

  local up=""
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null --max-time 1 -X POST \
         -H 'content-type: application/json' \
         -d '{}' "http://127.0.0.1:${PORT}/mcp" 2>/dev/null; then
      up=yes
      break
    fi
    sleep 0.1
  done
  [ -n "$up" ] || {
    kill "$SERVER_PID" 2>/dev/null || true
    skip "Adapter kam auf Port $PORT nicht hoch"
  }
}

# query_call <id> <sql> → JSON-RPC tools/call Antwort des Test-Servers
query_call() {
  curl -s -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$1,\"method\":\"tools/call\",\"params\":{\"name\":\"query\",\"arguments\":{\"sql\":\"$2\"}}}" \
    "http://127.0.0.1:${PORT}/mcp"
}

# psql_call <sql> → stderr-lose Ausgabe gegen die Dev-DB.
# Retry-Schleife: der kubectl-port-forward auf :15432 flappt lokal nachweislich
# (Verbindungsabbruch beim Neustart des Forwards) — ein einzelner Call kann
# mitten in der Reconnect-Luecke landen und leer zurueckkommen.
psql_call() {
  local out="" i
  for i in $(seq 1 10); do
    out="$(psql -X -A -t "$DB_URL_DEV" -c "$1" 2>/dev/null)"
    [ -n "$out" ] && { printf '%s' "$out"; return 0; }
    sleep 1
  done
  printf '%s' "$out"
}

@test "mcp-postgres: WITH-CTE und EXPLAIN-ANALYZE-DELETE scheitern an der Readonly-Grenze" {
  # Externe Abhaengigkeit (T002820): lokale k3d-Dev-DB, in CI nicht vorhanden → skip
  if ! (exec 3<>"/dev/tcp/127.0.0.1/15432") 2>/dev/null; then
    skip "lokale k3d-Dev-DB auf :15432 nicht erreichbar"
  fi
  command -v psql >/dev/null 2>&1 || skip "psql nicht verfuegbar"
  DB_URL_DEV="postgresql://postgres@localhost:15432/website"

  # Scratch-Tabelle (nur diese wird von den Bypass-Versuchen beruehrt — kein Bestandsdatum)
  psql_call "DROP TABLE IF EXISTS public.__t006335_ro_probe; CREATE TABLE public.__t006335_ro_probe (probe_id int); INSERT INTO public.__t006335_ro_probe VALUES (1);"
  [ "$(psql_call "SELECT count(*) FROM public.__t006335_ro_probe")" = "1" ] || {
    echo "FAIL: Scratch-Tabelle nicht initialisiert" >&2
    return 1
  }

  # Adapter mit Default-Identitaet starten (kein DATABASE_URL-Override)
  start_server ""
  [ -z "$DATABASE_URL" ] || true

  # Positiv-Anker zuerst (T002356-M1): reines SELECT liefert weiterhin Zeilen.
  single="$(query_call 1 "SELECT probe_id FROM public.__t006335_ro_probe")"
  echo "$single" | grep -q 'probe_id' || {
    echo "FAIL: Positiv-Anker SELECT liefert kein Ergebnis: $single" >&2
    return 1
  }

  # Negativ-Aussage 1: data-modifying CTE → JSON-RPC-Fehler, niemals Zeilen.
  cte="$(query_call 2 "WITH x AS (DELETE FROM public.__t006335_ro_probe RETURNING probe_id) SELECT probe_id FROM x")"
  if echo "$cte" | grep -q 'read-only'; then :; else
    echo "FAIL: WITH-CTE-DELETE nicht an der Readonly-Grenze gescheitert: $cte" >&2
    return 1
  fi
  if echo "$cte" | grep -q 'probe_id'; then
    echo "FAIL: WITH-CTE-DELETE hat Zeilen geliefert statt abgelehnt zu werden: $cte" >&2
    return 1
  fi

  # Negativ-Aussage 2: EXPLAIN ANALYZE DELETE → JSON-RPC-Fehler, niemals Query-Plan.
  ex="$(query_call 3 "EXPLAIN ANALYZE DELETE FROM public.__t006335_ro_probe")"
  if echo "$ex" | grep -q 'read-only'; then :; else
    echo "FAIL: EXPLAIN-ANALYZE-DELETE nicht an der Readonly-Grenze gescheitert: $ex" >&2
    return 1
  fi
  if echo "$ex" | grep -q 'QUERY PLAN'; then
    echo "FAIL: EXPLAIN-ANALYZE-DELETE hat einen Query-Plan geliefert statt abgelehnt zu werden: $ex" >&2
    return 1
  fi

  # Beide Mutationen durften nicht ausgefuehrt worden sein.
  [ "$(psql_call "SELECT count(*) FROM public.__t006335_ro_probe")" = "1" ] || {
    echo "FAIL: Bypass hat die Scratch-Tabelle veraendert (Zeilen: $(psql_call "SELECT count(*) FROM public.__t006335_ro_probe"))" >&2
    return 1
  }
}

@test "mcp-postgres: data-modifying CTE wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)" {
  # DB absichtlich unerreichbar: freier Port aus demselben Scan — dort lauscht nichts.
  DB_PORT=""
  for candidate in $(seq 19791 19800); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      DB_PORT="$candidate"
      break
    fi
  done
  [ -n "$DB_PORT" ] || skip "kein freier DB-Port im Bereich 19791-19800"
  start_server "postgresql://mcp_readonly@127.0.0.1:${DB_PORT}/website"

  cte="$(query_call 1 "WITH x AS (DELETE FROM t RETURNING id) SELECT id FROM x")"
  echo "$cte" | grep -q 'read-only' || {
    echo "FAIL: data-modifying CTE wird nicht vor der DB-Ausfuehrung abgelehnt: $cte" >&2
    return 1
  }
}

@test "mcp-postgres: EXPLAIN ANALYZE mit Mutation wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)" {
  DB_PORT=""
  for candidate in $(seq 19801 19810); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      DB_PORT="$candidate"
      break
    fi
  done
  [ -n "$DB_PORT" ] || skip "kein freier DB-Port im Bereich 19801-19810"
  start_server "postgresql://mcp_readonly@127.0.0.1:${DB_PORT}/website"

  ex="$(query_call 1 "EXPLAIN ANALYZE DELETE FROM t")"
  echo "$ex" | grep -q 'read-only' || {
    echo "FAIL: EXPLAIN-ANALYZE-Mutation wird nicht vor der DB-Ausfuehrung abgelehnt: $ex" >&2
    return 1
  }
}

@test "mcp-postgres: Rolle mcp_readonly ist als harte Grenze provisioniert" {
  # Externe Abhaengigkeit (T002820): lokale k3d-Dev-DB, in CI nicht vorhanden → skip
  if ! (exec 3<>"/dev/tcp/127.0.0.1/15432") 2>/dev/null; then
    skip "lokale k3d-Dev-DB auf :15432 nicht erreichbar"
  fi
  command -v psql >/dev/null 2>&1 || skip "psql nicht verfuegbar"
  DB_URL_DEV="postgresql://postgres@localhost:15432/website"

  # Output-Verifikation (T002448-M4): Rollen-Eigenschaften kommen aus pg_roles, nicht aus dem Quelltext.
  role="$(psql_call "SELECT rolname || '|' || rolcanlogin || '|' || rolsuper || '|' || coalesce(rolconfig::text,'') || '|' || pg_has_role('mcp_readonly','pg_read_all_data','member') FROM pg_roles WHERE rolname='mcp_readonly'")"
  echo "$role" | grep -Eq '^mcp_readonly\|(t|true)\|(f|false)\|' || {
    echo "FAIL: Rolle mcp_readonly fehlt oder hat falsche Attribute: '$role'" >&2
    return 1
  }
  echo "$role" | grep -q 'default_transaction_read_only=on' || {
    echo "FAIL: default_transaction_read_only fehlt: '$role'" >&2
    return 1
  }
  echo "$role" | grep -Eq '\|(t|true)$' || {
    echo "FAIL: pg_read_all_data-Mitgliedschaft fehlt: '$role'" >&2
    return 1
  }
}
