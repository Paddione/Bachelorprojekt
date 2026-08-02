---
title: "sdlc-cockpit-k10-pipeline-slot — Implementation Plan"
ticket_id: T002531
domains: [website, test]
status: plan_staged
file_locks:
  - website/src/pages/admin/cockpit.astro
  - website/src/pages/admin/pipeline.astro
  - website/src/pages/admin.astro
  - website/src/components/admin/AdminSidebarNav.astro
  - website/src/middleware/redirect-map.ts
  - website/src/components/cockpit/PipelinePanel.svelte
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: [T002462]
---

# sdlc-cockpit-k10-pipeline-slot — Implementation Plan

_Ticket: T002531 · Epic T002458 · bindend: Design-Spec E1, E2, E22_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `website/src/components/cockpit/PipelinePanel.svelte` | neu | 800 |
| `website/src/components/cockpit/PipelinePanel.test.ts` | neu | 900 |
| `website/src/pages/admin/cockpit.astro` | 171 | 429 |
| `website/src/pages/admin/pipeline.astro` | 32 | 568 |
| `website/src/pages/admin.astro` | 189 | 411 |
| `website/src/pages/dev-status.astro` | 4 | 596 |
| `website/src/components/admin/AdminSidebarNav.astro` | 181 | 419 |
| `website/src/components/admin/AdminShortcuts.svelte` | 337 | 463 |
| `website/src/components/assistant/LlmProxyView.svelte` | 72 | 728 |
| `website/src/components/PortalSidekick.svelte` | 554 | 246 |
| `website/src/middleware/redirect-map.ts` | 34 | 866 |
| `website/src/middleware/redirect-map.test.ts` | 47 | 853 |
| `tests/e2e/specs/dev-status-tabs.spec.ts` | 92 | 808 |
| `tests/e2e/specs/fa-planning-office.spec.ts` | 28 | 872 |
| `tests/e2e/specs/fa-mobile-factory.spec.ts` | 142 | 758 |
| `tests/e2e/specs/fa-48-factory-devflow.spec.ts` | 112 | 788 |
| `tests/e2e/specs/factory-qs-abnahme.spec.ts` | 67 | 833 |
| `tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats` | neu | ungegated |
| `tests/spec/website-core.bats` | Änderung | ungegated |
| `tests/spec/software-factory/dashboard.bats` | Änderung | ungegated |
| `tests/spec/admin-cockpit.bats` | Änderung | ungegated |
| `website/src/styles/admin-responsive.css` | Änderung | ungegated |
| `website/src/data/test-inventory.json` | generiert | ungegated |
| `website/src/data/route-manifest.json` | generiert | ungegated |

**Entfallende Dateien** (Löschliste, in Task 7 einzeln nachgeprüft):

```
website/src/components/admin/Cockpit.svelte
website/src/components/admin/CockpitTable.svelte
website/src/components/admin/CockpitExpandRow.svelte
website/src/components/admin/EmptyStateCockpit.svelte
website/src/components/admin/TicketCreateModal.svelte
website/src/components/admin/TicketRow.svelte
website/src/components/admin/BulkBar.svelte
website/src/components/admin/Cockpit/MobileToggle.svelte
website/src/components/admin/Cockpit/FilterBar.svelte
website/src/lib/admin/cockpit-expand.ts
website/src/lib/tickets/cockpit-table-actions.ts
website/src/components/admin/Cockpit.test.ts
website/src/components/admin/CockpitTable.test.ts
website/src/components/admin/CockpitShell.integration.test.ts
website/src/components/admin/EmptyStateCockpit.test.ts
website/src/components/admin/TicketCreateModal.test.ts
website/src/components/admin/TicketRow.test.ts
website/src/components/admin/BulkBar.test.ts
website/src/components/admin/Cockpit/cockpit-mobile.test.ts
website/src/components/admin/Cockpit/FilterBar.test.ts
website/src/lib/admin/__tests__/cockpit-expand.test.ts
website/src/lib/tickets/cockpit-table-actions.test.ts
website/src/styles/mobile-cockpit.css
```

Budget-Ermittlung nach `plan-quality-gates.md`: **keine** der berührten Dateien steht in
`docs/code-quality/baseline.json` (`jq -r '."S1:<pfad>".metric // "nicht-baselined"'` gibt
für alle `nicht-baselined`). Wirksame Schwelle ist damit durchgehend das statische
Extension-Limit aus `docs/code-quality/gates.yaml` (`.astro` 600, `.svelte` 800, `.ts` 900);
`.css`, `.bats` und `.json` sind ungegated. Engster Fall ist `PortalSidekick.svelte`
(554 · Budget 246), wo nur eine Link-URL getauscht wird — zeilenneutral. `cockpit.astro`
wächst um den Panel-Aufruf und die Serverlogik (~25 Zeilen) und bleibt weit unter 600;
`PipelinePanel.svelte` wird bewusst als schlanker Rahmen (~60 Zeilen) geschnitten, damit die
Wachstumsreserve erhalten bleibt.

CQ02: die aktuelle `any`-Zählung in `website/src` ist **0**. Der Plan führt keinen
`any`-Typ ein; `PipelinePanel.svelte` typisiert seine drei Props über die bereits
bestehenden Typen von `DevStatusTabs` bzw. `getFloor`.

## Ausgangslage — verifizierte Befunde

Der Plan ist gegen folgende, im Worktree nachgemessene Befunde geschrieben. Wer sie beim
Ausführen anders vorfindet, hält an und prüft nach, statt anzupassen.

1. **`Cockpit.svelte` hat null Nicht-Test-Nutzer.** `grep -rn 'Cockpit.svelte'
   website/src/pages/` ist leer; `cockpit.astro` importiert seit PR #3563 nur `AdminLayout`
   und die Auth-Helfer. Importeure sind ausschließlich `Cockpit.test.ts`,
   `Cockpit/cockpit-mobile.test.ts`, `CockpitShell.integration.test.ts`,
   `EmptyStateCockpit.test.ts` sowie der Dateipfad-Bezug in `tests/spec/admin-cockpit.bats`.
2. **Der Funktionsverlust ist bereits eingetreten.** Filterleiste, Anlege-Modal, Presets und
   Mobile-Toggle dieses Baums sind seit PR #3563 über keine Route erreichbar. Diese Löschung
   *zeigt* den Verlust, sie verursacht ihn nicht. Wer die Filter zurückwill, baut sie als
   Kit-Panel in einem eigenen Vorgang — nicht als Rücknahme dieser Löschung.
3. **Nicht der ganze `cockpit-*`-Namensraum ist verwaist.** `CockpitSidekickView.svelte`
   wird von `PortalSidekick.svelte` importiert, und das steckt in `AdminLayout.astro:158`
   und `PortalLayout.astro:277` — also live auf jeder Admin-Seite. Über diesen Pfad bleiben
   auch `cockpitStore.ts`, `SuggestionBar.svelte`, `cockpit-presets.ts` und `cockpit-types.ts`
   in Benutzung. `cockpit-db.ts`, `cockpit-ids.ts`, `cockpit-labels.ts` und
   `cockpit-schema.ts` hängen an den Endpunkten unter `website/src/pages/api/admin/cockpit/`
   und an `pages/admin/tickets/[id].astro`. **Diese Dateien bleiben.**
4. **Es sind vier Redirects, nicht drei.** `redirect-map.ts:20` führt
   `/admin/factory-observability` ebenfalls auf `/admin/pipeline?tab=kosten`. Das Ticket
   nennt nur die Zeilen 17-19.
5. **`/admin/pipeline` ist breit verlinkt.** Außer Sidebar und Dashboard verweisen darauf
   `AdminShortcuts.svelte:162`, `LlmProxyView.svelte:58`, `PortalSidekick.svelte:306`,
   `dev-status.astro:3` sowie fünf E2E-Spezifikationen. Eine ersatzlose Löschung der Route
   erzeugt tote Links und rote Nachttests.
6. **`mobile-cockpit.css` hat keinen Lader.** Repo-weit gibt es genau zwei Treffer für
   `mobile-cockpit`: die Datei selbst und ein erklärender Kommentar in
   `admin-responsive.css:5`. Kein `import`, kein `<link>`, keine Glob-Einbindung.
7. **Die Panel-Laufzeit übernimmt jedes `[data-panel-type]`-Element.**
   `.lavish/kit/panel.js:270` adoptiert beim `DOMContentLoaded` alle solchen Elemente; für
   `status`/`strom` ruft `refresh()` anschließend `this.body.innerHTML = ''`. Ein Svelte-Insel
   im `panel__body` würde dabei ausgeräumt. Der Panel-Rahmen für `DevStatusTabs` trägt
   deshalb **kein** `data-panel-type` — er nutzt nur die CSS-Klassen. Genau das ist die
   Grenze, die E22 zieht: geteilte CSS-Schicht, getrennte Laufzeit.
8. **`output: 'server'`** (`website/astro.config.mjs:12`) — alle Seiten sind ohnehin SSR;
   `export const prerender = false` in `pipeline.astro:9` ist explizit, nicht wirksam
   notwendig. `cockpit.astro` trägt es heute nicht.
9. **`REDIRECT_MAP` reicht den Query-String nicht durch.** `middleware.ts` leitet auf den
   *vollständigen* Kartenwert um; ein Eintrag `'/admin/pipeline': '/admin/cockpit'` würde
   `?tab=kosten` verschlucken. Deshalb bleibt `pipeline.astro` als query-erhaltende
   Weiterleitung bestehen — dasselbe Muster wie `dev-status.astro`.
10. **`route-manifest.json` bleibt konsistent.** `classifyAuthTier()` in
    `scripts/lib/route-manifest.mjs` leitet die Stufe aus dem *Pfad* ab, nicht aus dem
    Dateiinhalt. Eine auf eine Weiterleitung geschrumpfte `pipeline.astro` bleibt
    `authTier: admin` und verletzt die Invarianten aus `Taskfile.yml` Phase 4 nicht.

## Entscheidungen

**D-K10-1 — Menü: der Cockpit-Eintrag bleibt in der obersten Gruppe, der Pipeline-Eintrag
entfällt.** `AdminSidebarNav.astro` führt heute *Cockpit* (Zeile 39, oberste Gruppe) und
*Pipeline* (Zeile 59, Gruppe Infrastruktur). Nach E1/E2 darf genau eine SDLC-Fläche
übrigbleiben. Gewählt: der Pipeline-Eintrag wird gestrichen, der Cockpit-Eintrag übernimmt
dessen Aktiv-Erkennung (`matches: ['/admin/cockpit', '/admin/pipeline', '/admin/tickets']`).
Verworfen wurde, den Cockpit-Eintrag nach *Infrastruktur* auf die Zeile von Pipeline zu
verschieben: die Dachfläche gehört neben Dashboard und Postfach, nicht in eine
Zubehör-Gruppe. Der Sinn von „auf dem Platz von Pipeline" ist erfüllt, sobald kein
Pipeline-Eintrag mehr existiert und jeder Pipeline-Pfad im Cockpit landet.

**D-K10-2 — `?tab=` bleibt der Vorwahl-Parameter, jetzt auf `/admin/cockpit`.** Die vier
Redirects behalten ihre Zielwirkung und verlieren nur einen Sprung. Alternative wäre ein
eigener Parameter (`?panel=pipeline&tab=…`) gewesen; verworfen, weil er alle vier
Kartenwerte, fünf E2E-Spezifikationen und die Nutzer-Lesezeichen gleichzeitig entwertet,
ohne heute einen zweiten Panel-Parameter zu haben. Sobald K3 eigene Layout-Parameter
einführt, ist `tab` ein reservierter Name — das ist in Task 5 als Kommentar festzuhalten.

**D-K10-3 — `pipeline.astro` bleibt als Weiterleitungsstummel, die Hülle entfällt.**
Aufgelöst wird die *Hülle* (AdminLayout + Auth + `getFloor` + `DevStatusTabs`) — sie ist
danach im Cockpit. Zurück bleiben drei Zeilen nach dem Vorbild von `dev-status.astro`.
Grund: Befund 5 und 9. Eine ersatzlose Löschung wäre ehrlicher, kostet aber tote Links und
den Query-String.

**D-K10-4 — OF4: `mobile-cockpit.css` entfällt ersatzlos.** Befund 6 zeigt, dass die Datei
von nichts geladen wird; ihr Wegfall ist damit **keine** Verhaltensänderung, sondern das
Entfernen einer nie eingebundenen Datei. Der Kommentar in `admin-responsive.css:5`, der sie
als „Cockpit owns its own mobile layout" beschreibt, wird korrigiert — sonst bleibt eine
Erklärung stehen, die auf nichts mehr verweist.

**D-K10-5 — Abgrenzung zu K3.** Dieser Plan zweigt von `main` ab (keine Branch-Kette) und
berührt `cockpit.astro` an anderer Stelle als K3: K3 ersetzt den `<style>`-Block und den
Layout-Rumpf, K10 fügt Serverlogik im Frontmatter und einen Panel-Aufruf im Arbeitsbereich
hinzu. Beide Pläne führen die Datei in ihren `file_locks`; wer zuerst merged, gewinnt, der
zweite rebased. Der Konflikt ist absehbar und wird bewusst in Kauf genommen.

## Task 1 — Vorprüfung: K3-Schnittstelle und Verwaisung belegen

Kein Schritt dieses Tasks verändert Dateien. Er stellt fest, gegen welchen Stand gebaut wird.

- [x] Prüfen, ob die Layout-Engine aus K3 (T002462) auf `main` angekommen ist:

```bash
git fetch origin main --quiet
git show origin/main:.lavish/kit/layout.js > /dev/null 2>&1 \
  && echo "K3-LIEGT-AUF-MAIN" || echo "K3-LIEGT-NICHT-AUF-MAIN"
```

- [x] **Ergebnis `K3-LIEGT-AUF-MAIN`:** das Pipeline-Panel im Arbeitsbereich über die reale
      Engine platzieren. Maßgeblich sind die tatsächlichen Signaturen aus
      `origin/main:.lavish/kit/layout.js`.
- [ ] **Ergebnis `K3-LIEGT-NICHT-AUF-MAIN`:** gegen die Schnittstelle bauen, die K3s Plan
      (`origin/feature/sdlc-cockpit-k3-layout-engine-T002462:openspec/changes/sdlc-cockpit-k3-layout-engine/tasks.md`,
      Task 3 und 5) festlegt. Erwartet wird ein klassisches Skript, das `window.cockpitLayout`
      setzt, mit — wörtlich aus K3s Plan:

      - `RAIL_GROUPS` — eingefrorene Liste der vier D7-Gruppen (laufende Epics, was
        Aufmerksamkeit braucht, aktive Agenten, Modell-Server)
      - `computePlacement(state)` mit `state = { panels, viewport }` → höchstens drei
        Panels als Karte im Arbeitsbereich, überzählige bleiben im Katalog
      - `serializeLayout(state)` / `restoreLayout(raw, knownPanelIds)` über den Schlüssel
        `lavish-layout-v1`
      - `mobileGate(action, ctx)` als einzige Indirektion auf `window.actionPolicy`

      K10 **ruft nichts davon selbst auf**. Das Pipeline-Panel ist für die Engine ein
      gewöhnliches Panel-Element im Arbeitsbereich; die Platzierung übernimmt sie, sobald sie
      da ist. Ohne Engine steht das Panel im heutigen Flex-Arbeitsbereich — sichtbar und
      benutzbar, nur nicht verschiebbar. Diesen Zustand als Kommentarkopf in
      `PipelinePanel.svelte` festhalten (welcher Zweig gegriffen hat, mit Datum).
- [x] Verwaisung des zu löschenden Baums dateiweise belegen und die Ausgabe im PR-Text
      festhalten. Der Lauf misst Importeure **außerhalb** der Löschliste:

```bash
for f in Cockpit CockpitTable CockpitExpandRow EmptyStateCockpit TicketCreateModal \
         TicketRow BulkBar MobileToggle FilterBar; do
  printf '%s: ' "$f"
  grep -rn "$f.svelte" website/src tests website/e2e 2>/dev/null | cut -d: -f1 | sort -u
  echo "---"
done
grep -rn "cockpit-table-actions\|admin/cockpit-expand" website/src tests | cut -d: -f1 | sort -u
```

- [x] **Abbruchbedingung:** taucht für eine Datei ein Importeur auf, der *nicht* in der
      Löschliste steht, bleibt diese Datei stehen und der Befund wird im PR benannt. Eine zu
      weit gefasste Löschung ist hier der teuerste Fehler.
- [x] Gegenprobe für die Bleibe-Liste — diese Dateien MÜSSEN Importeure außerhalb der
      Löschliste haben:

```bash
grep -rn "CockpitSidekickView\|stores/cockpitStore\|cockpit-presets\|tickets/cockpit-db" \
  website/src --include='*.svelte' --include='*.ts' --include='*.astro' | cut -d: -f1 | sort -u
```

## Task 2 — Testgerüst (RED)

Die Löschung nimmt elf Testdateien mit. An ihre Stelle treten zwei Prüfstellen: ein
BATS-Vorgangstest für die Flächen- und Löschaussagen und ein Vitest für den Panel-Rahmen.
Beide werden **vor** der Umsetzung geschrieben und laufen rot.

- [ ] `tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats` anlegen (Namensprüfung gegen
      `ls tests/spec/sdlc-cockpit/` — die 18 vorhandenen Dateien tragen andere Namen).
      Header-Kommentar dokumentiert den Prüfmodus: **Quelltext-Prüfung**, weil es um
      Verdrahtung von Markup, Navigationsdaten und Dateiexistenz geht — ein Bereich, dessen
      Ergebnis sich ausschließlich im Repo-Zustand manifestiert. Das Laufzeitverhalten des
      Panels deckt der Vitest ab.
      Enthaltene Prüfungen, **jede mit Positiv-Anker im selben `@test`**:
      - *Menü:* zuerst belegen, dass `AdminSidebarNav.astro` überhaupt Einträge mit
        `href: '/admin/…'` führt und genau einer auf `/admin/cockpit` zeigt; danach die
        Negativaussage, dass kein `href: '/admin/pipeline'` mehr vorkommt.
      - *Dashboard:* zuerst belegen, dass `admin.astro` einen `slot="header"`-Link im
        Pipeline-Widget hat, dann dass dessen Ziel `/admin/cockpit` ist.
      - *Löschung:* zuerst belegen, dass die Bleibe-Fläche existiert und nicht leer ist
        (`CockpitSidekickView.svelte` und `pages/api/admin/cockpit/portfolio.ts`), dann dass
        keine Datei der Löschliste mehr existiert und kein Quelltext sie mehr importiert.
        Ohne diesen Anker bestünde der Test auch für ein leeres `website/src/`.
      - *OF4:* zuerst belegen, dass `admin-responsive.css` existiert und referenziert wird,
        dann dass `mobile-cockpit` repo-weit keinen Treffer mehr hat.
      - *Weiterleitung:* zuerst belegen, dass `pipeline.astro` existiert, dann dass sie
        `Astro.redirect` mit `/admin/cockpit` und `Astro.url.search` verwendet und
        `DevStatusTabs` **nicht** mehr importiert.
- [ ] `website/src/components/cockpit/PipelinePanel.test.ts` anlegen. Der Pfad fällt unter
      `src/components/**/*.test.ts` und läuft damit im `components`-Projekt von
      `website/vitest.config.ts` (jsdom + Svelte-Plugin). Header-Kommentar dokumentiert den
      Prüfmodus: **Ergebnis-Test** — die echte Panel-Laufzeit wird ausgeführt und ihr Effekt
      auf das gerenderte Markup gemessen.
      Fälle:
      - Positiv-Anker: `render(PipelinePanel, …)` liefert ein Element mit den Kit-Klassen
        `panel` und `panel__body`, und im `panel__body` steckt der Tab-Baum (Prüfung auf den
        von `DevStatusTabs` gerenderten `.tabs`-Knoten). `global.fetch` wird für den Lauf
        gestubbt, `initial` kommt als Vorbefüllung herein.
      - Negativaussage mit demselben Anker: der Panel-Knoten trägt **kein**
        `data-panel-type`.
      - Laufzeit-Gegenprobe: `.lavish/kit/panel.js` per `readFileSync` lesen, mit
        `new Function(src)` ausführen und den Auto-Init-Lauf über `[data-panel-type]`
        anstoßen. Danach muss der Tab-Knoten im `panel__body` **noch da** sein und das
        Panel-Element darf nicht in `Panel.registry` stehen. Positiv-Anker im selben Test:
        ein danebengestelltes Kontroll-Element **mit** `data-panel-type="status"` wird sehr
        wohl adoptiert — sonst bewiese der Test nur, dass die Laufzeit gar nicht lief.
- [ ] `website/src/middleware/redirect-map.test.ts` anpassen: die vier Zeilen der
      `CASES`-Tabelle auf `/admin/cockpit?tab=…` umstellen. Die Aussage „genau 21 Einträge"
      bleibt bestehen — es kommt kein Eintrag hinzu (D-K10-3).
- [ ] Läufe **vor** der Umsetzung:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats
cd website && npx vitest run src/components/cockpit/PipelinePanel.test.ts src/middleware/redirect-map.test.ts
# expected: FAIL — PipelinePanel.svelte existiert nicht, das Menue fuehrt noch Pipeline,
# der Cockpit-Baum steht noch, die Redirect-Ziele zeigen noch auf /admin/pipeline
```

- [ ] Syntaxprüfung der neuen BATS-Datei mit dem tauglichen Mittel (`bash -n` meldet für
      `@test`-Blöcke einen irreführenden Fehler):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/pipeline-slot-uebernahme.bats
```

## Task 3 — Menü-Slot übernehmen

- [ ] `AdminSidebarNav.astro`: den Eintrag `{ href: '/admin/pipeline', label: 'Pipeline', … }`
      in der Gruppe *Infrastruktur* (Zeile 59) entfernen. Den Cockpit-Eintrag (Zeile 39) auf
      `matches: ['/admin/cockpit', '/admin/pipeline', '/admin/tickets']` erweitern, damit die
      Aktiv-Markierung auch beim Weiterleitungs-Zwischenschritt greift. Label bleibt
      `Cockpit`.
- [ ] `admin.astro:140`: `href="/admin/pipeline"` → `href="/admin/cockpit"`, Linktext
      „Pipeline →" → „Cockpit →". Das Widget selbst (`PipelineSidekickView`) bleibt
      unverändert — es ist eine Zusammenfassung auf dem Dashboard, keine zweite Fläche.
- [ ] `AdminShortcuts.svelte:162`: `{ url: '/admin/pipeline', label: 'Pipeline' }` →
      `{ url: '/admin/cockpit', label: 'Cockpit' }`.
- [ ] `LlmProxyView.svelte:58` und `PortalSidekick.svelte:306`: beide Verweise
      `/admin/pipeline?tab=control` → `/admin/cockpit?tab=control`. Beide Änderungen sind
      zeilenneutral (`PortalSidekick.svelte` hat mit Budget 246 Reserve, nutzt sie aber nicht).
- [ ] `tests/spec/website-core.bats`, Test „T001433 sidebar: AdminSidebarNav has exactly one
      /admin/pipeline link labelled Pipeline": auf die neue Aussage umschreiben — genau ein
      `/admin/cockpit`-Eintrag, kein `/admin/pipeline`-Eintrag, und die bestehende
      Negativprüfung auf `/dev-status` bzw. `/admin/planungsbuero` beibehalten. Der
      Positiv-Anker (es gibt überhaupt Einträge) muss im Test bleiben.

## Task 4 — Die vier Redirects auflösen

- [ ] `redirect-map.ts` Zeilen 17-20 auf die neuen Ziele umstellen:

```
'/admin/planungsbuero'        -> '/admin/cockpit?tab=planung'
'/admin/dora'                 -> '/admin/cockpit?tab=analytics'
'/admin/factory-budget'       -> '/admin/cockpit?tab=kosten'
'/admin/factory-observability'-> '/admin/cockpit?tab=kosten'
```

- [ ] Den Kopfkommentar der Datei um einen Satz ergänzen, warum `/admin/pipeline` **nicht**
      in der Karte steht: die Karte liefert ein vollständiges Ziel und reicht den
      eingehenden Query-String nicht durch; `/admin/pipeline?tab=kosten` würde seine Vorwahl
      verlieren. Die Weiterleitung liegt deshalb in der Seite (Task 5).
- [ ] `redirect-map.test.ts` ist bereits in Task 2 mitgezogen — hier nur den Lauf gegenprüfen.

## Task 5 — Das Pipeline-Panel bauen und einhängen

- [ ] `website/src/components/cockpit/PipelinePanel.svelte` anlegen: schlanker Rahmen um
      `DevStatusTabs`, Props `initial`, `initialTab`, `brand` unverändert durchgereicht.
      Markup:

```
<section class="panel panel--card" id="panel-pipeline" data-cockpit-panel="pipeline">
  <div class="panel__head"><span class="panel__title">Pipeline</span></div>
  <div class="panel__body"><DevStatusTabs {initial} {initialTab} {brand} /></div>
</section>
```

      **Kein `data-panel-type`** (Befund 7) — der Rahmen nutzt ausschließlich die geteilte
      CSS-Schicht aus `panel.css`, nicht die JS-Laufzeit. Diese Begründung als Kommentarkopf
      in die Datei, sonst ergänzt sie jemand „der Vollständigkeit halber" und die Insel wird
      beim nächsten Refresh ausgeräumt. Eigene Stilregeln nur über Token-Bezüge; `tokens.css`
      bleibt unangetastet (E11).
- [ ] `cockpit.astro` Frontmatter erweitern — wörtlich aus `pipeline.astro` übernommen,
      damit die Vorbefüllung und die Tab-Vorwahl nicht verlorengehen:
      - `import DevStatusTabs`-Ersatz: `import PipelinePanel from
        '../../components/cockpit/PipelinePanel.svelte'`, `import { getFloor } from
        '../../lib/factory-floor'`.
      - `const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);` und
        `let initial = null; try { initial = await getFloor(slotsCap); } catch { initial = null; }`
        — der `catch`-Zweig bleibt wie gehabt, damit eine tote Datenquelle die Seite nicht
        mitnimmt.
      - Die `Tab`-Union und die `ALLOWED`-Liste (`factory`, `planung`, `analytics`, `kosten`,
        `control`, `abhaengigkeiten`, `parallel`) samt Auswertung von
        `Astro.url.searchParams.get('tab')` mit Vorgabe `factory`.
      - `export const prerender = false;` ergänzen. Wirksam ändert das nichts
        (`output: 'server'`), es hält die Absicht aber fest und überlebt einen künftigen
        Wechsel der Ausgabeart — `pipeline.astro` trug es aus demselben Grund.
      - Kommentar: `tab` ist ab hier ein reservierter Query-Parameter der Cockpit-Seite;
        Layout-Parameter aus K3 dürfen ihn nicht überladen (D-K10-2).
- [ ] Im Arbeitsbereich (`<main class="cockpit-workspace">`) das Panel als Insel einhängen:
      `<PipelinePanel client:load {initial} {initialTab} {brand} />`. Es steht neben den
      bestehenden Kit-Panels; die Reihenfolge im Markup ist die heutige Platzierung, die
      Layout-Engine übernimmt sie später (Task 1).
- [ ] **`is:inline` nicht anfassen.** Die vorhandenen `<script is:inline
      src="/cockpit/kit/*.js">`-Zeilen bleiben unverändert. Dieser Plan fügt **kein**
      weiteres Skript-Tag hinzu; käme eines dazu, müsste es zwingend `is:inline` tragen —
      ohne das Attribut zieht Astro die Datei in den Bundle-Graph und der Build bricht mit
      „references an asset in the public/ directory" ab. Der Fehler fällt **nur** beim Build
      auf, `pnpm dev` und vitest laufen grün daran vorbei (Kommentar Zeile 15-23 der Datei).
      Deshalb ist der Astro-Build in Task 8 Pflicht.
- [ ] Vitest aus Task 2 laufen lassen, bis er grün ist.

## Task 6 — `pipeline.astro` auflösen

- [ ] `pipeline.astro` auf eine query-erhaltende Weiterleitung reduzieren, Vorbild
      `dev-status.astro`:

```
---
// Aufgegangen im SDLC-Cockpit (T002531). Permanente, query-erhaltende Weiterleitung.
return Astro.redirect(`/admin/cockpit${Astro.url.search}`, 301);
---
```

- [ ] `dev-status.astro:3` auf `/admin/cockpit` umstellen, damit kein Doppelsprung
      `/dev-status → /admin/pipeline → /admin/cockpit` entsteht.
- [ ] `tests/spec/software-factory/dashboard.bats`: die zwei Tests „pipeline.astro exists and
      mounts DevStatusTabs" und „dev-status.astro is a 301 redirect to /admin/pipeline"
      umschreiben. Neue Aussagen: `cockpit.astro` bindet `PipelinePanel` ein (Positiv-Anker),
      `pipeline.astro` leitet mit `Astro.url.search` auf `/admin/cockpit` weiter und
      importiert `DevStatusTabs` nicht mehr, `dev-status.astro` zeigt auf `/admin/cockpit`.
- [ ] E2E-Pfade nachziehen — sie laufen nachts gegen beide Brands und würden sonst über die
      Weiterleitung stolpern, sobald sie die URL prüfen:
      - `tests/e2e/specs/dev-status-tabs.spec.ts`: alle `page.goto('/admin/pipeline…')` auf
        `/admin/cockpit…`; FA-UNIF-04 erwartet künftig `/admin/cockpit?tab=planung`;
        FA-UNIF-08 („Sidebar hat genau einen Pipeline-Eintrag") prüft künftig den
        Cockpit-Eintrag.
      - `tests/e2e/specs/fa-planning-office.spec.ts`, `fa-mobile-factory.spec.ts`,
        `fa-48-factory-devflow.spec.ts`, `factory-qs-abnahme.spec.ts`: `goto`- und
        `waitForURL`-Pfade auf `/admin/cockpit` umstellen.

## Task 7 — Den verwaisten Cockpit-Baum löschen

Diese Löschung steht bewusst **nach** dem Einhängen: solange das Panel nicht steht, ist die
alte Fläche der einzige Weg zu den Factory-Ansichten.

- [ ] Den Verwaisungslauf aus Task 1 **erneut** ausführen (der Baum kann sich zwischen
      Planung und Ausführung verändert haben) und nur löschen, was er als importeurfrei
      ausweist.
- [ ] Die Dateien der Löschliste entfernen (`git rm`), Komponenten und ihre Testdateien
      gemeinsam. Das leere Verzeichnis `website/src/components/admin/Cockpit/` verschwindet
      dabei mit.
- [ ] `tests/spec/admin-cockpit.bats` bereinigen: die Dateivariablen `EXPAND_ROW`,
      `FILTER_BAR`, `TICKET_ROW`, `ADMIN_COCKPIT` und die vier daran hängenden Tests
      („T001433 expand: …", „T001433 toolbar: …", „AdminCockpit.svelte exists") entfallen —
      sie prüfen gelöschte Dateien. Die übrigen Tests der Datei (Coaching-Settings,
      admin-content-db, admin-nav-accordion) bleiben unverändert stehen.
- [ ] Gegenprobe, dass die Bleibe-Liste unangetastet ist:

```bash
test -f website/src/components/assistant/CockpitSidekickView.svelte
test -f website/src/lib/stores/cockpitStore.ts
test -f website/src/lib/cockpit-presets.ts
test -f website/src/lib/tickets/cockpit-db.ts
ls website/src/pages/api/admin/cockpit/
```

- [ ] `cd website && npx vitest run` — kein verbliebener Test darf auf eine gelöschte Datei
      importieren. Ein `Cannot find module`-Fehler hier heißt: eine Löschung war zu weit
      gefasst oder eine Testdatei wurde übersehen.

## Task 8 — OF4 und Verifikation

- [ ] `website/src/styles/mobile-cockpit.css` löschen (D-K10-4).
- [ ] `website/src/styles/admin-responsive.css:5`: den Satz „Cockpit owns its own mobile
      layout (mobile-cockpit.css) and is excluded." auf den neuen Stand bringen — das
      Cockpit bringt seine Mobilregeln über die Kit-Schicht mit, eine eigene
      Admin-Stildatei gibt es nicht mehr.
- [ ] Alle in diesem Plan angelegten und geänderten Testdateien laufen lassen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/
tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats tests/spec/admin-cockpit.bats \
                                  tests/spec/software-factory/dashboard.bats
cd website && npx vitest run
```

- [ ] Astro-Build gegenprüfen, weil der `is:inline`-Fehler ausschließlich beim Build sichtbar
      wird (Task 5):

```bash
cd website && pnpm build
```

- [ ] Testinventar regenerieren und mitcommitten — CI vergleicht es fail-closed gegen die
      eingecheckte Fassung, und dieser Vorgang entfernt elf und ergänzt zwei Testdateien:

```bash
task test:inventory
```

- [ ] `any`-Zählung darf nicht steigen (CQ02, Ist-Stand 0):

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

- [ ] Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
