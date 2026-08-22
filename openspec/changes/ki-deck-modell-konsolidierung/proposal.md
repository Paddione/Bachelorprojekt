# Proposal: ki-deck-modell-konsolidierung

## Why

Das KI-Deck des SDLC-Leitstands (`components/website/src/components/leitstand/decks/DeckKi.svelte`)
zeigt heute drei einander überlappende Modell-Oberflächen und lässt gleichzeitig die eine
Einstellung aus, die den Modellbetrieb tatsächlich steuert.

Beobachtet:

- **Zwei ähnliche Phase→Modell-Tabellen.** `KiRoutingPanel` schreibt `tickets.provider_config`
  (sechs Phasen über ein `source`-Mapping), `FactoryModelSlots` schreibt
  `tickets.factory_model_slots` (fünf Phasen). Beide sehen gleich aus, meinen aber Verschiedenes.
  Eine dritte, lesende Darstellung derselben fünf Phasen steckt als Block
  „Effektive Auflösung pro Phase" im `LlmProxyPanel`.
- **Nur eine der beiden Tabellen wird gelesen.** `tickets.provider_config` ist der einzige Store,
  aus dem Runtime-Code auflöst (`lib/provider-config.ts` → Assistant, Ticket-Triage,
  Coaching-Classifier, Session-Agenten). `tickets.factory_model_slots` liest außerhalb der eigenen
  UI kein Runtime-Pfad; einziger weiterer Leser ist `scripts/llm/routing-check.sh`. Wer dort ein
  Modell setzt, ändert am Verhalten nichts — die Oberfläche verspricht eine Wirkung, die es nicht
  gibt.
- **Der Modell-Katalog kennt den Proxy nicht.** Die Dropdowns werden aus `provider_config`
  gefüllt. Welche Modelle der llm-proxy gerade wirklich anbietet, steht in
  `/sdlc/api/llm-proxy/status` → `backends[].models` und fließt nirgends in die Auswahl ein.
- **Der Factory-Default ist im Cockpit unerreichbar.** Er lebt in `scripts/llm/loadouts.json`
  (`factory.model`) und wird über `GET/PUT /admin/factory` am llm-proxy verwaltet
  (`scripts/llm-proxy/server.mjs:600-623`), gelesen von `scripts/factory/lib.sh:136` beim
  Modell-Pin jedes Factory-Laufs. Die Website hat dafür weder Endpunkt noch Oberfläche.
- **Die Sektion „KI-Konfiguration" am Fuß des Decks lädt nicht.** Sie lädt vier Endpunkte in
  einem `$effect`, dessen geschriebene Zustände er selbst als Abhängigkeit trackt; ein einziger
  nicht-OK Response verwirft alle vier Datentöpfe hinter einem generischen „Laden fehlgeschlagen".
  `/sdlc/api/ki/env-status` probt dabei bei jedem Request LM-Studio und Ollama mit je 1 s Timeout.
  Inhaltlich zeigt sie ohnehin dieselben `provider_config`-Daten wie `KiRoutingPanel` ein zweites
  Mal.
- **Das Session-Modell folgt nichts.** `DEFAULT_CLAUDE_SESSION_MODEL` ist ein hart notiertes
  Modell; die Auflösungskette in `pages/api/admin/coaching/sessions/[id]/complete.ts:50` fällt über
  eine Umgebungsvariable darauf zurück. Eine Session kann damit auf einem anderen Modell laufen als
  alles andere im System, ohne dass das irgendwo sichtbar wird.

## What

Das KI-Deck bekommt **eine** Phase→Modell-Tabelle, und der Factory-Default wird darin gesetzt.

1. **Eine Tabelle.** `tickets.provider_config` bleibt die Quelle der Phase→Modell-Zuordnung, weil
   sie die einzige ist, aus der Runtime-Code auflöst. Das Panel `FactoryModelSlots` und die Tabelle
   `tickets.factory_model_slots` entfallen; `scripts/llm/routing-check.sh` prüft künftig
   `provider_config` als einzige DB-Quelle.
2. **Der Factory-Default steht in derselben Tabelle.** Eine neue Route
   `/sdlc/api/llm-proxy/factory` reicht `GET/PUT /admin/factory` des Proxy durch — mitsamt dem
   `mtimeMs`-Vergleich, mit dem der Proxy konkurrierende Schreibzugriffe abweist. Ein `409` des
   Proxy erreicht die Oberfläche als solcher und wird nicht in einen generischen Fehler übersetzt.
   Im Deck erscheint der Default als Kopfzeile der Tabelle; ist der Proxy offline, ist die Zeile
   lesend und sagt das, statt leer zu wirken.
3. **Der Katalog kennt den Proxy.** Die Auswahl entsteht aus der Vereinigung der vom Proxy
   entdeckten Modelle mit den konfigurierten `provider_config`-Einträgen. Ein konfiguriertes
   Modell, das kein erreichbares Backend bedient, bleibt sichtbar und wird als nicht verfügbar
   markiert — es verschwindet nicht still aus der Auswahl, weil sonst eine gesetzte Zuordnung
   gelöscht aussieht, obwohl sie in der DB steht.
4. **Die effektive Auflösung wird Spalte statt eigener Block.** Die Tabelle stellt neben die
   konfigurierte Zuordnung, was der Proxy für diese Phase gerade liefern würde. Der separate Block
   im `LlmProxyPanel` entfällt; danach existiert im Deck genau eine Phasen-Darstellung.
5. **„KI-Konfiguration" verschwindet.** `KiKonfiguration` wird aus dem Deck entfernt. Der Redirect
   `/sdlc/ki-konfiguration` → `/sdlc/cockpit?deck=ki` bleibt, weil das Deck weiterbesteht. Die
   Embeddings-Einstellung, die dort als einzige nirgends sonst vorkommt, bleibt über ihren
   Endpunkt erhalten und wird nicht mitentfernt.
6. **Das Session-Modell erbt den Factory-Default.** Sessions lösen `factory.model` auf, statt ein
   eigenes Modell zu führen. `DEFAULT_CLAUDE_SESSION_MODEL` bleibt ausschließlich als letzter
   Notnagel für den Fall, dass der Proxy nichts liefert.

### Nicht Teil dieser Änderung

- Das Routing-Modell selbst (Prioritätsketten, Tiers, Cooldown in `tickets.provider_health`)
  bleibt unverändert; nur die Oberfläche darüber wird zusammengezogen.
- `tickets.provider_config` als Store für Coaching-Provider (`source='coaching'`) bleibt bestehen.
- Die Backend-Verwaltung des Proxy (`tickets.llm_proxy_backends`, Health, Probe) bleibt, wie sie
  ist.

_Ticket: T013302_
