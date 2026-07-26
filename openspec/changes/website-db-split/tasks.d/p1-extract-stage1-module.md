# p1 — Extraktion Stage 1: `website-db-core.ts`

**Rolle:** impl
**target_files:** `website/src/lib/website-db.ts`, `website/src/lib/website-db-core.ts`

Extrahiert die erste funktionale Hälfte von `website-db.ts` (Ist 1939 Zeilen, `.ts`-Limit 600,
aber via `s1.ignore` in `docs/code-quality/gates.yaml` freigestellt "bis ≤600 Zeilen" — dieses
Partial muss die Datei NICHT unter 600 drücken, nur verkleinern; Stage 2/T002150 übernimmt den
Rest) nach dem exakten `billing-db.ts`-Muster (T001293): neues Modul mit den verschobenen
Funktionen, `website-db.ts` re-exportiert sie unter den alten Namen (`export { … } from
'./website-db-core';`, Vorbild Zeile 1736: `export { initBillingTables, initTaxMonitorTables,
initEurTables } from './billing-db';`). Kein Call-Site außerhalb von `website-db.ts` ändert seinen
Importpfad.

Alle Zeilenangaben sind gegen den aktuellen Stand von `website/src/lib/website-db.ts` in diesem
Worktree verifiziert (nicht geraten). Falls die Datei zwischen Planung und Umsetzung durch einen
anderen Change verändert wurde, vor Task 1.2 die Bereichsgrenzen per `grep -n '^export \(async
\)\?function\|^export interface\|^export type'` neu bestätigen, statt blind auf den Zeilenzahlen
zu bestehen.

**Budget-Rechnung `website-db-core.ts`** (neue Datei, `.ts`-Limit 600): die acht verschobenen
Abschnitte summieren sich auf 561 Zeilen reinen Body-Code (siehe Task-für-Task-Aufschlüsselung
unten); dazu kommt ein Datei-Banner + 4 Import-Zeilen (`pool`/`ensureSchemaOnce` aus `db-pool`,
`initTicketsSchema` aus `tickets-schema`, `transitionTicket` aus `tickets/transition`, `Customer`
(type-only) aus `customer-types`) — geschätzt **~574 Zeilen, Reserve ~26 Zeilen unter dem
600-Limit**. Das ist knapp, nicht "deutlich drunter" — nach Task 1.1–1.8 **zwingend** `wc -l
website/src/lib/website-db-core.ts` prüfen (Task 1.10); bei Überschreitung zuerst redundante
SQL-Kommentare straffen, bevor über einen weiteren Sub-Split nachgedacht wird (der wäre ohnehin
außerhalb des Stage-1-Scopes).

## Import-Zyklus-Analyse (Grundlage für REQ-WEBSITE-DB-SPLIT-002)

Geprüft: `db-pool.ts` (nur `pg`, `dns`), `tickets-schema.ts` (importiert u. a. `db-pool`,
`knowledge-db`, `schema/provider-config-schema`, `tickets/tables/*`, `tickets/migrations`),
`tickets/transition.ts` (importiert `../db-pool`, `./email-templates`, `./reporter-link`,
`../ticket-readiness`, `../logger`), `customer-types.ts` (keine Imports). **Keine dieser vier
Dateien importiert von `website-db.ts` oder `website-db-core.ts`** — sie sind allesamt
Blatt-/Leaf-Module relativ zu diesem Split. `website-db-core.ts` importiert ausschließlich aus
diesen vier Modulen und führt **keinen** Rück-Import von `website-db.ts` — Bedingung für S2
(import-Zyklus-Gate) ist damit strukturell erfüllt, nicht nur behauptet.

**Einzige gefundene Rückwärtsabhängigkeit** (kein Zyklus, aber ein Cross-Reference, der einen
expliziten Fix braucht): `listBugTickets` (bleibt in `website-db.ts`, Zeile ~1256, gehört zum
Abschnitt "Bug Ticket List" — nicht Teil dieses Partials) annotiert seinen Rückgabetyp als
`Promise<BugTicketRow[]>`. `BugTicketRow` zieht mit `getBugTicketWithComments` nach
`website-db-core.ts` um. Ein `export type { BugTicketRow } from './website-db-core';` reicht
NICHT, weil ein Re-Export keine lokale Bindung erzeugt, die `listBugTickets` im selben File nutzen
könnte — siehe Task 1.9 für den zusätzlichen `import type`.

Alle anderen verschobenen Symbole (Funktionsnamen + Typen `TimelineRow`, `PendingEnrollment`,
`BugTicketStatus`, `BugTicketComment`, `VacationPeriod`) wurden per
`grep -n '\bSYMBOL\b' website/src/lib/website-db.ts` gegen Verwendung *nach* Zeile 740 (= Stage-2-
Territorium) geprüft — keine weiteren Treffer. `transitionTicket` (Zeile 44) wird ausschließlich
von den drei verschobenen Bug-Ticket-Funktionen (`resolveBugTicket`, `archiveBugTicket`,
`reopenBugTicket`) genutzt und zieht komplett um; der Top-Level-Import in `website-db.ts` wird
entfernt (Task 1.9), da sonst ein ungenutzter Import zurückbleibt.

## Task 1.1 — `website-db-core.ts` anlegen (Banner + Imports)

Neu: `website/src/lib/website-db-core.ts`.

```ts
/**
 * website-db-core.ts — Stage 1 extraction (T002149)
 *
 * Extracted from website-db.ts: Timeline, Customer, Meeting-Assignment,
 * Bug-Tickets + Bug-Ticket-Comments, Site-Settings, Vacation/Blackout
 * Periods, Legal Pages. Pure move — no behavior changes. Re-exported from
 * website-db.ts under the original names so no external call site needs an
 * import-path change (same pattern as billing-db.ts, T001293).
 */
import { pool, ensureSchemaOnce } from './db-pool';
import { initTicketsSchema } from './tickets-schema';
import { transitionTicket } from './tickets/transition';
import type { Customer } from './customer-types';
```

Diese vier Imports decken alle acht folgenden Abschnitte ab — kein Abschnitt braucht einen
zusätzlichen externen Import.

## Task 1.2 — Timeline verschieben (Zeilen 71–158 in `website-db.ts`)

Ausschneiden aus `website-db.ts`: der Abschnittskommentar `// ── Timeline …` (Zeilen 71–75), das
`TimelineRow`-Interface (76–90) und `listTimeline` (92–158) — 88 Zeilen. Unverändert nach
`website-db-core.ts` einfügen: exakt gleicher Funktionskörper, exakt gleiche Signatur
(`listTimeline(opts: {...} = {}): Promise<TimelineRow[]>`), nutzt nur `pool` (bereits importiert).

## Task 1.3 — Customer verschieben (Zeilen 160–287)

Ausschneiden: Abschnittskommentar (160–163), `upsertCustomer` (168–190; die Zeile 165 `import
type { Customer } from './customer-types';` wird NICHT mitverschoben — `website-db-core.ts` hat
den Customer-Typ bereits über den Banner-Import aus Task 1.1), `PendingEnrollment`-Interface
(192–199), `listPendingEnrollments` (201–209), `declineEnrollment` (211–216),
`getCustomerFullById` (218–227), `getCustomerByKeycloakId` (229–237), `setCustomerNumber`
(239–260), `setAdminNumber` (262–283), `setIsAdmin` (285–287) — 128 Zeilen Body (ohne die nicht
mitgezogene Import-Zeile 165).

Zeile 166 (`export type { Customer } from './customer-types';`) bleibt **unverändert in
`website-db.ts` stehen** — sie ist bereits ein direkter Re-Export aus dem neutralen Leaf-Modul
`customer-types.ts` und hängt nicht von der (jetzt entfernten) lokalen Import-Zeile 165 ab.

Die Meeting-Re-Export-Blöcke (Zeilen 289–310, `export { initMeetingsDb, … } from './meetings-db';`
+ zugehörige `export type { Meeting, … }`) bleiben unverändert an ihrer Stelle in `website-db.ts`
stehen — sie sind bereits Re-Exports aus `meetings-db.ts`, nicht lokal definiert, also kein
Verschiebe-Kandidat.

## Task 1.4 — Meeting-Zuweisung verschieben (Zeilen 312–328)

Ausschneiden: `assignMeeting` (17 Zeilen). Ruft intern `upsertCustomer` auf (Zeile 319) — da
`upsertCustomer` in Task 1.3 in dieselbe Zieldatei zieht, bleibt der Aufruf ein lokaler
Same-File-Call in `website-db-core.ts`, kein Cross-Module-Import nötig.

## Task 1.5 — Bug Tickets + Bug Ticket Comments verschieben (Zeilen 330–543)

Zwei zusammenhängende Blöcke, gemeinsam verschieben (die zweite Gruppe hängt am privaten Helper
der ersten):

- **Bug Tickets** (330–440, 111 Zeilen): Abschnittskommentar, `insertBugTicket` (332–375), der
  **private** Helper `async function ticketIdByExternal(...)` (377–382, **kein** `export` —
  bleibt unexportiert, wird nur intern in `website-db-core.ts` gebraucht), `resolveBugTicket`
  (384–396), `archiveBugTicket` (398–407), `BugTicketStatus`-Interface (409–416),
  `getBugTicketStatus` (418–440).
- **Bug Ticket Comments** (442–543, 102 Zeilen): Abschnittskommentar, `BugTicketRow`-Interface
  (444–458), `BugTicketComment`-Interface (460–467), `getBugTicketWithComments` (469–512),
  `appendBugTicketComment` (514–529), `reopenBugTicket` (531–543).

`ticketIdByExternal` wird von `resolveBugTicket`, `archiveBugTicket` UND `reopenBugTicket`
aufgerufen (alle drei ziehen mit um) — bleibt als lokale, nicht exportierte Funktion in
`website-db-core.ts`, keine Sichtbarkeit außerhalb nötig, keine Re-Export-Zeile dafür.

Die "T001490: Content save stubs" (Zeilen 545–587, `saveServiceConfig` u.a.) liegen zwischen Bug
Ticket Comments und Site Settings, sind aber **nicht** Teil dieses Partials (nicht in der
Funktionsliste des Change) — bleiben unverändert in `website-db.ts` stehen.

## Task 1.6 — Site Settings verschieben (Zeilen 588–636)

Ausschneiden: Abschnittskommentar (588–593), `initSiteSettingsTable` (594–617), `getSiteSetting`
(619–626), `setSiteSetting` (628–636) — 49 Zeilen. Nutzt `ensureSchemaOnce` und `pool` (beide
bereits im Banner-Import aus Task 1.1).

**Cross-Referenz-Check:** `ensureSchemaOnce` wird in `website-db.ts` außerdem bei Zeile 1744
(`service_page_config`-Init, Stage-2-Territorium) verwendet — der Import in `website-db.ts` bleibt
deshalb bestehen (siehe Task 1.9), er wird nicht entfernt, nur zusätzlich in
`website-db-core.ts` dupliziert (kein Zyklus, `db-pool.ts` ist ein Leaf-Modul).

## Task 1.7 — Vacation/Blackout Periods verschieben (Zeilen 638–658)

Ausschneiden: Abschnittskommentar (638–642), `VacationPeriod`-Interface (643–648),
`getVacationPeriods` (650–654), `saveVacationPeriods` (656–658) — 21 Zeilen. Beide Funktionen
rufen `getSiteSetting`/`setSiteSetting` auf (aus Task 1.6, dieselbe Zieldatei) — lokaler
Same-File-Call.

Die "T001490: Content-Hub key constants" (660–678, `NAV_KEY` u.a.) und der `setJsonSetting`-Stub
(679–690) liegen zwischen Vacation/Blackout und Legal Pages, sind aber **nicht** Teil dieses
Partials — bleiben unverändert in `website-db.ts` stehen.

## Task 1.8 — Legal Pages verschieben (Zeilen 692–736)

Ausschneiden: Abschnittskommentar (692–698), `initLegalPagesTable` (699–717), `getLegalPage`
(719–726), `saveLegalPage` (728–736) — 45 Zeilen. Nutzt `ensureSchemaOnce` und `pool`.

Nach diesem Task ist `website-db-core.ts` inhaltlich vollständig (8 Abschnitte, 561 Body-Zeilen +
Banner/Imports aus Task 1.1).

## Task 1.9 — `website-db.ts` aufräumen: Re-Exports + Cross-Reference-Fix

1. **Ungenutzten Import entfernen:** Zeile 44 `import { transitionTicket } from
   './tickets/transition';` löschen — nach Task 1.5 hat `website-db.ts` keinen verbleibenden
   Aufrufer mehr.
2. **Ungenutzten Import entfernen:** Zeile 165 `import type { Customer } from
   './customer-types';` löschen (siehe Task 1.3) — Zeile 166 (`export type { Customer } from
   './customer-types';`) bleibt stehen und braucht diesen Import nicht.
3. **Cross-Reference-Fix (BugTicketRow):** unmittelbar vor `listBugTickets` (Zeile ~1256, bleibt
   in `website-db.ts`) einen neuen Import einfügen:

   ```ts
   import type { BugTicketRow } from './website-db-core';
   ```

   Ohne diesen Import kompiliert `listBugTickets(...): Promise<BugTicketRow[]>` nicht mehr, weil
   der `export type { BugTicketRow } from './website-db-core';` aus Schritt 5 unten nur ein
   Pass-Through-Re-Export ist und keine lokale Typ-Bindung im File erzeugt.
4. An der Stelle, wo bisher die acht Abschnitte standen (jetzt eine Lücke zwischen den
   unveränderten Nachbarn — den Content-save-Stubs am Anfang und `let timeEntriesReady = false;`
   am Ende), den Re-Export-Block einfügen, **exakt im `billing-db.ts`-Muster**
   (Vorbild Zeile 1736 in der Ausgangsdatei):

   ```ts
   // Timeline, Customer, Meeting-Assignment, Bug-Tickets + Bug-Ticket-Comments,
   // Site-Settings, Vacation/Blackout Periods und Legal Pages wurden nach
   // website-db-core.ts extrahiert (T002149 Stage 1). Re-Export für
   // Bestandskompatibilität — kein Call-Site-Import-Pfad ändert sich.
   export {
     listTimeline,
     upsertCustomer,
     listPendingEnrollments,
     declineEnrollment,
     getCustomerFullById,
     getCustomerByKeycloakId,
     setCustomerNumber,
     setAdminNumber,
     setIsAdmin,
     assignMeeting,
     insertBugTicket,
     resolveBugTicket,
     archiveBugTicket,
     getBugTicketStatus,
     getBugTicketWithComments,
     appendBugTicketComment,
     reopenBugTicket,
     initSiteSettingsTable,
     getSiteSetting,
     setSiteSetting,
     getVacationPeriods,
     saveVacationPeriods,
     initLegalPagesTable,
     getLegalPage,
     saveLegalPage,
   } from './website-db-core';
   export type {
     TimelineRow,
     PendingEnrollment,
     BugTicketStatus,
     BugTicketRow,
     BugTicketComment,
     VacationPeriod,
   } from './website-db-core';
   ```

   Getrennte `export {...}` / `export type {...}`-Blöcke sind Pflicht, nicht Stil: `verbatimModuleSyntax:
   true` in `website/tsconfig.json` erzwingt die Trennung von Value- und Type-Re-Exports (siehe
   bereits vorhandenes Beispiel Zeilen 291–310 im selben File für Meetings).

Bekannte externe Type-Only-Importer, die diese Re-Exports konkret brauchen (verifiziert per
`grep -rn` über `website/src`, nicht vermutet): `website/src/pages/admin/clients.astro` importiert
`PendingEnrollment` von `'../../lib/website-db'`; `website/src/pages/api/admin/urlaub/save.ts` und
`website/src/pages/admin/termine.astro` importieren `VacationPeriod` von dort. Beide bleiben nach
diesem Task unverändert funktionsfähig.

## Task 1.10 — Verifikation: Zeilenzahlen, Typecheck, Zyklus-Gate

```bash
wc -l website/src/lib/website-db.ts website/src/lib/website-db-core.ts
# website-db.ts erwartet: ~1939 - 561 (verschobener Body) + ~35 (Re-Export-Block)
#   - 2 (entfernte Imports) ≈ 1411 Zeilen (Trend: kleiner, kein hartes Ziel für dieses Partial)
# website-db-core.ts erwartet: ~574 Zeilen (siehe Budget-Rechnung oben) — MUSS ≤600 sein (S1,
#   neue Datei, kein Baseline-Puffer)

cd website && pnpm astro check 2>&1 | grep -i "website-db" || true
cd website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "website-db" || true

node scripts/code-quality/gates/s2-cycles.mjs
# erwartet: kein neuer Zyklus zwischen website-db.ts, website-db-core.ts, billing-db.ts
```

Der Typecheck muss insbesondere den Task-1.9-Schritt 3 (BugTicketRow-Import) bestätigen — ein
fehlender Import dort erzeugt einen konkreten TS2304-Fehler (`Cannot find name 'BugTicketRow'`) in
`listBugTickets`. Die Tests für dieses Partial (RED→GREEN-Failing-Test-Step, `expected: FAIL`)
gehören zum abhängigen Test-Partial `p2` (`tasks.d/p2-tests.md`, `depends_on: p1` laut
Partials-Manifest in `tasks.md`) — dieses Partial (p1, Rolle `impl`) liefert die reine
Code-Bewegung, auf der p2 seine Tests aufsetzt.
