---
title: "ki-deck-modell-konsolidierung — Implementation Plan"
ticket_id: T013302
domains: [website, llm-proxy, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ki-deck-modell-konsolidierung — Implementation Plan

_Ticket: T013302_

Das KI-Deck bekommt eine einzige Phase→Modell-Tabelle, in der auch der Factory-Default gesetzt
wird. Die Auswahl kennt die Modelle des llm-proxy. Die doppelte Slot-Oberfläche und die Sektion
„KI-Konfiguration" verschwinden, und Sessions erben den Factory-Default.

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `components/website/src/lib/sdlc/llm-proxy-factory.ts` | neu | 900 |
| `components/website/src/pages/sdlc/api/llm-proxy/factory.ts` | neu | 900 |
| `components/website/src/lib/sdlc/model-catalog.ts` | neu | 900 |
| `components/website/src/components/sdlc/factory/KiRoutingPanel.svelte` | 269 | 831 |
| `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte` | 200 | 900 |
| `components/website/src/components/leitstand/decks/DeckKi.svelte` | 48 | 1052 |
| `components/website/src/lib/claude-session-agent.ts` | 127 | 773 |
| `components/website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` | 65 | 835 |
| `components/website/src/lib/tickets-schema.ts` | 34 | von S1 nicht gemessen |
| `components/website/src/lib/sdlc/leitstand-purpose-registry.ts` | 66 | 834 |
| `scripts/llm/routing-check.sh` | 69 | 731 |
| `tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats` | neu | 500 |
| `components/website/src/pages/sdlc/api/llm-proxy/factory.test.ts` | neu | 900 |
| `components/website/src/lib/sdlc/__tests__/model-catalog.test.ts` | neu | 900 |
| `components/website/src/lib/claude-session-agent.test.ts` | 136 | 764 |
| `components/website/src/data/test-inventory.json` | generiert | — |

Ersatzlos entfernt (keine Budgets, da gelöscht):

```
components/website/src/components/sdlc/factory/FactoryModelSlots.svelte
components/website/src/components/admin/KiKonfiguration.svelte
components/website/src/components/admin/KiCard.svelte
components/website/src/components/admin/KiCoachingDrawer.svelte
components/website/src/lib/sdlc/factory-model-slots.ts
components/website/src/pages/sdlc/api/factory-model-slots.ts
components/website/src/lib/tickets/tables/factory-model-slots.ts
components/website/src/lib/__tests__/factory-model-slots.test.ts
```

`KiProviderDrawer.svelte` bleibt — `KiRoutingPanel` nutzt es weiterhin.

## Partials

| Partial | Rolle | Dateien |
| --- | --- | --- |
| p1 | tests-rot | `tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats`, `components/website/src/pages/sdlc/api/llm-proxy/factory.test.ts`, `components/website/src/lib/sdlc/__tests__/model-catalog.test.ts`, `components/website/src/lib/claude-session-agent.test.ts` |
| p2 | backend-factory-default | `components/website/src/lib/sdlc/llm-proxy-factory.ts`, `components/website/src/pages/sdlc/api/llm-proxy/factory.ts` |
| p3 | backend-katalog | `components/website/src/lib/sdlc/model-catalog.ts` |
| p4 | ui-eine-tabelle | `components/website/src/components/sdlc/factory/KiRoutingPanel.svelte`, `components/website/src/components/sdlc/factory/LlmProxyPanel.svelte`, `components/website/src/components/leitstand/decks/DeckKi.svelte` |
| p5 | entfernung | die acht oben gelisteten Löschungen, `components/website/src/lib/tickets-schema.ts`, `components/website/src/lib/sdlc/leitstand-purpose-registry.ts`, `scripts/llm/routing-check.sh` |
| p6 | session-modell | `components/website/src/lib/claude-session-agent.ts`, `components/website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` |
| p7 | verify | `components/website/src/data/test-inventory.json` |

Kein Pfad liegt in zwei Partials. `DeckKi.svelte` gehört ausschließlich zu p4 — auch das Entfernen
des `KiKonfiguration`- und des `FactoryModelSlots`-Imports geschieht dort, damit p5 reine
Löschungen bleibt.

## Tasks

### Task 1 (p1) — Rot: die Zusicherungen schreiben, bevor es sie gibt

Die Tests prüfen den beobachtbaren Zustand (Kommandoausgabe, Antwortkörper, Datei-Existenz),
nicht die Implementierungsquelle.

- [ ] `tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats` anlegen mit drei Zusicherungen:
      (a) `FactoryModelSlots.svelte` existiert nicht mehr; (b) kein getrackter Pfad unter
      `components/website/src` und `scripts/` nennt `factory_model_slots`; (c) `DeckKi.svelte`
      mountet `KiKonfiguration` nicht mehr. Jede Zusicherung mit Positiv-Anker: erst prüfen, dass
      die Suche überhaupt Treffer produzieren *kann* (Trefferzahl über dem Deck > 0), dann die
      eigentliche Behauptung — sonst ist ein leeres Suchergebnis nicht von „Guard greift" zu
      unterscheiden.
- [ ] `components/website/src/pages/sdlc/api/llm-proxy/factory.test.ts` anlegen: GET liefert
      `model`, `locked`, `mtimeMs` und `selectable` durch; PUT reicht `mtimeMs` weiter; ein `409`
      des Proxy erreicht den Aufrufer als Konflikt mit eigenem Fehlerschlüssel und nicht als
      generischer 500; ohne Admin-Session antwortet die Route 401 bzw. 403.
- [ ] `components/website/src/lib/sdlc/__tests__/model-catalog.test.ts` anlegen: die Vereinigung
      dedupliziert Modelle, die Proxy und DB beide nennen; ein nur vom Proxy gemeldetes Modell ist
      enthalten; ein konfiguriertes Modell ohne erreichbares Backend bleibt enthalten und trägt die
      Markierung „nicht verfügbar"; bei nicht erreichbarem Proxy bleibt die DB-Menge vollständig
      erhalten statt leer zu sein.
- [ ] `components/website/src/lib/claude-session-agent.test.ts` erweitern: die Auflösung liefert
      den Factory-Default; ändert sich der Default, ändert sich das aufgelöste Modell mit;
      `DEFAULT_CLAUDE_SESSION_MODEL` wird nur erreicht, wenn gar kein Wert zu holen ist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats
cd components/website && pnpm vitest run src/pages/sdlc/api/llm-proxy/factory.test.ts src/lib/sdlc/__tests__/model-catalog.test.ts src/lib/claude-session-agent.test.ts
# expected: FAIL — weder Route, Katalog-Modul noch die Session-Auflösung existieren zu diesem Zeitpunkt
```

### Task 2 (p2) — Der Factory-Default wird durchgereicht

- [ ] `lib/sdlc/llm-proxy-factory.ts`: `readFactoryDefault()` und `writeFactoryDefault()` gegen
      `${LLM_PROXY_URL ?? 'http://127.0.0.1:18235'}/admin/factory`, mit demselben Abort-Timeout-
      Muster wie `pages/sdlc/api/llm-proxy/status.ts`. Der `mtimeMs`-Wert wird unverändert in
      beide Richtungen durchgereicht. Antwortet der Proxy `409`, gibt die Funktion einen
      unterscheidbaren Konflikt zurück, keinen generischen Fehler — der Aufrufer muss „jemand
      anderes hat geschrieben" von „Proxy kaputt" trennen können. Vollständig typisiert, kein
      `any` (CQ02-Ist: 0, darf nicht steigen).
- [ ] `pages/sdlc/api/llm-proxy/factory.ts`: GET/PUT unter demselben `getSession`/`isAdmin`-Guard
      wie die übrigen `llm-proxy`-Routen, `prerender = false`. Der Konflikt wird als eigener
      HTTP-409 mit benanntem Fehlerschlüssel weitergegeben. Ist der Proxy nicht erreichbar,
      antwortet GET mit einem Körper, der das ausdrücklich sagt, statt einen leeren Default
      vorzutäuschen.

### Task 3 (p3) — Der Katalog kennt den Proxy

- [ ] `lib/sdlc/model-catalog.ts`: `resolveModelCatalog()` bildet die Vereinigung aus den vom
      Proxy entdeckten Modellen (`backends[].models`) und den aktivierten `provider_config`-Zeilen,
      dedupliziert über Provider und Modell-Id und markiert jeden Eintrag mit seiner Verfügbarkeit.
      Ein konfiguriertes Modell ohne erreichbares Backend bleibt in der Liste und wird als nicht
      verfügbar markiert — es darf nicht herausfallen, weil eine gesetzte Zuordnung sonst gelöscht
      aussieht, obwohl sie in der DB steht. Ist der Proxy offline, bleibt die DB-Menge vollständig
      und die Verfügbarkeit ist unbekannt, nicht „nein".
- [ ] Die effektive Auflösung pro Phase wird hier mitberechnet, damit p4 sie nur noch anzeigt:
      zu jeder Phase die konfigurierte Zuordnung und das, was der Proxy für sie gerade liefern
      würde. Reine Berechnung ohne Rück-Import auf UI-Module (S2).

### Task 4 (p4) — Eine Tabelle im Deck

- [ ] `KiRoutingPanel.svelte`: Kopfzeile „Standard / Alle Phasen" für den Factory-Default über der
      Phasenliste, gespeist aus `/sdlc/api/llm-proxy/factory`. Ist der Proxy offline, ist die Zeile
      lesend und benennt das; ein `409` beim Speichern erscheint als Hinweis, dass der Wert
      anderswo geändert wurde, mit der Möglichkeit, neu zu laden. Die Modellauswahl kommt aus
      `resolveModelCatalog()`; nicht verfügbare Modelle bleiben wählbar dargestellt und sind als
      nicht verfügbar markiert. Neue Spalte „liefert derzeit" neben der konfigurierten Zuordnung.
- [ ] `LlmProxyPanel.svelte`: den Block „Effektive Auflösung pro Phase" samt `resolvePhase()` und
      dem `factory-model-slots`-Fetch entfernen. Der Rest des Panels (Backends, Health, Probe)
      bleibt unverändert.
- [ ] `DeckKi.svelte`: Import und Mount von `FactoryModelSlots` und `KiKonfiguration` entfernen,
      samt der zugehörigen `<h3>`-Zwischenüberschriften. Übrig bleiben LLM-Proxy, KI-Routing,
      Dispatch-Mitschnitt und Insights.

### Task 5 (p5) — Die tote Tabelle und die doppelte Sektion entfernen

- [ ] Die acht in der File Structure gelisteten Dateien löschen.
- [ ] `lib/tickets-schema.ts`: Import und Aufruf von `applyFactoryModelSlotsSchema` entfernen.
- [ ] `scripts/llm/routing-check.sh`: die `factory_model_slots`-Abfrage entfernen;
      `tickets.provider_config` bleibt die einzige DB-Quelle. Die Abdeckung der
      Factory-Umgebungsdatei bleibt unangetastet — das zugehörige Requirement verlangt beide
      Quellen, und nur die DB-Seite schrumpft auf eine Tabelle.
- [ ] `lib/sdlc/leitstand-purpose-registry.ts`: den Registry-Eintrag des KI-Decks so anpassen, dass
      er die verbliebenen Module nennt. Der Anchor-Guard vergleicht Registry und `data-purpose-id`
      im Markup — bleibt hier ein Name stehen, den es nicht mehr gibt, schlägt er fehl.
- [ ] Die Tabelle `tickets.factory_model_slots` selbst wird **nicht** per Migration gelöscht. Sie
      trägt gesetzte Werte, die nach dem Merge niemand mehr liest; ein DROP ist unumkehrbar und
      gehört nicht in dieselbe Änderung wie der UI-Umbau. Der Code hört auf, sie zu lesen und zu
      schreiben; über ihre Entsorgung wird getrennt entschieden.

> Die Embeddings-Einstellung verliert mit `KiKonfiguration` ihre einzige Oberfläche. Der Endpunkt
> `/sdlc/api/ki/embeddings` bleibt bestehen und funktionsfähig; wer die Werte ändern will, tut das
> bis auf Weiteres über den Endpunkt. Das ist die bewusst in Kauf genommene Folge der vollständigen
> Entfernung der Sektion, keine Auslassung.

### Task 6 (p6) — Sessions erben den Factory-Default

- [ ] `lib/claude-session-agent.ts`: die Modellwahl über den Factory-Default auflösen statt über
      `DEFAULT_CLAUDE_SESSION_MODEL`. Die Konstante bleibt als letzter Rückfall bestehen und wird
      nur erreicht, wenn kein Wert zu holen ist; dieser Fall wird protokolliert, damit er nicht
      unbemerkt zur Regel wird.
- [ ] `pages/api/admin/coaching/sessions/[id]/complete.ts`: die Kette auf denselben Weg umstellen.
      `COACHING_SESSION_MODEL` verliert seinen Platz vor der Konstante; wo die Variable gesetzt
      war, folgt die Session künftig dem Default.

### Task 7 (p7) — Verifikation

- [ ] Die in Task 1 geschriebenen Tests laufen jetzt grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats
cd components/website && pnpm vitest run src/pages/sdlc/api/llm-proxy/factory.test.ts src/lib/sdlc/__tests__/model-catalog.test.ts src/lib/claude-session-agent.test.ts
```

- [ ] Test-Inventar regenerieren und mitcommitten:

```bash
task test:inventory
```

- [ ] Die `any`-Zahl darf nicht steigen (Ist vor der Änderung: 0):

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

- [ ] Die drei verbindlichen Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Nachtrag (Ausführung, 2026-08-22)

Während der Ausführung gefundene Plan-Lücken, die dieser Change zusätzlich abdeckt:

- `scripts/factory/route-provider.sh`: der Phasen-Pin las `tickets.factory_model_slots`
  als Kandidat #0 — der Block ist ersatzlos entfernt (D1 folgt: provider_config ist die
  einzige DB-Quelle). `ROUTE_SKIP_PINNED` entfällt mit dem Pin.
- `scripts/factory/provider-register-local.sh`: schrieb Phasen-Zeilen in die Slot-Tabelle;
  der zweite INSERT ist entfernt.
- `scripts/factory/provider-register-gptoss.sh`, `scripts/llm/start-gemma-server.ps1`,
  `start-gptoss-server.ps1`, `scripts/sdlc/migrate-tickets.sh`: Kommentare nennen nicht
  mehr die entfernte Tabelle.
- Neu `openspec/changes/.../specs/software-factory.md` (Delta): MODIFIED
  "Bonsai Provider Registration" und "A locked factory model overrides ...",
  REMOVED "Phase Pin Is the First Candidate, Not a Shortcut",
  ADDED "Provider_config ist die einzige Kandidatenquelle des Routers".
- Tests aktualisiert: FA-SF-72 (catalog-eval-telemetry), T002369-D3
  (factory-escalation-ladder), local-llm-proxy Teil-1-Assertion jetzt gegen
  provider_config statt die Slot-Tabelle.
