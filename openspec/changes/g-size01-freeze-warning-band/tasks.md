---
title: "G-SIZE01: Freeze-Frühwarn-Band reduzieren (39→≤15)"
ticket_id: T001291
domains: [quality, website, size]
status: plan_staged
---

# g-size01-freeze-warning-band — Implementation Plan

## File Structure

| Datei | Aktion | Batch |
|---|---|---|
| `scripts/docs-gen/templates.test.mjs` | GELÖSCHT — ersetzt durch drei Partials | B1 |
| `scripts/docs-gen/templates-render-page.test.mjs` | NEU — renderPage + provenanceBadge Tests (~165 Zeilen) | B1 |
| `scripts/docs-gen/templates-section-index.test.mjs` | NEU — renderSectionIndex + renderLanding + renderSkillsIndex Tests (~175 Zeilen) | B1 |
| `scripts/docs-gen/templates-dedup-index.test.mjs` | NEU — deduplicateSkills + categoryForSkill + renderAgentsIndex + renderDocsIndex Tests (~155 Zeilen) | B1 |
| `website/src/components/factory/DetailPanel.svelte` | GEÄNDERT — Sidebar-Block extrahiert (495→≤365 Zeilen) | B1 |
| `website/src/components/factory/DetailPanelSidebar.svelte` | NEU — Sidebar + Phase-Progress Sub-Komponente (~130 Zeilen) | B1 |
| `website/src/components/FactoryFloor.svelte` | GEÄNDERT — Lane-Spalte extrahiert (494→≤365 Zeilen) | B1 |
| `website/src/components/FactoryFloorLane.svelte` | NEU — einzelne Kanban-Spalte (~130 Zeilen) | B1 |
| `scripts/vda/oracle.sh` | GEÄNDERT — AI-Call-Logik extrahiert (492→≤365 Zeilen) | B1 |
| `scripts/vda/oracle-ai-call.sh` | NEU — Ollama-Query-Dispatch + Antwort-Parsing (~130 Zeilen) | B1 |
| `scripts/pre-deploy-check.sh` | GEÄNDERT — Check-Funktionen extrahiert (490→≤365 Zeilen) | B1 |
| `scripts/pre-deploy-checks-lib.sh` | NEU — gesourcte Check-Bibliothek (Schema, Secrets, TLS, ~130 Zeilen) | B1 |
| `website/src/components/admin/AdminBookingModal.svelte` | GEÄNDERT — Slot-Picker extrahiert (487→≤360 Zeilen) | B1 |
| `website/src/components/admin/AdminBookingSlotPicker.svelte` | NEU — Termin-Auswahl Sub-Komponente (~130 Zeilen) | B1 |
| `scripts/systembrett-generate.mjs` | GEÄNDERT — HTML-Rendering extrahiert (477→≤350 Zeilen) | B1 |
| `scripts/docs-gen/systembrett-html.mjs` | NEU — HTML-Render-Helpers (~130 Zeilen) | B1 |
| `scripts/build-docs.mjs` | GEÄNDERT — File-Walker extrahiert (476→≤350 Zeilen) | B1 |
| `scripts/docs-gen/build-docs-walker.mjs` | NEU — rekursiver Source-File-Walker (~130 Zeilen) | B1 |
| `website/src/lib/factory-floor.ts` | GEÄNDERT — Filter/Sort-Helpers extrahiert (571→≤440 Zeilen) | B1 |
| `website/src/lib/factory-floor-filters.ts` | NEU — Ticket-Filter + Sort-Utilities (~135 Zeilen) | B1 |
| `scripts/docs-gen/theme.mjs` | GEÄNDERT — JS-Inline-Blöcke extrahiert (462→≤350 Zeilen) | B2a |
| `scripts/docs-gen/theme-js.mjs` | NEU — SUBST_JS, COPY_JS, DIAGRAM_JS, graphJs(), clientJs() (~140 Zeilen) | B2a |
| `scripts/build-graph.mjs` | GEÄNDERT — geteilte Graph-Utilities extrahiert (466→≤375 Zeilen) | B2a |
| `scripts/build-graph-docs.mjs` | GEÄNDERT — nutzt shared Graph-Utilities (463→≤375 Zeilen) | B2a |
| `scripts/build-graph-shared.mjs` | NEU — geteilte Hilfsfunktionen für beide build-graph-Skripte (~100 Zeilen) | B2a |
| `website/src/lib/caldav.ts` | GEÄNDERT — Event-Cache-Helpers extrahiert (549→≤445 Zeilen) | B2a |
| `website/src/lib/caldav-cache.ts` | NEU — CalDAV-Antwort-Caching-Utilities (~110 Zeilen) | B2a |
| `scripts/migrate.sh` | GEÄNDERT — Migration-Check-Funktionen extrahiert (450→≤365 Zeilen) | B2a |
| `scripts/migrate-lib.sh` | NEU — gesourcte Migration-Hilfsfunktionen (~90 Zeilen) | B2a |
| `scripts/backup-restore-recovery.sh` | GEÄNDERT — Recovery-Check-Funktionen extrahiert (450→≤365 Zeilen) | B2a |
| `scripts/backup-restore-lib.sh` | NEU — gesourcte Backup/Restore-Hilfsfunktionen (~90 Zeilen) | B2a |
| `tests/e2e/specs/wissensquellen.spec.ts` | GEÄNDERT — Fixture-Setup extrahiert (541→≤445 Zeilen) | B2a |
| `tests/e2e/lib/wissensquellen-fixtures.ts` | NEU — Fixture-Definitionen und Setup-Helpers (~100 Zeilen) | B2a |
| `assets/design-overviews/kore-design-system/tweaks-panel.jsx` | GEÄNDERT — Panel-Section extrahiert (568→≤450 Zeilen) | B2a |
| `assets/design-overviews/kore-design-system/TweaksPanelSection.jsx` | NEU — wiederverwendbare Panel-Sektion (~120 Zeilen) | B2a |
| `website/src/layouts/AdminLayout.astro` | GEÄNDERT — Nav-Slots extrahiert (357→≤295 Zeilen) | B2b |
| `website/src/components/admin/AdminSidebarNav.astro` | NEU — Sidebar-Navigation (~70 Zeilen) | B2b |
| `website/src/components/PlanningOffice.svelte` | GEÄNDERT — Item-Darstellung extrahiert (445→≤355 Zeilen) | B2b |
| `website/src/components/PlanningOfficeItem.svelte` | NEU — einzelnes Planungs-Item (~95 Zeilen) | B2b |
| `website/src/lib/tickets/__tests__/cockpit-api.test.ts` | GEÄNDERT — Action-Tests ausgelagert (533→≤430 Zeilen) | B2b |
| `website/src/lib/tickets/__tests__/cockpit-api-actions.test.ts` | NEU — Action-spezifische Test-Suite (~105 Zeilen) | B2b |
| `website/src/lib/messaging-db.ts` | GEÄNDERT — Attachment-Helpers extrahiert (531→≤430 Zeilen) | B2b |
| `website/src/lib/messaging-db-attachments.ts` | NEU — Attachment-Upload/Download-Utilities (~105 Zeilen) | B2b |
| `tests/e2e/specs/visual-sweep.spec.ts` | GEÄNDERT — Sweep-Helper-Typen extrahiert (526→≤420 Zeilen) | B2b |
| `tests/e2e/lib/visual-sweep-helpers.ts` | NEU — Sweep-Konfigurationstypen + Assertion-Helpers (~110 Zeilen) | B2b |
| `website/src/pages/admin/tickets/[id].astro` | GEÄNDERT — Detail-Sektionen extrahiert (346→≤270 Zeilen) | B2b |
| `website/src/components/admin/TicketDetailSections.astro` | NEU — History + Comment-Sektionen (~80 Zeilen) | B2b |

## Task 0: Baseline messen (RED)

Vor jeder Änderung den aktuellen Warn-Band-Wert dokumentieren.

```bash
python3 - <<'PY'
import json,subprocess,os
L={'.astro':400,'.ts':600,'.svelte':500,'.sh':500,'.mjs':500,'.mts':500,'.py':600,'.js':600,'.jsx':600,'.tsx':400,'.cjs':200,'.bash':300}
roots=('website/','tests/','scripts/','brett/','assets/','art-library/','k3d/','prod/','prod-fleet/','environments/','deploy/','claude-code/','openclaw/')
ig={'website/src/lib/system-test-seed-data.ts','scripts/factory/pipeline.js','website/src/lib/website-db.ts','brett/public/lib/GLTFLoader.js','scripts/ticket.sh'}
fz={v['path'] for v in json.load(open('docs/code-quality/baseline.json')).values() if v.get('path')}
n=0
for f in subprocess.check_output(['git','ls-files']).decode().split():
    e=os.path.splitext(f)[1]
    if e not in L or not f.startswith(roots) or f in ig or f in fz or f.startswith('scripts/code-quality/fixtures/'): continue
    if 0.8*L[e] <= sum(1 for _ in open(f,'rb')) <= L[e]: n+=1
print('Warn-Band 80-100%:', n)
PY
```

- [ ] Measure-Command ausführen und Ausgabe notieren
  expected: FAIL (aktueller Wert: 39 Quelldateien bei 80–100 % ihres S1-Limits — over target: ≤ 15 Dateien im Warn-Band)

## Task 1: Split `templates.test.mjs` (100 % → drei Partial-Test-Dateien)

`scripts/docs-gen/templates.test.mjs` ist mit 500/500 Zeilen am absoluten Limit. Die 32 Test-Cases gruppieren sich natürlich nach drei Domains: Render-Page-Utilities, Section-Index-Renderer und Deduplication/Category-Helpers.

- [ ] Neue Datei `scripts/docs-gen/templates-render-page.test.mjs` anlegen mit allen Tests für `renderPage`, `provenanceBadge` und `documentHead` (ungefähr die ersten 165 Zeilen inklusive Shared-Fixtures).
- [ ] Neue Datei `scripts/docs-gen/templates-section-index.test.mjs` anlegen mit allen Tests für `renderSectionIndex`, `renderLanding`, `renderSkillsIndex` und den zugehörigen Hub-Assertions (ungefähr 175 Zeilen).
- [ ] Neue Datei `scripts/docs-gen/templates-dedup-index.test.mjs` anlegen mit allen Tests für `deduplicateSkills`, `categoryForSkill`, `renderAgentsIndex` und `renderDocsIndex` (ungefähr 155 Zeilen).
- [ ] `scripts/docs-gen/templates.test.mjs` löschen (alle Tests sind in den drei neuen Dateien abgedeckt).
- [ ] Prüfen: Alle neuen Dateien liegen unter 400 Zeilen (80 % des .mjs-Limits von 500).
- [ ] `node --test scripts/docs-gen/templates-render-page.test.mjs scripts/docs-gen/templates-section-index.test.mjs scripts/docs-gen/templates-dedup-index.test.mjs` ausführen und auf grün prüfen.

## Task 2: Svelte Sub-Komponenten extrahieren — `DetailPanel.svelte` + `FactoryFloor.svelte`

Beide Svelte-Komponenten sind monolithisch aufgebaut und enthalten klar abgrenzbare UI-Blöcke, die als eigenständige Komponenten sinnvoller sind.

- [ ] In `website/src/components/factory/DetailPanel.svelte` den Sidebar-Block (Phase-Progress-Anzeige, Metadaten-Liste, Zuweisungs-Controls) identifizieren und in `website/src/components/factory/DetailPanelSidebar.svelte` extrahieren (Ziel: ~130 Zeilen). `DetailPanel.svelte` importiert und rendert `DetailPanelSidebar`.
- [ ] In `website/src/components/FactoryFloor.svelte` die einzelne Kanban-Spalten-Darstellung (Lane-Header + Ticket-Card-Schleife) in `website/src/components/FactoryFloorLane.svelte` extrahieren (Ziel: ~130 Zeilen). `FactoryFloor.svelte` iteriert über Lanes und rendert je eine `FactoryFloorLane`.
- [ ] Prüfen: `DetailPanel.svelte` liegt unter 400 Zeilen, `FactoryFloor.svelte` liegt unter 400 Zeilen.
- [ ] Prüfen: `DetailPanelSidebar.svelte` und `FactoryFloorLane.svelte` liegen jeweils unter 400 Zeilen.
- [ ] Vitest-Suite auf geänderte Komponenten-Pfade prüfen und bei Bedarf Import-Pfade in Tests aktualisieren.

## Task 3: Bash-Bibliotheken extrahieren — `oracle.sh` + `pre-deploy-check.sh`

Beide Shell-Skripte mischen Entry-Point-Logik (Argument-Parsing, User-Facing-Output) mit reusable Funktionen (AI-Queries, Check-Implementierungen). Die Funktions-Blöcke werden in gesourcte Bibliotheks-Dateien ausgelagert.

- [ ] In `scripts/vda/oracle.sh` den AI-Call-Block (Ollama-HTTP-Request, Antwort-Parsing, Retry-Logik) identifizieren und in `scripts/vda/oracle-ai-call.sh` extrahieren (Ziel: ~130 Zeilen). `oracle.sh` führt `source "$(dirname "$0")/oracle-ai-call.sh"` aus.
- [ ] In `scripts/pre-deploy-check.sh` die einzelnen Check-Funktionen (Schema-Validation, Secrets-Presence, TLS-Cert-Check, Namespace-Existence) in `scripts/pre-deploy-checks-lib.sh` extrahieren (Ziel: ~130 Zeilen). `pre-deploy-check.sh` führt `source scripts/pre-deploy-checks-lib.sh` aus.
- [ ] Prüfen: `oracle.sh` liegt unter 400 Zeilen, `pre-deploy-check.sh` liegt unter 400 Zeilen.
- [ ] `bash -n scripts/vda/oracle.sh` und `bash -n scripts/pre-deploy-check.sh` (Syntax-Check) ausführen.
- [ ] Manuell testen: `bash scripts/vda/oracle.sh --dry-run 'show pod status'` produziert weiterhin sinnvolle Ausgabe.

## Task 4: Batch 1 abschließen — `AdminBookingModal.svelte`, `systembrett-generate.mjs`, `build-docs.mjs`, `factory-floor.ts`

Die verbleibenden vier Dateien des ≥ 95 %-Bands werden nach demselben Extraktions-Muster behandelt.

- [ ] `website/src/components/admin/AdminBookingModal.svelte`: Slot-Picker-Block (Kalender-Widget, Uhrzeit-Auswahl, Verfügbarkeits-Anzeige) in `website/src/components/admin/AdminBookingSlotPicker.svelte` extrahieren (~130 Zeilen). Prüfen: Modal-Datei unter 400 Zeilen.
- [ ] `scripts/systembrett-generate.mjs`: HTML-Render-Funktionen (Knoten-Box, Edge-Pfeil, Label-Rendering) in `scripts/docs-gen/systembrett-html.mjs` extrahieren (~130 Zeilen). Prüfen: Generator-Datei unter 400 Zeilen.
- [ ] `scripts/build-docs.mjs`: rekursiven Datei-Walker (Source-Discovery, Frontmatter-Read, Slug-Generierung) in `scripts/docs-gen/build-docs-walker.mjs` extrahieren (~130 Zeilen). Prüfen: build-docs-Datei unter 400 Zeilen.
- [ ] `website/src/lib/factory-floor.ts`: Filter- und Sort-Utilities (Ticket-Status-Filter, Prioritäts-Sortierung, Such-Prädikate) in `website/src/lib/factory-floor-filters.ts` extrahieren (~135 Zeilen). Prüfen: `factory-floor.ts` unter 480 Zeilen.
- [ ] Measure-Command aus Task 0 erneut ausführen — Erwartungswert nach Batch 1: 30 Dateien im Warn-Band.

## Task 5: Batch 2a — 90–95 %-Band (8 Dateien)

Die acht Dateien im 90–95 %-Band werden gezielt entschlackt, um die Gesamtzahl auf 22 zu bringen.

- [ ] `scripts/docs-gen/theme.mjs` (462/500): JS-Inline-Blöcke (`SUBST_JS`, `COPY_JS`, `DIAGRAM_JS`, `graphJs()`, `clientJs()`) in `scripts/docs-gen/theme-js.mjs` extrahieren (~140 Zeilen). `theme.mjs` importiert aus `theme-js.mjs`. Prüfen: `theme.mjs` unter 400 Zeilen.
- [ ] `scripts/build-graph.mjs` (466/500) und `scripts/build-graph-docs.mjs` (463/500): geteilte Graph-Utilities (Node-Resolver, Edge-Builder, Cycle-Detector) in `scripts/build-graph-shared.mjs` extrahieren (~100 Zeilen). Beide Haupt-Skripte importieren aus der Shared-Datei. Prüfen: beide unter 400 Zeilen.
- [ ] `website/src/lib/caldav.ts` (549/600): Event-Cache-Helpers (Response-Caching, Cache-Invalidierung, Cache-Key-Berechnung) in `website/src/lib/caldav-cache.ts` extrahieren (~110 Zeilen). Prüfen: `caldav.ts` unter 480 Zeilen.
- [ ] `scripts/migrate.sh` (450/500): Migration-Check-Funktionen (Version-Compare, Backup-Assert, Schema-Existence-Check) in `scripts/migrate-lib.sh` extrahieren (~90 Zeilen). `migrate.sh` sourcet `migrate-lib.sh`. Prüfen: unter 400 Zeilen.
- [ ] `scripts/backup-restore-recovery.sh` (450/500): Backup/Restore-Hilfsfunktionen (File-Integrity-Check, Manifest-Parse, Recovery-Point-Listing) in `scripts/backup-restore-lib.sh` extrahieren (~90 Zeilen). Prüfen: unter 400 Zeilen.
- [ ] `tests/e2e/specs/wissensquellen.spec.ts` (541/600): Fixture-Definitionen und Setup-Helpers in `tests/e2e/lib/wissensquellen-fixtures.ts` extrahieren (~100 Zeilen). Prüfen: Spec-Datei unter 480 Zeilen.
- [ ] `assets/design-overviews/kore-design-system/tweaks-panel.jsx` (568/600): eine wiederverwendbare Panel-Sektion in `assets/design-overviews/kore-design-system/TweaksPanelSection.jsx` extrahieren (~120 Zeilen). Prüfen: Haupt-Datei unter 480 Zeilen.
- [ ] Measure-Command aus Task 0 erneut ausführen — Erwartungswert nach Batch 2a: 22 Dateien im Warn-Band.

## Task 6: Batch 2b — 85–90 %-Band (7 Dateien, Ziel-Unterschreitung)

Die sieben Dateien im 85–90 %-Band bringen die Gesamtzahl auf ≤ 15.

- [ ] `website/src/layouts/AdminLayout.astro` (357/400): Sidebar-Navigation in `website/src/components/admin/AdminSidebarNav.astro` extrahieren (~70 Zeilen). Prüfen: Layout unter 295 Zeilen (< 80 % von 400 = 320 Zeilen).
- [ ] `website/src/components/PlanningOffice.svelte` (445/500): einzelnes Planungs-Item in `website/src/components/PlanningOfficeItem.svelte` extrahieren (~95 Zeilen). Prüfen: Haupt-Komponente unter 400 Zeilen.
- [ ] `website/src/lib/tickets/__tests__/cockpit-api.test.ts` (533/600): Action-spezifische Test-Suite in `website/src/lib/tickets/__tests__/cockpit-api-actions.test.ts` auslagern (~105 Zeilen). Prüfen: Haupt-Test-Datei unter 480 Zeilen.
- [ ] `website/src/lib/messaging-db.ts` (531/600): Attachment-Upload/Download-Utilities in `website/src/lib/messaging-db-attachments.ts` extrahieren (~105 Zeilen). Prüfen: `messaging-db.ts` unter 480 Zeilen.
- [ ] `tests/e2e/specs/visual-sweep.spec.ts` (526/600): Sweep-Konfigurationstypen und Assertion-Helpers in `tests/e2e/lib/visual-sweep-helpers.ts` auslagern (~110 Zeilen). Prüfen: Spec-Datei unter 480 Zeilen.
- [ ] `website/src/pages/admin/tickets/[id].astro` (346/400): History- und Comment-Sektionen in `website/src/components/admin/TicketDetailSections.astro` extrahieren (~80 Zeilen). Prüfen: Page-Datei unter 295 Zeilen.
- [ ] `website/src/components/TicketQuickEdit.svelte` (412/500): Field-Group-Block (Status-Select, Prioritäts-Select, Assignee-Input) in `website/src/components/TicketQuickEditFields.svelte` extrahieren (~80 Zeilen). Prüfen: Haupt-Komponente unter 400 Zeilen.
- [ ] Measure-Command aus Task 0 ein letztes Mal ausführen — Erwartungswert: ≤ 15 Dateien im Warn-Band.

## Task 7 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-SIZE01` — G-SIZE01 zeigt grün (Warn-Band ≤ 15)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
