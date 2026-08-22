# Design: factory-model-lock

## Goals

- Genau **ein** Ort bestimmt das Factory-Modell, und dieser Ort ist im Webinterface bedienbar.
- Ein nicht existierender Modellname ist **nicht speicherbar**, statt still umgeleitet zu werden.
- `locked: true` heisst woertlich: jeder Factory-Aufruf, jeder Tier, jeder Versuch nimmt dieses
  Modell.

## Non-Goals

- Die DB-Routing-Kette umbauen. Sie bleibt unveraendert und greift, sobald nicht gesperrt ist.
- Cloud-Modelle waehlbar machen.

## Decisions

### D1 — Die Sperre schaltet die Eskalationsleiter ab

`locked: true` uebersteuert `args.model_tier` in `pipeline.mjs` und liefert in
`route-provider.sh` fuer **jeden** Tier (inkl. `opus`) das gesperrte Modell.

**Trade-off, ausdruecklich akzeptiert:** die Leiter `flash -> haiku -> sonnet` ist heute das
Sicherheitsnetz fuer Tickets, an denen das lokale Modell scheitert — der zweite Versuch hebt
auf DeepSeek an. Im gesperrten Zustand scheitert ein solches Ticket dauerhaft, statt in die
Cloud auszuweichen. Das ist die Bedeutung von "gesperrt"; eine Sperre, die sich beim zweiten
Fehlschlag selbst aufhebt, waere keine. Wer die Leiter braucht, entsperrt — ein Klick im
selben Webinterface.

### D2 — Nur Loadout-Slugs sind waehlbar

Die Auswahlliste kommt aus `doc.loadouts` und die Validierung prueft die Existenz des Slugs
fail-closed, in derselben Funktion, die `roles.*.chain` bereits so prueft.

**Warum das der Kern des Tickets ist:** T002582 und T003538 sind nicht daran gescheitert, dass
jemand den falschen Namen waehlte, sondern daran, dass ein falscher Name **folgenlos** blieb.
Ein Freitextfeld haette dieselbe Luecke wieder geoeffnet. Der Preis ist, dass sich die Factory
nicht per Webinterface auf `deepseek-chat` sperren laesst; dafuer bleibt die DB-Kette im
entsperrten Zustand.

### D3 — SSOT ist loadouts.json, nicht die Datenbank

Der Block sitzt in `scripts/llm/loadouts.json`, weil dort bereits steht, welche Modelle es
gibt. Ein Existenz-Check gegen eine Liste in derselben Datei ist ein Vergleich, kein Netzaufruf.

Der zweite Grund ist Verfuegbarkeit: `route-provider.sh` hat einen ausdruecklich
dokumentierten Zweig (`opus`), der **ohne Cluster** routen muss, weil `factory_psql` ueber
`kubectl exec` geht. Laege die Sperre in der DB, waere sie genau dann nicht lesbar, wenn sie
am noetigsten ist.

### D4 — Datei schlaegt Env schlaegt Default

Rangfolge fuer den Modellnamen:

1. `factory.model` aus `loadouts.json` (ueber `GET /admin/factory`)
2. `FACTORY_MODEL_ID` (bestehendes Verhalten)
3. der eingebaute Default des jeweiligen Skripts

Das ersetzt die bestehende Entscheidung in `openspec/specs/software-factory.md`
("The model id SHALL be read from the environment variable `FACTORY_MODEL_ID`") **nicht**,
sondern setzt eine Stufe darueber — deshalb ein `MODIFIED`-Delta auf dieses Requirement und
kein zweites, danebenstehendes. Die Env-Variable bleibt der Weg fuer Aufrufer ohne Proxy
(CI, Einmallauf mit abweichendem Modell).

### D5 — Ein Leser, nicht drei

Die HTTP-Abfrage steht **einmal** in `scripts/factory/lib.sh` als `factory_model_pin`, nicht
je einmal in `route-provider.sh`, `dispatcher-bridge.sh` und `provider-register-local.sh`.
Drei Kopien einer Regel laufen auseinander — genau der Zustand, den T002616 fuer die
Konfliktregel und T003204 fuer `enabled` bereits einmal aufloesen musste.

Der Leser ist fail-soft mit hartem Timeout (`curl -s -m 2`): kein laufender Proxy heisst
"keine Sperre", nicht "Abbruch". Ein Gate, das die Factory anhaelt, weil ein Webinterface
nicht laeuft, waere eine neue Ausfallquelle fuer ein Bedienkomfort-Feature.

### D6 — `pipeline.mjs` liest nicht selbst

Die Workflow-Sandbox von `pipeline.mjs` hat keinen verlaesslichen Netzzugriff und darf keinen
brauchen. Stattdessen setzt `dispatcher-bridge.sh` — das den Pipeline-Lauf ohnehin startet —
`FACTORY_MODEL_ID` und `FACTORY_MODEL_LOCKED` in die Umgebung des `claude -p`-Prozesses.
`pipeline.mjs` liest nur `process.env`, so wie heute schon.

## Risiken

- **R1:** Ein gesperrtes Loadout ist aktiviert, sein Backend aber nicht geladen — genau der
  Zustand aus T003538. Der Existenz-Check gegen `loadouts` faengt das **nicht**, weil
  "aktiviert" und "geladen" verschiedene Dinge sind. Abmilderung: das Webinterface zeigt den
  Laufzustand aus `/admin/loadouts/status` neben der Auswahl an, damit die Sperre nicht blind
  auf ein kaltes Backend gesetzt wird. Eine harte Startpflicht waere falsch — man will ein
  Modell sperren koennen, bevor man es startet.
- **R2:** Der Emergency-Fallback in `route-provider.sh` meldet heute auf stderr, dass alle
  Kandidaten belegt sind. Im gesperrten Zustand wird dieser Pfad nie erreicht, weil die Sperre
  vor der Kandidatenschleife greift — die Meldung "alle belegt" entfaellt damit, obwohl
  Ueberlast weiterhin moeglich ist. Deshalb protokolliert der Sperrzweig seinerseits eine
  Zeile auf stderr, statt stumm zu antworten.
