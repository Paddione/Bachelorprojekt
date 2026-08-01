#!/usr/bin/env bats

# k5-epic-canvas.bats — K5 Epic-Canvas (T002464)
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): GEMISCHT, und zwar bewusst.
#   - Die Routen-Tests rufen den laufenden Daemon per curl auf und pruefen die
#     Antwort. Das ist Ergebnis-Verifikation.
#   - Die E1-Tests sind Querschnitts-/Konventionspruefungen ("kein Panel ruft
#     fetch() direkt"). Ihr Gegenstand manifestiert sich ausschliesslich im
#     Quelltext, deshalb ist grep hier das angemessene Mittel — die in der
#     Konvention genannte Ausnahme.
#
# Hintergrund: die erste Fassung von routes/epics.ts war in server.ts nie
# registriert. Sie war damit toter Code, und der einzige Verify-Schritt des
# Plans lautete `npx html-validate … || true` — ein Kommando, das per
# Konstruktion nie fehlschlagen kann. Deshalb prueft dieser Test die
# Registrierung ueber die HTTP-Antwort und nicht ueber die Import-Zeile.

load daemon-helper

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  KIT_DIR="$REPO/.lavish/kit"
}

# ---------------------------------------------------------------------------
# Routen — brauchen einen laufenden Daemon
# ---------------------------------------------------------------------------

@test "T002464 GET /api/cockpit/epics ist registriert und antwortet" {
  require_daemon || return 1

  run curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/cockpit/epics"
  # 404 hiesse: Route nicht registriert — genau der Ausgangszustand des Branches.
  [ "$output" = "200" ]
}

@test "T002464 /api/cockpit/epics liefert fetchedAt (D12)" {
  require_daemon || return 1

  run curl -s "${BASE}/api/cockpit/epics"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "fetchedAt"
}

@test "T002464 /api/cockpit/epics liefert entweder epics ODER error, nie stumm nichts (D13)" {
  require_daemon || return 1

  run curl -s "${BASE}/api/cockpit/epics"
  [ "$status" -eq 0 ]

  # POSITIV-ANKER: es kommt ueberhaupt eine JSON-Antwort zurueck.
  echo "$output" | grep -q "fetchedAt"

  # Genau eines von beidem muss da sein. Die Vorgaengerfassung fing jeden
  # Fehler mit `catch { return [] }` ab und lieferte eine leere Liste ohne
  # error-Feld — ein Datenbankausfall sah damit aus wie "keine Epics".
  if echo "$output" | grep -q '"error"'; then
    :
  else
    echo "$output" | grep -q '"epics"'
  fi
}

@test "T002464 changes-since antwortet ohne ts konservativ mit hasChanges=true (OF1)" {
  require_daemon || return 1

  # Ohne Bezugszeitpunkt laesst sich nichts ausschliessen. Die Vorgaengerfassung
  # antwortete hier mit hasChanges:false und haette damit ausgerechnet im
  # unklarsten Fall zum Ueberschreiben geraten.
  run curl -s "${BASE}/api/cockpit/epics/T002458/changes-since"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"hasChanges":true'
}

@test "T002464 changes-since weist einen unbrauchbaren Zeitstempel ab (OF1)" {
  require_daemon || return 1

  # POSITIV-ANKER: ein gueltiger ISO-Zeitstempel wird verarbeitet und liefert
  # ein hasChanges-Feld. Ohne diesen Anker waere die Aussage unten trivial,
  # falls die Route generell kaputt ist.
  run curl -s -G --data-urlencode "ts=2026-01-01T00:00:00.000Z" \
    "${BASE}/api/cockpit/epics/T002458/changes-since"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"hasChanges"'

  # Freitext ist kein Zeitstempel und darf nicht an git durchgereicht werden.
  run curl -s -G --data-urlencode "ts=yesterday; id" \
    "${BASE}/api/cockpit/epics/T002458/changes-since"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"hasChanges":true'
  # Eine Shell haette `id` ausgefuehrt; die uid-Zeile darf nirgends auftauchen.
  ! echo "$output" | grep -qE 'uid=[0-9]+'
}

# ---------------------------------------------------------------------------
# E1 — kein direktes fetch() in den Kit-Dateien
# ---------------------------------------------------------------------------

# Zaehlt echte fetch(-AUFRUFE, ohne Zeilenkommentare.
#
# Ein naives `grep -c 'fetch('` zaehlt auch Saetze wie "nie per eigenem
# fetch()" mit — die Erklaerung, WARUM hier kein fetch steht, liesse den Guard
# also rot werden. Kommentarzeilen fallen deshalb vorher raus.
count_fetch_calls() {
  grep -v '^[[:space:]]*//' "$1" | grep -c 'fetch(' || true
}

@test "T002464 Kein K5-Panel und kein Store ruft fetch direkt auf (E1) [Negativtest + Positiv-Anker]" {
  # POSITIV-ANKER: der Adapter stellt die K5-Methoden ueberhaupt bereit. Fehlen
  # sie, ist die Negativ-Aussage unten wertlos — dann ruft eben niemand fetch(),
  # weil es gar keine Epic-Anzeige gibt.
  grep -q 'function epics' "$KIT_DIR/adapter.js"
  grep -q 'function epicChangesSince' "$KIT_DIR/adapter.js"

  # GEGENPROBE: adapter.js DARF fetch( enthalten — er ist die eine Stelle, die
  # es soll. Waere die Zaehlfunktion kaputt und lieferte immer 0, faellt es hier
  # auf, statt die Negativ-Aussagen unten vakuos zu bestaetigen.
  [ "$(count_fetch_calls "$KIT_DIR/adapter.js")" -gt 0 ]

  # NEGATIVTEST: die K5-Dateien enthalten kein eigenes fetch(.
  [ "$(count_fetch_calls "$KIT_DIR/panel-epic-canvas.js")" -eq 0 ]
  [ "$(count_fetch_calls "$KIT_DIR/canvas-store.js")" -eq 0 ]
}

@test "T002464 Der E1-Guard erfasst ALLE panel*.js, nicht nur panel.js" {
  # Der bestehende Guard (no-direct-fetch.bats) nennt panel.js und
  # cockpit-shell.html namentlich. Neue Panels fielen dadurch strukturell durch
  # das Netz — panel-epic-canvas.js lag mit zwei fetch()-Aufrufen im Branch,
  # ohne dass ein Test angeschlagen haette.
  #
  # POSITIV-ANKER: es gibt ueberhaupt mehr als eine panel*.js-Datei, sonst
  # prueft die Schleife unten nichts.
  local count
  count=$(find "$KIT_DIR" -maxdepth 1 -name 'panel*.js' | wc -l)
  [ "$count" -ge 2 ]

  local offenders=""
  while IFS= read -r f; do
    if [ "$(count_fetch_calls "$f")" -gt 0 ]; then
      offenders="${offenders} $(basename "$f")"
    fi
  done < <(find "$KIT_DIR" -maxdepth 1 -name 'panel*.js')

  [ -z "$offenders" ] || {
    echo "Panels mit direktem fetch(): ${offenders}" >&2
    false
  }
}

# ---------------------------------------------------------------------------
# Artefakte
# ---------------------------------------------------------------------------

@test "T002464 /health nennt den Checkout, aus dem der Daemon laeuft" {
  require_daemon || return 1

  # Ohne dieses Feld kann require_daemon nicht unterscheiden, ob der
  # antwortende Daemon den gerade gepruefen Code traegt — ein Daemon aus einem
  # fremden Worktree sieht sonst genauso aus wie der richtige.
  run curl -s "${BASE}/health"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"root"'

  # Und der genannte Pfad muss der dieses Checkouts sein. require_daemon haette
  # sonst bereits geskippt/gefailt — dieser Test haelt die Zusage fest.
  local expected
  expected="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd -P)"
  local reported
  reported="$(echo "$output" | sed -n 's/.*"root":"\([^"]*\)".*/\1/p')"
  reported="$(cd "$reported" && pwd -P)"
  [ "$reported" = "$expected" ]
}

@test "T002464 Alle K5-Kit-Dateien existieren" {
  for f in canvas-store.js panel-epic-canvas.js panel-epic-canvas.css panel-epic-canvas.html; do
    [ -f "$KIT_DIR/$f" ] || {
      echo "fehlt: .lavish/kit/$f" >&2
      false
    }
  done
}

@test "T002464 Der Canvas-Export schreibt nicht serverseitig (K4-Grenze)" {
  # POSITIV-ANKER: es gibt einen Export-Pfad im Panel.
  grep -q 'buildExportMarkdown' "$KIT_DIR/panel-epic-canvas.js"

  # Die Schreib-Endpunkte des Daemons sind bis K4 Stubs, und T002505 hat dem
  # Browser die Schreibrechte entzogen. Ein POST auf eine Export-Route waere
  # der Weg zurueck dahin — und laut OF1 der Datenvernichter.
  run grep -c "epics/export" "$KIT_DIR/panel-epic-canvas.js"
  [ "$status" -eq 1 ] || [ "$output" = "0" ]
}
