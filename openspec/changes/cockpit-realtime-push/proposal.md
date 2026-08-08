# Proposal: cockpit-realtime-push

## Why

Das SDLC-Cockpit zeigt seinen Zustand heute über Polling: jedes Panel trägt
`data-refresh-interval="30000"`, der Adapter startet pro Quelle ein `setInterval`.
Ein Ticketwechsel, ein Factory-Tick oder ein Phasenübergang wird dadurch im
schlechtesten Fall 30 Sekunden nach dem Ereignis sichtbar — und in der
Zwischenzeit laufen Abfragen, die nichts Neues finden.

Die Ursache ist keine Nachlässigkeit, sondern eine Design-Entscheidung, die ihren
Anlass verloren hat. `D10` der SSOT-Spec schreibt Polling ausdrücklich vor
(`refreshMs` je Adapter-Methode). Sie stammt aus der K1-Phase, in der die
Belegartefakte per `file://` ohne Build und ohne Server öffnen mussten. In diesem
Kontext war ein Poll die einzige Möglichkeit. Das Cockpit wird heute von der
Website ausgeliefert, mit Admin-Session und laufender Postgres-Verbindung — die
Voraussetzung, unter der `D10` richtig war, gilt dort nicht mehr.

Die Realtime-Bausteine existieren bereits, nur an der falschen Stelle:

- Der Cockpit-Daemon hat vollwertiges SSE mit `EventBuffer`, `Last-Event-ID` und
  Gap-Markern (`.lavish/kit/daemon/routes/stream.ts`). Im Adapter sind genau
  diese beiden Streams als `daemonOnly: true` markiert und liefern im
  Admin-Kontext die Meldung `Quelle in diesem Kontext nicht verfügbar`.
- `website/src/pages/sdlc/api/factory-floor/stream.ts` ist echtes SSE zum
  Browser — pollt aber serverseitig die Datenbank alle fünf Sekunden
  (`STREAM_POLL_MS`). Der Poll ist damit nicht beseitigt, sondern verlegt.

Dazu kommt ein Blocker, der vor jedem Realtime-Umbau steht: Der
Build-Target-Split (T002624) hat die SDLC-Routen nach `website/src/pages/sdlc/`
verschoben. `.lavish/kit/adapter.js` zeigt unverändert auf die alten Pfade
(`/api/admin/cockpit/portfolio`, `/api/admin/factory-control`, …). Diese Routen
existieren auf `main` nicht mehr. Jeder Panel-Fetch läuft heute in einen 404,
den der Adapter pflichtgemäß als „Quelle nicht erreichbar" anzeigt — das Cockpit
ist in diesem Punkt bereits ausgefallen, unabhängig vom Poll-Intervall.

Bei den Aktionen klafft dieselbe Art Lücke. Unter `sdlc/api/cockpit/` liegen
sieben POST-Endpunkte; der Adapter exponiert davon **einen** (`ticket-status` als
`ticketAction`). `feature-action`, `feature-actions`, `batch`, `reorder`,
`reparent` und `suggest` sind gebaut, getestet und vom Cockpit aus nicht
erreichbar. Die häufigen SDLC-Handgriffe — Factory-Tick, Ticket enqueuen, Plan
freigeben, Flux-Reconcile — laufen weiterhin ausschließlich über die
Kommandozeile, obwohl das Cockpit die Oberfläche dafür wäre.

## What

Der Change stellt den Cockpit-Datenfluss von Abfrage auf Benachrichtigung um und
macht die vorhandenen SDLC-Aktionen bedienbar.

**Ereignisquelle: PostgreSQL LISTEN/NOTIFY.** Trigger auf den Tabellen, die den
Cockpit-Zustand tragen (`tickets.factory_phase_events`, `tickets.cockpit_audit`,
Ticket-Statuswechsel), lösen `pg_notify` mit einem schlanken Nutzdatensatz aus.
Ein dedizierter, langlebiger Client hält `LISTEN` und verteilt eingehende
Benachrichtigungen an die verbundenen Cockpit-Sitzungen. Damit entfällt sowohl
der Client-Poll als auch der serverseitige Poll — das Ereignis wandert von der
Schreiboperation bis zum Panel, ohne dass jemand fragt.

**Transport: Website-API.** Eine neue Route `sdlc/api/cockpit/stream` liefert die
Ereignisse per SSE, authentifiziert über die Admin-Session, nach dem Muster von
`factory-floor/stream.ts`. Die Daemon-Streams werden gespiegelt statt ersetzt:
Der Daemon bleibt für Quellen zuständig, die nur lokal existieren (Agent-Locks,
opencode-Sitzungen) und die die Website nicht sehen kann.

**Adapter-Vertrag bleibt unangetastet.** `panel.js` bezieht Daten über
`window.data[source]()` und `handle.subscribe(fn)`. Ob dahinter ein Intervall
oder ein `EventSource` liegt, ist für das Panel nicht sichtbar. Die
Poll-Implementierung wird innen durch eine Push-Implementierung ersetzt, die
Signatur bleibt — die Spec-Anforderung „Adapter-Vertragstreue (E1)" wird dadurch
erfüllt, nicht verletzt. Ergänzend wird der eigene Refresh-Timer in `panel.js`
für push-versorgte Quellen stillgelegt, damit nicht Stream und Poll
nebeneinander laufen.

**Bewusst gepollte Restmenge.** Pod-Zustände (kubectl), CI-Läufe (GitHub) und
Modell-Gesundheit (Ollama) haben keine Postgres-Quelle und können kein `NOTIFY`
senden. Sie bleiben gepollt. Der Change dokumentiert das als benannte Restmenge
mit Begründung, statt eine Vollständigkeit zu behaupten, die nicht besteht.

**Aktionen.** Die sechs vorhandenen, aber nicht exponierten POST-Endpunkte
werden über den Adapter erreichbar. Dazu kommen Factory-Steuerung (Tick,
Enqueue, Slot-Freigabe), Deploy und CI (Flux-Reconcile, CI-Rerun) sowie der
Ticket-Lebenszyklus (Plan stagen, `release-hold`, schließen). Jede Aktion wird in
`action-policy.js` nach Umkehrbarkeit eingeordnet — nicht klassifizierte Aktionen
gelten weiterhin als nicht umkehrbar und erzwingen die Rückfrage mit benanntem
Ziel (`D5`). Jede Ausführung wird in `tickets.cockpit_audit` protokolliert.

**Erreichbarkeit wird belegt, nicht behauptet.** Der Change liefert eine
Aktions-Inventur, die jede Aktion mit Endpunkt, Klassifikation und
Audit-Verhalten aufführt. Ein Test führt die Aktionen aus und prüft das
Ergebnis — eine Liste im Dokument allein wäre keine Erreichbarkeit.

**Nachlauf.** Der Kopf des Cockpits zeigt `● Fixtures (K1)`, obwohl der Adapter
seit K4 Livedaten liefert. Die Anzeige wird an den tatsächlichen Zustand
gebunden.

### Nicht Teil dieses Changes

- Kein Produktions-Cockpit. Das Cockpit ist Development-only (T002624); alle
  Routen bleiben im SDLC-Build-Target.
- Kein Umbau der Daemon-Streams. Sie werden gespiegelt, nicht abgelöst.
- Keine Migration der daemon-lokalen Quellen (Agent-Locks, opencode-Sitzungen)
  in die Datenbank.

_Ticket: T002643_
