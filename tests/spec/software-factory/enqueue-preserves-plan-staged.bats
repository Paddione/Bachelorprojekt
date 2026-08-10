#!/usr/bin/env bats
# Prüfmodus: COMMAND OUTPUT VERIFICATION (CLAUDE.md → Test-Resultats-Konvention).
# Die Tests führen `ticket.sh enqueue` AUS und prüfen das SQL, das dabei tatsächlich
# an die Datenbank ginge (protokolliert durch einen kubectl-Stub im PATH). Sie
# greppen NICHT den Quelltext von enqueue.sh.
#
# SSOT: openspec/specs/software-factory.md
# Hintergrund [T003575]: queue.sh hat zwei Dispatch-Zweige mit unterschiedlichen
# Zusatzgates. Ein gestagtes Ticket erfüllt Zweig B (status='plan_staged'). Wird es
# nach 'backlog' demoted, landet es in Zweig A, der zusätzlich lastenheft_locked=true
# verlangt — eine Flag, die dev-flow-plan-Tickets nicht tragen. Das Ticket fällt damit
# aus BEIDEN Zweigen und ist für den Dispatcher unsichtbar.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  STUBDIR="$BATS_TEST_TMPDIR/stub"
  SQLLOG="$BATS_TEST_TMPDIR/sql.log"
  mkdir -p "$STUBDIR"
  : > "$SQLLOG"
}

# make_kubectl_stub <status-den-die-db-meldet>
#
# Der Stub beantwortet beide Aufrufformen von _ticket-core.sh:
#   `kubectl get pod …`  → ein Pod-Name, damit _pgpod nicht abbricht
#   `kubectl exec … psql` → protokolliert das SQL von stdin und liefert den
#                           übergebenen Status zurück (für Status-Vorabfragen)
make_kubectl_stub() {
  local reported_status="$1"
  cat > "$STUBDIR/kubectl" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do
  if [[ "\$a" == "get" ]]; then echo "pod/shared-db-stub"; exit 0; fi
done
# exec-Pfad: SQL von stdin mitschreiben
sql="\$(cat)"
printf '%s\n---\n' "\$sql" >> "$SQLLOG"
# Status-Vorabfragen beantworten; alles andere liefert leer
if [[ "\$sql" == *"SELECT"* && "\$sql" == *"status"* ]]; then
  printf '%s\n' "$reported_status"
fi
exit 0
STUB
  chmod +x "$STUBDIR/kubectl"
}

# Zählt UPDATEs, die den Status auf 'backlog' setzen.
count_backlog_updates() {
  grep -c "status='backlog'" "$SQLLOG" 2>/dev/null || true
}

@test "T003575: enqueue demoted ein plan_staged-Ticket NICHT nach backlog" {
  make_kubectl_stub "plan_staged"

  run env PATH="$STUBDIR:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" enqueue --id T009999

  # POSITIV-ANKER (CLAUDE.md → Positiv-Anker-Pflicht bei Negativtests):
  # Erst belegen, dass der Befehl überhaupt gelaufen ist und die DB berührt hat.
  # Ohne diesen Anker wäre "0 backlog-UPDATEs" auch bei einem Frühabbruch erfüllt.
  [ "$status" -eq 0 ]
  [ -s "$SQLLOG" ]

  # Die eigentliche Zusicherung.
  local n; n="$(count_backlog_updates)"
  [ "${n:-0}" -eq 0 ] || {
    echo "erwartet: kein status='backlog'-UPDATE bei plan_staged, gefunden: $n"
    echo "--- SQL-Log ---"; cat "$SQLLOG"
    false
  }
}

@test "T003575: enqueue meldet sichtbar, dass ein gestagtes Ticket unveraendert bleibt" {
  make_kubectl_stub "plan_staged"

  run env PATH="$STUBDIR:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" enqueue --id T009999

  [ "$status" -eq 0 ]
  # Semantik, nicht Wortlaut (CLAUDE.md → Semantik statt Darstellung): geprüft wird,
  # dass der Ausgabetext den Vorzustand benennt, nicht seine exakte Formulierung.
  [[ "$output" == *"plan_staged"* ]] || {
    echo "Ausgabe muss den unveraenderten Zustand benennen; erhalten:"; echo "$output"
    false
  }
}

@test "T003575: enqueue setzt ein triage-Ticket weiterhin auf backlog (Regression)" {
  make_kubectl_stub "triage"

  run env PATH="$STUBDIR:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" enqueue --id T009999

  [ "$status" -eq 0 ]
  local n; n="$(count_backlog_updates)"
  [ "${n:-0}" -ge 1 ] || {
    echo "erwartet: genau der bisherige backlog-UPDATE fuer nicht-gestagte Tickets, gefunden: ${n:-0}"
    echo "--- SQL-Log ---"; cat "$SQLLOG"
    false
  }
}
