---
title: "feature-product-linking — Implementation Plan"
ticket_id: T002016
domains: [website, db, ops, test, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# feature-product-linking — Implementation Plan

_Ticket: T002016 · Design-Spec: `docs/superpowers/specs/2026-07-21-feature-product-linking-design.md`_

Baut eine lebende Produkt-Taxonomie (7 aktive `type='project'`-Tickets je Brand), verlinkt alle
301 bestehenden parentless Features per einmaligem idempotentem Backfill und ergänzt einen
`product_id`-Parameter im Ticket-Erstellungspfad (CLI + ticket-mcp) plus einen Konsistenz-Fix im
Admin-API. Reihenfolge folgt dem Design-Spec-Abschnitt „Task-Reihenfolge".

## File Structure

| Datei | Ist-Zeilen | S1-Budget (wirksame Schwelle) |
|-------|-----------|-------------------------------|
| `scripts/one-shot/2026-07-21-feature-product-backfill.mjs` (neu) | 0 | 500 (`.mjs`-Limit) |
| `scripts/one-shot/2026-07-21-feature-product-backfill-mapping.json` (neu) | 0 | — (Datendatei, nicht S1-gedeckt) |
| `scripts/vda/ticket/create.sh` | 103 | 397 (`.sh`-Limit 500 − 103) |
| `scripts/vda/ticket/_ticket-core.sh` | 50 | 450 (`.sh`-Limit 500 − 50) |
| `scripts/vda/ticket/set-parent.sh` (neu) | 0 | 500 (`.sh`-Limit) |
| `scripts/ticket.sh` | 843 | s1.ignore (sanktionierte Ausnahme, kein Budget) |
| `scripts/ticket-mcp/go/internal/tools/workflow.go` | 246 | n/a (`.go` nicht S1-gedeckt) |
| `scripts/ticket-mcp/go/internal/tools/planning.go` | 237 | n/a (`.go` nicht S1-gedeckt) |
| `website/src/lib/tickets/admin.ts` | 632 | **0** (baselined 632 = Ist 632) |
| `website/src/lib/tickets/admin.test.ts` | 538 | 62 (`.ts`-Limit 600 − 538) |
| `tests/spec/feature-product-linking.bats` (neu) | 0 | n/a (`.bats` nicht S1-gedeckt) |

**Budget-0-Auflage `admin.ts`:** Die Änderung MUSS **net-zeilenneutral** sein. Die bestehende
7-zeilige `parentId`-Validierung (Zeilen 423–429) wird *in-place ersetzt* (Brand- **und**
`type='project'`-Check in denselben Zeilenrahmen), kein Wachstum. Sollte die Validierung dabei
länger werden, wird sie in einen kleinen Helper `assertParentIsProject()` **extrahiert** (extract),
sodass `admin.ts` nicht über 632 Zeilen wächst — kein kosmetisches Zeilen-Zusammenziehen.

<!-- vitest: admin.ts-Änderung ist logikrelevant → neuer Vitest-Fall in admin.test.ts (Task 4) -->

## Task 1 — Produkt-Taxonomie + Backfill-Apply-Skript-Gerüst

Neues Skript `scripts/one-shot/2026-07-21-feature-product-backfill.mjs`, Vorbild
`scripts/migrate-projects-to-tickets.mjs` (Node/mjs, `--dry-run` default, `--apply`-Flag,
idempotent, `TRACKING_DB_URL`-basierter `pg`-Client).

- [x] **Taxonomie-Konstante** definieren: 7 Slugs je Brand — `website`, `infra`, `ai-factory`,
      `ticket-system`, `auth-security`, `dev-tooling`, `sonstiges` — mit menschenlesbaren Titeln
      (Website, Infra/Deployment, AI/Software-Factory, Ticket-System/Cockpit, Auth/Security/DSGVO,
      Dev-Tooling, Sonstiges/Unklassifiziert). Slugs sind der stabile Join-Key zur Mapping-Datei.
- [x] **Lookup-or-create** je Brand (`mentolder`, `korczewski`): pro Slug ein `type='project'`,
      `status='in_progress'`-Ticket. Lookup per `(brand, title)` — existiert es, wird die UUID
      wiederverwendet; sonst INSERT. Idempotent: zweiter Lauf legt nichts Neues an.
- [x] `--dry-run` (default) druckt geplante Creates/Updates ohne Schreibzugriff; `--apply` führt
      sie in einer Transaktion aus. Zusammenfassung am Ende: `created N projects, linked M features`.
- [x] Kopf-Kommentar mit Verwendung (`node scripts/one-shot/…mjs` / `--apply`), damit S4-Orphan
      nicht greift; zusätzliche Erreichbarkeit über die BATS-Datei aus Task 3.

## Task 2 — Mapping-Datei generieren (Klassifizierung der Bestandsfeatures)

Einmaliger, zur Implementierungszeit erzeugter Datensatz (kein Live-LLM-Call im Skript).

- [x] Alle parentless Features lesen (read-only, über `mcp-postgres` oder psql-Helper):

      ```bash
      SELECT external_id, brand, title, areas
      FROM tickets.tickets
      WHERE type='feature' AND parent_id IS NULL
      ORDER BY brand, external_id;
      ```

- [x] Je Ticket genau einen der 7 Slugs zuordnen (Titel- + `areas`-Heuristik). Nicht eindeutig
      oder niedrig-konfident → `product_slug: "sonstiges"` (kein Raten).
- [x] Output `scripts/one-shot/2026-07-21-feature-product-backfill-mapping.json` als Array von
      `{ external_id, brand, product_slug, confidence }`. Erwartete Größenordnung: 297 mentolder +
      4 korczewski = 301 Einträge; jeder `external_id` genau einmal, jeder `product_slug` aus der
      7er-Liste.

## Task 3 — Backfill-Apply + Idempotenz-Test (RED → GREEN)

- [x] Apply-Logik im Skript vervollständigen: Mapping-Datei lesen, je Feature den Brand-passenden
      Produkt-Slug → UUID auflösen und
      `UPDATE tickets.tickets SET parent_id = $uuid WHERE external_id = $1 AND parent_id IS NULL`.
      Bereits gesetzte `parent_id` werden nie überschrieben.
- [x] Neue BATS-Datei `tests/spec/feature-product-linking.bats` mit einem Migrations-Block analog
      `tests/unit/tickets-projects-migration.bats` (skip ohne `TRACKING_DB_URL`, eigene Fixture-Rows
      mit deterministischen UUIDs, self-teardown):
  - [ ] **Failing-Test-Step (RED).** Test „second apply run is a no-op": legt Fixture-Feature +
        Produkt-Ticket + Mini-Mapping an, ruft das Skript zweimal mit `--apply` auf und prüft, dass
        der zweite Lauf 0 Zeilen ändert und `parent_id` unverändert bleibt. Auf dem aktuellen Branch
        existiert das Skript noch nicht → der `node …mjs`-Aufruf schlägt fehl.

        ```bash
        tests/unit/lib/bats-core/bin/bats tests/spec/feature-product-linking.bats
        # expected: FAIL (rot — Backfill-Skript ist noch nicht implementiert)
        ```

  - [ ] **Fix-Step (GREEN).** Skript-Apply-Logik implementieren; derselbe BATS-Lauf ist grün:
        alle vormals parentless Fixture-Features haben `parent_id` mit `type='project'` im selben
        Brand (0 Orphans), zweiter Lauf ist diff-frei.
- [x] Backfill real ausführen: erst `node scripts/one-shot/2026-07-21-feature-product-backfill.mjs`
      (dry-run sichten), dann `--apply` gegen die Ziel-DB. Ergebnis-Check:
      `SELECT count(*) FROM tickets.tickets WHERE type='feature' AND parent_id IS NULL` → nur noch
      absichtlich unverlinkte (idR 0 neue Lücken).

## Task 4 — API-Erweiterung `product_id` + Admin-Konsistenz-Fix + Unit-Tests (RED → GREEN)

- [x] **Shared Helper** `_resolve_product_id()` in `scripts/vda/ticket/_ticket-core.sh`: nimmt
      `product_id` (UUID oder `external_id`) + `brand`, führt
      `SELECT type, brand, id FROM tickets.tickets WHERE id::text = $1 OR external_id = $1` aus,
      gibt die UUID zurück oder failt (exit 2) bei: nicht gefunden, `type <> 'project'`
      ("product_id must reference a project ticket"), Brand-Mismatch.
- [x] **`scripts/vda/ticket/create.sh`**: neue Option `--product-id <uuid-or-external_id>` im
      Options-Parser (Zeile 13–25). Bei gesetztem Wert vor dem INSERT `_resolve_product_id` aufrufen,
      die UUID als `parent_id` in INSERT-Spaltenliste + VALUES (Zeile 55–56) einfügen
      (`NULLIF(:'parent','')::uuid`). Ohne `--product-id` bleibt `parent_id` NULL (unverändertes
      Verhalten).
- [x] **`scripts/vda/ticket/set-parent.sh`** (neu) + `cmd_set_parent`-Dispatcher in `scripts/ticket.sh`
      (sanctioned-ignore, kein Budget): `set-parent --id <external_id> --product-id <ref>` nutzt
      denselben `_resolve_product_id`-Helper und setzt `parent_id` per UPDATE. Genutzt von
      `prepare_feature`, damit die Validierung an genau einer Stelle lebt.
- [x] **`scripts/ticket-mcp/go/internal/tools/workflow.go`** (`create_ticket`): optionaler
      `mcp.WithString("product_id", …)`; im Handler an die `flag→key`-Map ergänzen
      (`"--product-id": "product_id"`), sodass er als `--product-id` an `ticket.sh create`
      durchgereicht wird.
- [x] **`scripts/ticket-mcp/go/internal/tools/planning.go`** (`prepare_feature`): optionaler
      `mcp.WithString("product_id", …)`; im Handler vor dem bestehenden `plan-meta set`-Aufruf
      `ticket.sh set-parent --id <id> --product-id <product_id>` ausführen, wenn `product_id != ""`.
- [x] **`website/src/lib/tickets/admin.ts`** Konsistenz-Fix (net-zeilenneutral, Budget 0): den
      `SELECT brand` in `createAdminTicket` (Zeile 424) um `type` erweitern und den Fehlerpfad um
      `row.type !== 'project'` → `throw new Error('createAdminTicket: parentId must reference a
      project ticket')` ergänzen, ohne die Zeilenzahl zu erhöhen (siehe Budget-0-Auflage oben).
- [x] **RED → GREEN Unit-Test** in `website/src/lib/tickets/admin.test.ts` (bestehende
      parentId-Fälle Zeile 268–290 erweitern, keine neue Datei):
  - [ ] **Failing-Test-Step (RED).** Vierter Fall „throws when parentId does not resolve to
        type='project'": `pool.query` mockt eine Zeile `{ brand: 'mentolder', type: 'task' }`;
        `createAdminTicket({ parentId })` muss werfen. Auf dem aktuellen Branch prüft `admin.ts`
        den `type` nicht → der Fall wirft nicht → Test rot.

        ```bash
        cd website && pnpm vitest run src/lib/tickets/admin.test.ts
        # expected: FAIL (rot — type-Check in createAdminTicket fehlt noch)
        ```

  - [ ] **Fix-Step (GREEN).** Nach dem `admin.ts`-Fix ist der Vitest-Fall grün.
- [x] **Offline-BATS** in `tests/spec/feature-product-linking.bats` (kubectl-Mock analog
      `tests/unit/ticket-create.bats`, ohne Live-Cluster):
  - [ ] `create --type feature … --product-id T000xxx` wird akzeptiert (nicht mehr
        „Unknown create option") und die captured SQL enthält `parent_id`.
  - [ ] Mock-Lookup liefert `task|mentolder` → `--product-id` schlägt mit
        „must reference a project ticket" fehl (falscher Type).
  - [ ] Mock-Lookup liefert `project|korczewski` bei `--brand mentolder` → Brand-Mismatch failt.

## Task 5 — Final Verification (Pflicht-Gates)

- [x] Test-Inventar regenerieren (neue BATS-/Vitest-Tests) und mitcommitten:

      ```bash
      task test:inventory
      git add website/src/data/test-inventory.json
      ```

- [x] Go-Tool-Build validieren (ticket-mcp): `cd scripts/ticket-mcp/go && go build ./...`
- [x] Die drei mandatory CI-Gates:

      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

- [x] Vor Commit: OpenSpec-Validierung grün — `bash scripts/openspec.sh validate`
      (bzw. `task test:openspec`).
