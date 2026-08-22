# Proposal: factory-model-lock

## Why

Es gibt heute keinen Ort, an dem verbindlich steht, welches Modell die Software Factory
benutzt. Der Name entsteht stattdessen aus einer Kette, deren Glieder einander still
ueberstimmen:

1. `tickets.factory_model_slots` (Phasen-Pin, Kandidat #0 in `route-provider.sh`)
2. `tickets.provider_config` (Prioritaetskette je source/tier)
3. der Emergency-Fallback in `route-provider.sh` (`FACTORY_MODEL_ID:-gemma26-throughput`)
4. `pipeline.mjs` (`FACTORY_MODEL_ID || 'gemma26-factory'`)
5. die Eskalationsleiter `flash -> haiku -> sonnet`, die ab dem zweiten Versuch auf ein
   Cloud-Modell wechselt

Die vier Defaults widersprechen einander bereits im Ruhezustand: `route-provider.sh` faellt
auf `gemma26-throughput` zurueck, `pipeline.mjs` auf `gemma26-factory`. Welcher gilt, haengt
davon ab, welcher Weg gerade genommen wird.

Dass ein falscher Name folgenlos bleibt, ist der eigentliche Schaden. `resolveModel()` im
Proxy biegt eine unbekannte Modell-ID still auf das erste gesunde Backend um. Deshalb blieb
zweimal unbemerkt, dass der Default auf ein totes Modell zeigte — T002582 (`gemma-4-12b`) und
T003538 (`gemma26-factory`, Loadout aktiviert, Backend nie geladen). In beiden Faellen wurde
die Anfrage beantwortet, nur von einem anderen Modell; bei Umleitung auf das Cloud-Backend
kam HTTP 402 zurueck und sah aus wie ein sporadischer Modellfehler.

## What

Das llm-proxy-Webinterface (`/admin`) bekommt eine Auswahl **Default-Factory-Modell** ueber
die aktivierten Loadouts, dazu einen Schalter **sperren**. Die Auswahl wird SSOT in
`scripts/llm/loadouts.json` unter dem neuen Top-Level-Block `factory` und fail-closed
validiert: ein Slug, den `loadouts` nicht fuehrt, laesst sich gar nicht erst speichern.
Damit ist die Klasse T002582/T003538 an der Wurzel geschlossen — nicht durch einen weiteren
Test auf tote Namen, sondern dadurch, dass ein toter Name nicht mehr eintragbar ist.

Bei `locked: true` benutzt die Factory ausschliesslich dieses Modell. Die Sperre greift an
allen drei Stellen, die einen Modellnamen bestimmen koennen, und schaltet die
Eskalationsleiter ab (D1): ein gesperrtes Modell bleibt auch beim dritten Versuch gesetzt.

Bei `locked: false` ist der Wert nur der Default anstelle der heutigen Hardcodes. Die
DB-Kette bleibt dann unveraendert wirksam.

Alle Leser sind fail-soft: ist der Proxy nicht erreichbar (CI, offline arbeitendes
dev-flow), gilt das bisherige Verhalten. Ein nicht laufender Proxy darf die Factory nicht
blockieren — genau diese Eigenschaft begruendet den bestehenden Opus-Zweig ohne DB-Lookup.

## Non-Goals

- Keine Aenderung an der DB-Routing-Kette selbst (`provider_config`, `factory_model_slots`,
  Slot-Claim, Cooldown). Sie wird im gesperrten Zustand uebersprungen, nicht umgebaut.
- Keine freie Modell-Eingabe im Webinterface (D2). Nur Loadout-Slugs sind waehlbar; die
  Moeglichkeit, die Factory dauerhaft auf ein Cloud-Modell zu sperren, entfaellt damit
  bewusst.
- Keine Aenderung an den bge-Rollen-Routen (`roles`-Block) oder am Loadout-Start/Stop.

_Ticket: T013144_
