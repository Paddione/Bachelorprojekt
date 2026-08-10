# Proposal: llm-proxy-dispatch-capture

## Why

Wenn ein lokaler Subagent etwas Falsches tut, lässt sich heute nicht rekonstruieren, **was er
gefragt wurde und was er geantwortet hat**. Die vorhandenen Werkzeuge beantworten nur die Frage
„was läuft gerade": `agent-lock.sh list` zeigt Claims, `factory_phase_events` hält ein
strukturiertes `detail` fest (`{executor, subagent, partial, duration_s, exit}`), und die
llama.cpp-`/metrics` liefern Durchsatzzahlen. Keine dieser Quellen enthält den Prompt oder die
Antwort. Für die Fehlersuche an Dispatches — der häufigste Anlass, überhaupt hinzusehen — fehlt
damit genau die Information, um die es geht.

Der lokale LLM-Proxy (`scripts/llm-proxy/server.mjs`, Port 18235) ist laut
`openspec/specs/local-llm-proxy.md` das **alleinige** Gateway zwischen jedem lokalen Harness und
den llama.cpp-Backends. Er ist damit der einzige Ort, an dem sich alle Dispatches erfassen lassen
— auch die, die nicht über den Factory-Orchestrator laufen (tab-selected opencode-Arbeit, manuelle
Aufrufe). Ein Mitschnitt im Orchestrator-Prompt hätte diese Lücke behalten und zusätzlich
Orchestrator-Kontext für Buchführung verbraucht.

Der Spec des Proxys enthält bislang **kein** Requirement zu Request-Logging. Es wird hier also
keine frühere Entscheidung umgekehrt, sondern eine offene Stelle geschlossen.

## What

Der Proxy schneidet jeden `/v1/*`-POST mit und schreibt ihn in eine neue Tabelle
`tickets.llm_proxy_request_log`. Das SDLC-Cockpit zeigt die Mitschnitte als Live-Panel: eine per
SSE nachwachsende Liste, ein Klick öffnet den Detail-Drawer mit vollem Prompt und voller Antwort.

Die Erfassung ist **rückwirkungsfrei** gebaut. Der Schreibvorgang wird nie abgewartet; fällt die
Datenbank aus, verliert der Proxy Mitschnitte und sonst nichts. Streamende Antworten werden über
einen passiven Tap gesammelt, dessen Fehler den Transport nicht berühren — ein Punkt, an dem das
Repo unter T002609 schon einmal bewusst nicht eingegriffen hat, weil die Queue serialisiert läuft
und ein Fehler dort jeden wartenden Request mitrisse.

Damit ein Mitschnitt einem Vorgang zuzuordnen ist, setzt der Factory-Dispatch-Pfad drei
Korrelations-Header (`x-slot-id`, `x-dispatch-ticket`, `x-dispatch-partial`). Fehlen sie, bleiben
die Felder leer und das Panel zeigt einen Strich — keine geratene Zuordnung. Als Nebeneffekt wird
`x-slot-id` erstmals überhaupt gesetzt: der Proxy liest ihn in `extractSlotId()` seit T002483 aus,
aber kein Aufrufer sendet ihn, wodurch die Per-Slot-Queue-Isolation in `slot-queue.mjs` heute
immer auf den Sammelschlüssel `backend.name` zurückfällt.

## Non-Goals

- **Keine Volltextsuche, keine Trend-Diagramme, kein Export.** Liste plus Detail-Drawer deckt den
  Anlass ab; alles Weitere wartet auf belegten Bedarf.
- **Keine Redaction.** Prompts können Secrets enthalten, wenn ein Agent eine `.env` gelesen hat.
  Das Cockpit ist admin-only und development-only, die Daten verlassen die lokale Maschine nicht.
  Bewusst offengelegte Annahme, nicht übersehen.
- **Keine Sanierung der übrigen Cockpit-Panels.** Die Anbindung weiterer Panels an `agent-lock`,
  `agent-msg`, `factory:status` und die llama.cpp-`/metrics` ist ein eigener Vorgang und braucht
  zuerst eine **gemessene** Liste der Panels, die heute tote oder ersatzwertige Daten zeigen.
- **Keine Behebung der Nebenbefunde.** `GET /healthz` antwortet `not_found`, obwohl der Spec dort
  HTTP 200 verlangt; `tests/spec/local-llm-proxy.bats:452` prüft per `grep` auf den Quelltext statt
  auf Kommando-Output (widerspricht T002448-M4). Beides ist gemeldet, nicht Teil dieses Vorgangs.

_Ticket: T003277_
