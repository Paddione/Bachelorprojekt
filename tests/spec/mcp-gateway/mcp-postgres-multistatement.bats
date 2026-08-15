#!/usr/bin/env bats
# tests/spec/mcp-gateway/mcp-postgres-multistatement.bats
# SSOT: openspec/specs/mcp-gateway.md (Delta: openspec/changes/mcp-postgres-multistatement)
# Ticket: T006293
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-orientiert.
# Jeder Test STARTET den echten Adapter (scripts/mcp-gateway/mcp-postgres-local.mjs)
# auf einem eigenen Port mit Wegwerf-DATABASE_URL und prueft die JSON-RPC-Antwort
# per curl — kein Grep gegen den Quelltext.
#
# Externe Abhaengigkeit (T002820): Test 1 braucht eine erreichbare PostgreSQL-DB
# (lokale k3d-Dev-DB auf :15432), weil nur dann das Fehlverhalten "[] statt Fehler"
# reproduzierbar ist. In CI (keine lokale DB) skippt Test 1. Test 2 prueft den
# praeventiven Ablehnungspfad VOR der DB-Ausfuehrung und laeuft dadurch auch in CI.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SERVER="$REPO/scripts/mcp-gateway/mcp-postgres-local.mjs"

  command -v node >/dev/null 2>&1 || skip "node nicht verfuegbar"
  command -v curl >/dev/null 2>&1 || skip "curl nicht verfuegbar"

  # Freien Port suchen statt einen festen zu belegen — parallele BATS-Laeufe
  # und der echte Dienst auf :13001 duerfen sich nicht ins Gehege kommen.
  PORT=""
  for candidate in $(seq 19660 19680); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      PORT="$candidate"
      break
    fi
  done
  [ -n "$PORT" ] || skip "kein freier Port im Bereich 19660-19680"
}

teardown() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}

# startet den Adapter mit gegebener DATABASE_URL und wartet auf den Listener
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

@test "mcp-postgres: Multi-Statement-SQL wird mit Fehler abgelehnt statt mit leerem Array beantwortet" {
  # Externe Abhaengigkeit (T002820): lokale k3d-Dev-DB, in CI nicht vorhanden → skip
  if ! (exec 3<>"/dev/tcp/127.0.0.1/15432") 2>/dev/null; then
    skip "lokale k3d-Dev-DB auf :15432 nicht erreichbar"
  fi
  start_server "postgresql://postgres@localhost:15432/website"

  # Positiv-Anker zuerst (T002356-M1): Einzel-Statement liefert weiterhin Zeilen.
  single="$(query_call 1 "SELECT 1 AS total_open")"
  echo "$single" | grep -q 'total_open' || {
    echo "FAIL: Einzel-Statement liefert kein Ergebnis: $single" >&2
    return 1
  }

  # Negativ-Aussage: Multi-Statement → JSON-RPC-Fehler, niemals leeres Array.
  multi="$(query_call 2 "SELECT 1 AS a; SELECT 2 AS b; SELECT 3 AS c; SELECT 4 AS d")"
  echo "$multi" | grep -q '"error"' || {
    echo "FAIL: Multi-Statement liefert keinen Fehler: $multi" >&2
    return 1
  }
  echo "$multi" | grep -q '\[\]' && {
    echo "FAIL: Multi-Statement liefert leeres Array statt Fehler: $multi" >&2
    return 1
  }
}

@test "mcp-postgres: Multi-Statement wird vor der DB-Ausfuehrung abgelehnt (auch ohne DB)" {
  # DB absichtlich unerreichbar: freier Port aus demselben Scan — dort lauscht nichts.
  DB_PORT=""
  for candidate in $(seq 19681 19690); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then
      DB_PORT="$candidate"
      break
    fi
  done
  [ -n "$DB_PORT" ] || skip "kein freier DB-Port im Bereich 19681-19690"
  start_server "postgresql://postgres@127.0.0.1:${DB_PORT}/website"

  multi="$(query_call 1 "SELECT 1 AS a; SELECT 2 AS b")"
  echo "$multi" | grep -q 'single-statement' || {
    echo "FAIL: Multi-Statement wird nicht vor der DB-Ausfuehrung abgelehnt: $multi" >&2
    return 1
  }
}
