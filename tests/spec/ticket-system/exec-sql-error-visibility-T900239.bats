#!/usr/bin/env bats
# tests/spec/ticket-system/exec-sql-error-visibility-T900239.bats — T900239
# SSOT: openspec/specs/ticket-system.md
#
# Bug: `bash scripts/ticket.sh get-timeline --id <id>` bricht mit Exit 3 ab,
# stdout UND stderr leer — ununterscheidbar von "Ticket hat keine Historie".
#
# Ursache (verifiziert per bash -x Trace, nicht geraten): scripts/ticket.sh
# laeuft unter `set -euo pipefail`. In _exec_sql (scripts/vda/ticket/
# _ticket-core.sh) ist der `kubectl exec ... psql ...`-Aufruf ein blanker
# Befehl, gefolgt von `local rc=$?`. Schlaegt psql fehl (z. B. ON_ERROR_STOP
# bei einem SQL-Fehler, Exit 3), bricht errexit die Funktion GENAU an dieser
# Stelle ab — vor `local rc=$?`, vor dem stderr-Ausgabeblock und vor dem
# `rm -f "$stderr_tmp"`-Cleanup. Die Fehlermeldung existiert (liegt in
# stderr_tmp), wird aber nie gedruckt.
#
# Pruefmodus: Output-Verifikation (T002448-M4). kubectl wird gestubbt, um
# exakt dieses psql-Fehlverhalten zu simulieren (stderr-Text + Exit 3), ohne
# echten Cluster-Zugriff. _ticket-core.sh wird unter `set -euo pipefail`
# gesourct — derselbe Options-Zustand wie in scripts/ticket.sh — damit der
# Test den echten Bug reproduziert statt eines Labor-Artefakts.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIX="$(mktemp -d)"
  export STUB_LOG="$FIX/kubectl.log"
  : > "$STUB_LOG"
  mkdir -p "$FIX/bin"
  # Stub kubectl: `exec` simuliert psql, das unter ON_ERROR_STOP mit einem
  # echten SQL-Fehler abbricht (Exit 3, Fehlertext auf stderr) — exakt das
  # Verhalten, das im get-timeline-Query beobachtet wurde (tp.brand existiert
  # nicht). Der konkrete Fehlertext ist hier nur ein Stellvertreter: Gegenstand
  # dieses Tests ist die Sichtbarkeit des Fehlers, nicht der Query-Inhalt
  # selbst (siehe Abgrenzung in T900239 — Query-Fix ist T900103).
  cat > "$FIX/bin/kubectl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$STUB_LOG"
case " \$* " in
  *" exec "*)
    echo "ERROR:  column tp.brand does not exist" >&2
    exit 3
    ;;
esac
exit 0
EOF
  chmod +x "$FIX/bin/kubectl"
  export PATH="$FIX/bin:$PATH"
}

teardown() { rm -rf "$FIX"; }

@test "Positiv-Anker: _exec_sql laesst eine erfolgreiche SELECT-Query normal durch" {
  local ok_bin="$FIX/bin-ok"
  mkdir -p "$ok_bin"
  cat > "$ok_bin/kubectl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$STUB_LOG"
exit 0
EOF
  chmod +x "$ok_bin/kubectl"
  cat > "$FIX/exec-ok.sh" <<'EOF'
set -euo pipefail
CTX="fleet"; NS=workspace
source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"
_exec_sql pod/shared-db-0 <<<"SELECT 1;"
echo "REACHED_AFTER_OK"
EOF
  run env REPO_ROOT="$REPO_ROOT" PATH="$ok_bin:$PATH" bash "$FIX/exec-ok.sh"
  [ "$status" -eq 0 ]
  grep -qF 'REACHED_AFTER_OK' <<<"$output"
}

@test "_exec_sql: SQL-Fehler unter set -e zeigt die Fehlerursache auf stderr statt still abzubrechen" {
  cat > "$FIX/exec-err.sh" <<'EOF'
set -euo pipefail
CTX="fleet"; NS=workspace
source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"
_exec_sql pod/shared-db-0 <<<"SELECT 1;"
EOF
  run env REPO_ROOT="$REPO_ROOT" bash "$FIX/exec-err.sh"
  # Der Exit-Code war schon vor dem Fix nonzero (psql/kubectl exec propagiert
  # ihn korrekt) — das Defizit war die fehlende Fehlerursache auf stderr.
  [ "$status" -ne 0 ]
  grep -qF 'column tp.brand does not exist' <<<"$output"
}
