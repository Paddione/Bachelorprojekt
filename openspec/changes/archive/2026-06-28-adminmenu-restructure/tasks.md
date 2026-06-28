---
title: Admin-Menü Umstrukturierung — Implementation Plan
ticket_id: T001317
domains: [website]
status: completed
---

# adminmenu-restructure — Implementation Plan

## File Structure

| Datei | Typ | S1-Budget (Ist · wirksame Schwelle → Budget) |
|-------|-----|----------------------------------------------|
| `website/src/lib/e2e-marker.ts` | Modify — Prod-Guard (deckt alle 4 Endpunkte) | 40 · 600 (.ts, nicht-baselined) → 560 |
| `website/src/lib/e2e-marker.test.ts` | Modify — Prod-Guard-Test | n/a (Test, kein S1-Gate-Risiko; weit unter Limit) |
| `website/src/lib/questionnaire-db/queries.ts` | Modify — `listQTemplates()` um `dimension_count` erweitern | 439 · 600 (.ts, nicht-baselined) → 161 |
| `website/src/lib/questionnaire-db/types.ts` | Modify — `dimension_count` an `QTemplate` | klein · 600 → groß |
| `website/src/lib/questionnaire-db/queries.test.ts` | Modify — `dimension_count`-Assertion | Test |
| `website/src/components/admin/AdminSidebarNav.astro` | Modify — Items + Werkstatt-Akkordeon | 104 · 400 (.astro, nicht-baselined) → 296 |
| `website/src/components/admin/AdminShortcuts.svelte` | Modify — Infrastruktur-Gruppe | 311 · 500 (.svelte, nicht-baselined) → 189 |
| `website/src/pages/admin.astro` | Modify — `isKore` an AdminShortcuts | 156 · 400 (.astro, nicht-baselined) → 244 |
| `website/src/pages/admin/content-db.astro` | New — Server-Aggregation + Shell | neu, Ziel < 200 (.astro Limit 400) |
| `website/src/components/admin/ContentDb.svelte` | New — Filter-Pills + Tabelle | neu, Ziel < 250 (.svelte Limit 500) |
| `website/src/components/admin/__tests__/content-db-merge.test.ts` _(oder bestehende lib-Testdatei)_ | New/Modify — Aggregations-Helper-Test | Test |
| `scripts/cleanup-test-inbox.sh` | New — einmaliger DB-Cleanup | neu (.sh Limit 500), Ziel < 60 |
| `Taskfile.yml` | Modify — `db:cleanup-test-inbox` Task (S4-Orphan-Guard) | n/a |

**Quality-Gate-Notizen (verbindlich):**
- **S1:** Keine der Zieldateien ist gebaselined (`docs/code-quality/baseline.json`, 28 Keys — keiner trifft diese Dateien). Wirksame Schwelle = statisches Extension-Limit. Alle Änderungen bleiben deutlich unter ~80 % → **kein Split nötig**. Baseline-Key-Count bleibt unverändert (keine neuen Baseline-Einträge).
- **CQ02 (`any`):** Ist-Zählung global = **154** (Limit 200). Aller neuer Code ist vollständig typisiert (`ContentEntry`-Interface, getypte DB-Returns). **Kein** `: any` / `<any>` / `as any` wird eingeführt → Zählung bleibt 154.
- **S2:** Content-DB-Aggregation nutzt bestehende, zyklenfreie Lib-Module (`questionnaire-db`, `coaching-db`, `documents-db`) — kein neuer Import-Zyklus. Der Aggregations-Helper ist ein pures Modul ohne Rück-Import auf DB-Schicht.
- **S3:** Keine Brand-Domain-Literale; externe Links (Systembrett) kommen weiter aus der `brettUrl`-Prop, nicht hardcodiert.
- **S4:** `scripts/cleanup-test-inbox.sh` wird über einen neuen `Taskfile.yml`-Task `db:cleanup-test-inbox` erreichbar gemacht (sonst Orphan-Violation).

**Architektur-Entscheidungen / bewusste Abweichungen von der Design-Spec:**
1. **Prod-Guard zentral statt 4× dezentral.** Die Endpunkte `/api/contact`, `/api/booking`, `/api/bug-report`, `/api/portal/messages` rufen alle denselben Helper `isE2ETestRequest(request)` aus `e2e-marker.ts` auf. Ein einziger `NODE_ENV === 'production'`-Guard im Helper erfüllt die `chat-inbox`-Requirement (`is_test_data` in Prod immer `false`) für alle vier Endpunkte — Single Source of Truth, bereits getestet via `e2e-marker.test.ts`. Die vier Endpunkt-Dateien werden **nicht** angefasst (keine Verhaltensänderung dort nötig).
2. **`listQTemplates()` existiert bereits** (`questionnaire-db/queries.ts:47`) mit Modul-Pool-Konvention (kein `pool`-Argument). Statt die Signatur auf `listQTemplates(pool)` zu brechen (würde Bestandscaller wie `coaching-publish.ts` brechen), wird die bestehende Funktion **additiv** um ein `dimension_count`-Feld (Subquery) erweitert. Das `name`-Feld der Requirement entspricht dem vorhandenen `title`. Beobachtbares Verhalten (Templates mit `id`, `name`/`title`, `dimension_count`, `created_at`) ist damit erfüllt; Modul-Pool-Konvention bleibt gewahrt.
3. **Content-DB aggregiert serverseitig** im `.astro`-Frontmatter via `Promise.all([listQTemplates(), listTemplates(pool, {}), listDocumentTemplates()])`. Das vermeidet drei neue API-Endpunkte und die damit verbundenen `any`-Risiken. `ContentDb.svelte` macht nur clientseitiges Filtern. Die Design-Spec-Quelle „`website-db.ts → listTemplates()`" ist faktisch `coaching-db.ts → listTemplates(pool, filter)`; „Verträge via DocuSeal API" ist faktisch `documents-db.ts → listDocumentTemplates()` (derselbe Code hinter `/api/admin/documents/templates`).

---

## Task 1: Prod-Guard im zentralen E2E-Marker (TDD, rot→grün)

Verhindert dauerhaft, dass `X-E2E-Test`-Requests in Production `is_test_data=true` setzen — über den gemeinsamen Helper, der von allen vier Form-Endpunkten genutzt wird.

**target_files:**
- `website/src/lib/e2e-marker.ts`
- `website/src/lib/e2e-marker.test.ts`

**Steps:**
1. - [x] **Failing test zuerst.** In `e2e-marker.test.ts` einen neuen `it`-Block ergänzen: setzt `process.env.NODE_ENV = 'production'` und gültige Header (`X-E2E-Test: '1'`, korrekter `X-Cron-Secret`), erwartet `isE2ETestRequest(req) === false`. `NODE_ENV` in `afterEach` wiederherstellen (analog zum bestehenden `CRON_SECRET`-Restore-Muster).
   - Run: `cd website && npx vitest run src/lib/e2e-marker.test.ts`
   - `expected: FAIL` (der Guard existiert noch nicht — Prod gibt aktuell `true` zurück).
2. - [x] **Guard implementieren.** In `isE2ETestRequest` als **erste** Zeile: `if (process.env.NODE_ENV === 'production') return false;`. Den Kommentarkopf von `e2e-marker.ts` um eine Zeile ergänzen, die den fail-closed-Prod-Guard dokumentiert.
3. - [x] Re-run: `cd website && npx vitest run src/lib/e2e-marker.test.ts` → `expected: PASS`.
4. - [x] Sicherstellen, dass die bestehenden Dev/Test-Szenarien weiterhin grün sind (kein `NODE_ENV=production` in deren Setup → unverändert `true`).

**acceptance_criteria:**
- In `NODE_ENV=production` liefert `isE2ETestRequest` immer `false`, auch bei gültigem Header-Paar.
- In Dev/Test bleibt das Verhalten unverändert (`true` bei gültigem `X-E2E-Test` + `X-Cron-Secret`).
- Alle vier Endpunkte (`/api/contact`, `/api/booking`, `/api/bug-report`, `/api/portal/messages`) erben den Guard ohne eigene Änderung.
- `chat-inbox`-Spec-Szenarien „Header in Prod ignoriert" und „Header funktioniert in Dev/Test" erfüllt.

---

## Task 2: `listQTemplates()` um `dimension_count` erweitern

Exponiert die für die Content-DB benötigten Felder, ohne die bestehende Signatur zu brechen.

**target_files:**
- `website/src/lib/questionnaire-db/types.ts`
- `website/src/lib/questionnaire-db/queries.ts`
- `website/src/lib/questionnaire-db/queries.test.ts`

**Steps:**
1. - [x] **Failing test zuerst.** In `queries.test.ts` (oder dem nächstgelegenen Template-Test) eine Assertion ergänzen: `listQTemplates()` liefert Objekte mit numerischem `dimension_count`. Falls dort eine echte DB nötig ist und der Test integrationsgebunden läuft, stattdessen den Aggregations-Mapper isoliert testen — primär ist Schritt 1 von Task 5 der harte rot→grün-Punkt; dieser Test ist additiv.
2. - [x] `QTemplate` in `types.ts` um `dimension_count: number;` erweitern.
3. - [x] In `queries.ts` das `SELECT` von `listQTemplates()` um eine korrelierte Subquery erweitern:
   `(SELECT COUNT(*)::int FROM questionnaire_dimensions d WHERE d.template_id = t.id) AS dimension_count`
   (exakter Tabellen-/Spaltenname aus `schema.ts` verifizieren; Alias `t` einführen). `ORDER BY created_at DESC` beibehalten.
4. - [x] Run: `cd website && npx vitest run src/lib/questionnaire-db/queries.test.ts`.

**acceptance_criteria:**
- `listQTemplates()` behält die argumentlose Signatur (Modul-Pool) — kein Bestandscaller bricht.
- Rückgabeobjekte enthalten `id`, `title` (= `name`), `dimension_count` (number), `created_at`.
- `questionnaire-system`-Spec „Templates abrufbar" erfüllt.

---

## Task 3: Sidebar umstrukturieren + Werkstatt-Akkordeon

Reduziert die Sidebar und gruppiert die Werkstatt-Tools hinter einem framework-freien Akkordeon.

**target_files:**
- `website/src/components/admin/AdminSidebarNav.astro`

**Steps:**
1. - [x] **Geschäft-Sektion:** Items `Mitglieder` (`/admin/members`), `Mandate` (`/admin/projekte`), `Kontierung` (`/admin/buchhaltung`) aus dem `navSections`-Array entfernen. `Sitzungen` ersetzen durch `{ href: '/admin/coaching/studio', label: 'Studio', icon: 'clipboard', matches: ['/admin/coaching/studio', '/admin/coaching/sessions', '/admin/fragebogen'] }`. Verbleibend: Klienten, Studio, Fakturierung.
2. - [x] **Infrastruktur-Sektion:** Items `Plattform Hub`, `Dev Status`, `DORA`, `Repo Health` (inkl. des `!isKore`-Spread) entfernen. Verbleibend: Einstellungen, Systembrett (extern), Live-Stream.
3. - [x] **Werkstatt-Akkordeon:** Die Werkstatt-Sektion zu einer aufklappbaren Gruppe umbauen. Das `items`-Array der Werkstatt um `{ href: '/admin/content-db', label: 'Content-DB', icon: 'layout' }` ergänzen (9 Items total). Render-Logik: Werkstatt erhält einen Header-Button (Label „Werkstatt" + Pfeil-Icon) statt `sidebar-group-label`; die Sub-Items in einen Container `<div class="werkstatt-items" id="werkstatt-items">` wrappen.
4. - [x] **Serverseitiger Default-State:** Im Frontmatter `const werkstattActive = werkstattItems.some(i => isActive(i.href, i.matches));` berechnen. Container ohne `is-collapsed`-Klasse rendern wenn `werkstattActive`, sonst mit. Button erhält `aria-expanded={werkstattActive}`.
5. - [x] **Toggle ohne Svelte:** Ein `<script>`-Block (kein `client:`-Island) am Dateiende: Click-Listener auf den Werkstatt-Button, der `classList.toggle('is-collapsed')` auf `#werkstatt-items` und `aria-expanded` umschaltet. CSS-Regel `.werkstatt-items.is-collapsed { display: none; }` ergänzen (inline `<style>` oder bestehende Sidebar-Styles).
6. - [x] Generische `navSections.map`-Schleife so anpassen, dass die Werkstatt-Sektion über den Button-Pfad gerendert wird (Sektion per `label === 'Werkstatt'` oder `accordion: true`-Flag erkennen), die anderen Sektionen unverändert.

**acceptance_criteria:**
- Sidebar zeigt: Dashboard/Cockpit/Postfach · Geschäft(Klienten/Studio/Fakturierung) · Werkstatt(Akkordeon, 9 Sub-Items) · Infrastruktur(Einstellungen/Systembrett/Live-Stream).
- Mitglieder, Mandate, Kontierung, Plattform Hub, Dev Status, DORA, Repo Health sind **nicht** als direkte Links sichtbar.
- Akkordeon startet zugeklappt, außer der aktive Pfad matcht ein Werkstatt-Sub-Item (z. B. `/admin/inhalte`, `/admin/content-db`) → startet aufgeklappt.
- Klick auf „Werkstatt" togglet die Sub-Item-Sichtbarkeit; **kein** Svelte-Hydrations-Script für das Akkordeon.
- `website-core`- und `admin-nav-accordion`-Spec-Szenarien erfüllt.

---

## Task 4: Dashboard-Shortcuts — Infrastruktur-&-Dev-Gruppe

Verschiebt die Dev-/Infra-Einstiege aus der Sidebar auf das Dashboard.

**target_files:**
- `website/src/components/admin/AdminShortcuts.svelte`
- `website/src/pages/admin.astro`

**Steps:**
1. - [x] In `AdminShortcuts.svelte` die Props um `isKore: boolean` erweitern (`let { links: initialLinks, isKore = false }: { links: Shortcut[]; isKore?: boolean } = $props();`).
2. - [x] Eine statische, getypte Konstante `infraLinks: { url: string; label: string }[]` definieren: Plattform Hub (`/admin/platform`), Dev Status (`/dev-status`), DORA (`/admin/dora`), und — nur wenn `!isKore` — Repo Health (`/admin/repohealth`). Repo Health via `$derived`/Filter aus `isKore` ableiten, nicht hardcodiert einfügen.
3. - [x] Unterhalb des bestehenden „Eigene Links"-Grids (vor dem schließenden `</div>` der Komponente) eine neue Gruppe rendern: Überschrift „Infrastruktur & Dev" (gleiches `text-xs font-semibold ... uppercase`-Pattern wie „Eigene Links") + ein `grid`, das `infraLinks` als Karten im bestehenden Card-Pattern (`<a class="flex flex-col items-center ...">`) ausgibt. Keine Favicon-Fetches — statische Inline-SVG-Icons oder Label genügen.
4. - [x] In `admin.astro` den `<AdminShortcuts client:load links={shortcuts} />`-Aufruf um `isKore={isKore}` erweitern. Prüfen, ob `isKore` im Frontmatter bereits verfügbar ist; falls nicht, aus dem bestehenden Brand-Resolver (wie in `AdminSidebarNav`-Aufrufkontext) ableiten und als Prop durchreichen.

**acceptance_criteria:**
- `/admin` zeigt eine Gruppe „Infrastruktur & Dev" mit Karten Plattform Hub, Dev Status, DORA (immer) und Repo Health (nur mentolder/`!isKore`).
- Auf korczewski (`isKore === true`) fehlt die Repo-Health-Karte.
- Karten folgen dem bestehenden Shortcut-Card-Pattern und sind responsive (gleiche Breakpoints).
- Keine neue `any`-Verwendung.

---

## Task 5: Content-DB-Seite (`/admin/content-db`)

Aggregierte Übersicht der drei schriftlichen Content-Typen, serverseitig gemerged.

**target_files:**
- `website/src/pages/admin/content-db.astro` (New)
- `website/src/components/admin/ContentDb.svelte` (New)
- `website/src/components/admin/__tests__/content-db-merge.test.ts` (New, oder bestehende lib-Testdatei erweitern)

**Steps:**
1. - [x] **Failing test zuerst (rot→grün).** Aggregations-Logik als pures, getyptes Helper-Modul kapseln (z. B. `mergeContentEntries(qTemplates, vorlagen, contracts): ContentEntry[]` — entweder als kleine exportierte Funktion in `ContentDb.svelte`'s Begleit-`.ts` oder inline-exportiert). In `content-db-merge.test.ts` testen: Eingabe je ein Element pro Quelle → Ausgabe enthält drei `ContentEntry` mit korrekten `type`-Badges (`questionnaire` | `vorlage` | `vertrag`), gemapptem `title` und `detailHref`.
   - Run: `cd website && npx vitest run src/components/admin/__tests__/content-db-merge.test.ts`
   - `expected: FAIL` (Helper existiert noch nicht).
2. - [x] Helper implementieren mit explizitem Interface:
   `interface ContentEntry { type: 'questionnaire' | 'vorlage' | 'vertrag'; id: string; title: string; status?: string; meta?: string; createdAt?: string; detailHref: string; }`
   Mapping: Fragebögen → `title`, `meta = '${dimension_count} Dimensionen'`, `detailHref = '/admin/coaching/studio'` (oder Template-Detail); Vorlagen → `title = surfaceRef ?? snippetId`, `status`, `meta = 'v${version}/${targetSurface}'`, `detailHref = '/admin/knowledge/templates'`; Verträge → `title`, `detailHref = '/admin/dokumente'`.
   - Re-run → `expected: PASS`.
3. - [x] **`content-db.astro` (Server-Shell):** Frontmatter nach dem Muster von `admin/knowledge/templates/index.astro`: `getSession`/`isAdmin`-Guard + Redirect, `pool` aus `../../lib/website-db`. Daten via `Promise.all([listQTemplates(), listTemplates(pool, {}), listDocumentTemplates()])` (jeweils in `try/catch` mit `[]`-Fallback, analog Bestandsseite). `mergeContentEntries(...)` aufrufen, Ergebnis als Prop an `<ContentDb client:load entries={entries} />`. In `AdminLayout` mit `AdminPageHeader` einbetten.
4. - [x] **`ContentDb.svelte`:** Props `entries: ContentEntry[]`. Filter-Pills „Alle/Fragebögen/Vorlagen/Verträge" via `$state`-Selektor; gefilterte Tabelle (Typ-Badge, Titel, Status, Meta) mit Links zu `entry.detailHref`. Kein Edit-/Create-Flow. Bestehende Admin-Tabellen-/Badge-Styles wiederverwenden.

**acceptance_criteria:**
- `/admin/content-db` ist admin-geschützt und listet Einträge aus allen drei Quellen mit Typ-Badge.
- Filter-Pills zeigen jeweils nur den gewählten Typ; „Alle" zeigt die gemergte Liste.
- Klick auf einen Eintrag navigiert zur jeweiligen Detail-Page.
- Daten werden serverseitig parallel (`Promise.all`) geladen; keine neuen API-Endpunkte, kein DB-Schema-Change, keine neue `any`-Verwendung.
- `admin-content-db`-Spec-Szenarien erfüllt.

---

## Task 6: Einmaliger Test-Inbox-Cleanup-Script + Taskfile-Hook

Räumt bestehende `is_test_data=true`-Rows aus dem Prod-Postfach und macht das Script gate-konform erreichbar.

**target_files:**
- `scripts/cleanup-test-inbox.sh` (New)
- `Taskfile.yml`

**Steps:**
1. - [x] `scripts/cleanup-test-inbox.sh` anlegen: `set -euo pipefail`, Header-Kommentar (Zweck + Einmal-Charakter + Aufruf via `task db:cleanup-test-inbox`). Führt gegen die Ziel-DB aus:
   `DELETE FROM bachelorprojekt.inbox_items WHERE is_test_data = true;` und gibt die Anzahl gelöschter Zeilen aus (`RETURNING` / `GET DIAGNOSTICS` oder `psql`-`DELETE n`-Output). Verbindung über bestehende Env-/`kubectl exec … psql`-Konvention der Repo-Scripts (kein hardcodierter Host, keine Klartext-Credentials). Idempotent (zweiter Lauf löscht 0 Zeilen).
2. - [x] `chmod +x scripts/cleanup-test-inbox.sh`.
3. - [x] In `Taskfile.yml` einen Task `db:cleanup-test-inbox` ergänzen (`desc:` + `cmds: [bash scripts/cleanup-test-inbox.sh]`), damit das Script nicht als S4-Orphan gilt.

**acceptance_criteria:**
- Script ist ausführbar, idempotent, ohne Brand-Domain-Literal/Klartext-Credentials.
- `task db:cleanup-test-inbox` ruft das Script auf → S4-Orphan-Gate erfüllt.
- Migrationsschritt der Design-Spec (Cleanup vor erstem Prod-Deploy) ist abgedeckt.

---

## Task 7: Verifikation & Freshness (Abschluss)

Alle CI-Gates lokal grün stellen, bevor die PR aufgemacht wird.

**target_files:** _(keine — reiner Verifikations-Task)_

**Steps:**
1. **Test-Inventar** (neue Test-Dateien wurden angelegt): `task test:inventory` ausführen und `website/src/data/test-inventory.json` mitcommitten.
2. **Gezielte Tests:**
   ```bash
   task test:changed
   ```
   Muss grün sein (vitest `--changed`: `e2e-marker.test.ts`, `queries.test.ts`, `content-db-merge.test.ts` + BATS-Selektion + `quality:check`).
3. **CQ02 `any`-Check** (darf 200 nicht überschreiten, Soll ≤ 154):
   ```bash
   bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
   ```
4. **Astro-Typecheck** der geänderten Frontend-Dateien: `cd website && npx astro check` (bzw. `npm run check`) — keine neuen Typfehler.
5. **Freshness regenerieren & prüfen:**
   ```bash
   task freshness:regenerate
   task freshness:check
   ```
   `freshness:check` enthält den S1–S4-Ratchet (`quality:check`) + Baseline-Key-Count-Assertion gegen main — Baseline darf nicht wachsen (es wurden keine Baseline-Einträge hinzugefügt).
6. **OpenSpec-Validierung:** `task openspec:validate` (fail-closed Gate für die Change-Specs).

**acceptance_criteria:**
- `task test:changed` grün.
- `task freshness:regenerate` erzeugt keine uncommitteten Restdiffs (alles committet).
- `task freshness:check` grün (S1–S4 + Baseline-Assertion).
- `any`-Zählung ≤ 200 (unverändert 154).
- `task openspec:validate` grün.
