---
title: "p1 — GitHub identity schema"
ticket_id: T900159
domains: [database, ticket-system]
status: pending
depends_on: [p3]
---

# p1 — GitHub identity schema

Partial von `github-identity-foundation` (I#5588 / T900159) · Rolle: impl ·
Zieldateien ausschließlich
`components/website/src/lib/tickets/tables/github-identities.ts` und
`components/website/src/lib/tickets-schema.ts`.

## Gate-Baseline und Grenzen

| Datei | Ist | Budget |
| --- | ---: | ---: |
| `components/website/src/lib/tickets/tables/github-identities.ts` | 0 | 900 |
| `components/website/src/lib/tickets-schema.ts` | 59 | 841 |

Beide Dateien sind nicht in `docs/code-quality/baseline.json` gebaselined; damit ist das
aktuelle `.ts`-Limit 900 aus `docs/code-quality/gates.yaml` die wirksame Schwelle. Das neue
Schema-Modul soll höchstens 360 Zeilen belegen und damit deutliche Wachstumsreserve behalten.
`tickets-schema.ts` erhält netto genau Import plus Initialisierungsaufruf und bleibt weit unter
80 % seiner Schwelle; ein Split ist dort nicht nötig. CQ02-Ausgangswert ist 0 explizite
`any`-Verwendungen in `components/website/src`; dieser Partial führt keine ein. Es entstehen
keine Hostnamen (S3), Skripte/Manifeste (S4) oder Rückimporte aus DB-Code in höhere Schichten
(S2).

## Task 1: Additives Schema-Modul anlegen

**File:** Create `components/website/src/lib/tickets/tables/github-identities.ts`

Exportiere exakt diese Signatur und verwende ausschließlich `Pool | PoolClient` aus `pg`:

```ts
import type { Pool, PoolClient } from 'pg';

export async function applyGitHubIdentitySchema(pool: Pool | PoolClient): Promise<void>
```

Die Funktion führt ausschließlich idempotente DDL aus (`CREATE TABLE IF NOT EXISTS`,
`CREATE [UNIQUE] INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` sowie
`DROP TRIGGER IF EXISTS` direkt gefolgt von `CREATE TRIGGER`). Sie liest oder migriert keine
Legacy-Tickets, erzeugt keine Bindings und verändert weder `external_id` noch bestehende
Ticket-/PR-Tabellen.

### 1.1 `tickets.github_objects`

Lege die Objektidentität mit folgenden Spalten und benannten Constraints an:

| Spalte | SQL-Typ / Default | Semantik |
| --- | --- | --- |
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | lokaler, unsichtbarer FK-Anker |
| `github_node_id` | `TEXT NOT NULL` | opaker, global stabiler GitHub-Node-ID |
| `kind` | `TEXT NOT NULL` | `issue`, `pull_request` oder `advisory` |
| `provider_ref` | `TEXT` | provider-native ID; nur für Advisories, z. B. `GHSA-…` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Zeitpunkt der lokalen Registrierung |

Constraints/Indizes:

- `github_objects_node_id_uq UNIQUE (github_node_id)`; leere bzw. nur aus Whitespace
  bestehende Node-IDs werden durch `github_objects_node_id_nonempty` abgewiesen.
- `github_objects_kind_check CHECK (kind IN ('issue','pull_request','advisory'))`.
- `github_objects_provider_ref_kind_check` verlangt für `kind = 'advisory'` eine nichtleere
  provider-native Referenz und verlangt für `issue`/`pull_request` `provider_ref IS NULL`.
- `github_objects_provider_ref_format_check` akzeptiert bei vorhandenem Wert nur das
  case-insensitive GitHub-Format
  `^GHSA-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}-[23456789CFGHJMPQRVWX]{4}$`.
- Der partielle Unique-Index `github_objects_provider_ref_uq` auf
  `lower(provider_ref) WHERE provider_ref IS NOT NULL` macht die provider-native Referenz
  innerhalb des durch die Tabelle festgelegten Providers GitHub eindeutig und verhindert
  Groß-/Kleinschreibungs-Dubletten.

Installiere `tickets.fn_guard_github_object_identity()` als `BEFORE UPDATE`-Triggerfunktion.
Sie wirft bei jeder Änderung von `github_node_id`, `kind` oder `provider_ref` eine Exception;
nur die unveränderliche Objektzeile darf referenziert werden. Ein separates `provider`-Feld
wird bewusst nicht eingeführt: diese Tabelle ist GitHub-spezifisch, daher entspricht globale
`provider_ref`-Eindeutigkeit hier der Eindeutigkeit innerhalb des Providers.

### 1.2 `tickets.github_object_coordinates`

Lege nummerierte Repository-Koordinaten getrennt von der Objektidentität an:

| Spalte | SQL-Typ / Default | Semantik |
| --- | --- | --- |
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | lokale Koordinatenzeile |
| `github_object_id` | `UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT` | stabiles Objekt |
| `repository_node_id` | `TEXT NOT NULL` | opake stabile GitHub-Repository-ID |
| `repository_owner` | `TEXT NOT NULL` | historischer Display-Snapshot |
| `repository_name` | `TEXT NOT NULL` | historischer Display-Snapshot |
| `object_number` | `INTEGER NOT NULL` | positive Issue-/PR-Nummer im Repository |
| `url` | `TEXT NOT NULL` | historische kanonische GitHub-URL |
| `valid_from` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Beginn des halboffenen Intervalls |
| `valid_until` | `TIMESTAMPTZ` | `NULL` bedeutet aktuelle Koordinate |

Benannte CHECKs weisen leere `repository_node_id`, `repository_owner`, `repository_name` und
`url` ab, verlangen `object_number > 0` und erzwingen
`valid_until IS NULL OR valid_until > valid_from`.

Installiere diese Unique-Indizes:

- `github_object_coordinates_one_current_per_object_uq` auf `github_object_id` mit
  `WHERE valid_until IS NULL`;
- `github_object_coordinates_current_repo_number_uq` auf
  `(repository_node_id, object_number)` mit `WHERE valid_until IS NULL`.

Installiere `tickets.fn_guard_github_coordinate()`:

1. Bei `INSERT` lädt sie `kind` aus `tickets.github_objects`; fehlt das Objekt oder ist es
   `advisory`, schlägt der Write fehl. Advisories werden ausschließlich über Node-ID plus
   `provider_ref` identifiziert und haben keine nummerierte Repository-Koordinate.
2. Bei `UPDATE` darf ausschließlich ein offenes Intervall geschlossen werden:
   `valid_until` darf einmalig von `NULL` auf einen Wert wechseln; alle übrigen Spalten müssen
   `IS NOT DISTINCT FROM` ihren alten Werten sein. Wiederöffnen und Nachdatieren geschlossener
   Historie schlägt fehl.
3. `DELETE` wird abgewiesen. Verwende dafür einen Trigger `BEFORE INSERT OR UPDATE OR DELETE`.

Damit besteht ein Transfer aus `UPDATE` der bisherigen aktuellen Zeile (`valid_until =
transition timestamp`) und `INSERT` der neuen Zeile (`valid_from = derselbe timestamp`) in
einer Store-Transaktion; die alten Koordinaten bleiben unverändert auflösbar.

### 1.3 `tickets.work_item_refs`

Lege die Bindung an den bestehenden operativen UUID-Anker an:

| Spalte | SQL-Typ / Default | Semantik |
| --- | --- | --- |
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Bindungszeile |
| `ticket_id` | `UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE RESTRICT` | bestehender interner Work-Item-Anker |
| `github_object_id` | `UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT` | Issue oder Advisory |
| `role` | `TEXT NOT NULL` | `canonical` oder `alias` |
| `reason` | `TEXT` | Begründung einer Alias-/Korrekturbindung |
| `valid_from` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Bindungsbeginn |
| `valid_until` | `TIMESTAMPTZ` | nur ein pensioniertes Canonical darf geschlossen sein |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit-Zeitpunkt |

Constraints:

- `work_item_refs_role_check CHECK (role IN ('canonical','alias'))`;
- `work_item_refs_interval_check CHECK (valid_until IS NULL OR valid_until > valid_from)`;
- `work_item_refs_alias_open_check CHECK (role <> 'alias' OR valid_until IS NULL)`; Aliase
  bleiben auflösbar und werden nicht pensioniert.

Unique-Indizes:

- `work_item_refs_one_current_canonical_per_ticket_uq` auf `ticket_id` für
  `role = 'canonical' AND valid_until IS NULL`;
- `work_item_refs_one_current_canonical_per_object_uq` auf `github_object_id` für denselben
  Predicate, damit ein GitHub-Work-Item nicht gleichzeitig zwei Ticket-UUIDs kanonisiert;
- `work_item_refs_one_active_pair_uq` auf `(ticket_id, github_object_id)` für
  `valid_until IS NULL`;
- `work_item_refs_alias_pair_uq` auf `(ticket_id, github_object_id)` für `role = 'alias'`.

Installiere `tickets.fn_guard_work_item_ref()` als
`BEFORE INSERT OR UPDATE OR DELETE`-Trigger:

1. `INSERT` akzeptiert nur Objekte der Art `issue` oder `advisory`; insbesondere schlägt jede
   kanonische oder Alias-Bindung eines Pull Requests fehl.
2. Ein Alias-Insert braucht einen nichtleeren `reason`; ein Canonical-Insert darf `reason`
   optional als Herkunftsnotiz tragen.
3. `UPDATE` darf ausschließlich bei einer aktuellen `canonical`-Zeile `valid_until` einmalig
   von `NULL` auf einen Zeitpunkt nach `valid_from` setzen. Ticket, Objekt, Rolle, Grund,
   `valid_from` und `created_at` sind unveränderlich.
4. `DELETE` wird abgewiesen. Bei einer Korrektur pensioniert p2 das alte Canonical und fügt
   eine neue Alias-Zeile sowie das neue Canonical ein; keine Identität wird überschrieben.

### 1.4 `tickets.github_object_relations`

Lege gerichtete, append-only Beziehungen an:

| Spalte | SQL-Typ / Default | Semantik |
| --- | --- | --- |
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Beziehungszeile |
| `from_object_id` | `UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT` | gerichtete Quelle |
| `to_object_id` | `UUID NOT NULL REFERENCES tickets.github_objects(id) ON DELETE RESTRICT` | gerichtetes Ziel |
| `kind` | `TEXT NOT NULL` | `implements`, `closes`, `duplicate_of`, `replaces`, `transferred_to` |
| `source` | `TEXT NOT NULL` | nichtleere Provenienz, z. B. Reconciler/Operator |
| `reason` | `TEXT` | menschliche Korrekturbegründung |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Audit-Zeitpunkt |

Constraints/Indizes:

- `github_object_relations_kind_check` erlaubt exakt die fünf genannten Arten.
- `github_object_relations_not_self_check CHECK (from_object_id <> to_object_id)`.
- `github_object_relations_source_nonempty CHECK (btrim(source) <> '')`.
- `github_object_relations_redirect_reason_check` verlangt für `duplicate_of`, `replaces` und
  `transferred_to` einen nichtleeren `reason`.
- `github_object_relations_edge_uq UNIQUE (from_object_id, to_object_id, kind)` verhindert
  Replay-Dubletten.
- Indizes `github_object_relations_from_idx (from_object_id, kind)` und
  `github_object_relations_to_idx (to_object_id, kind)` unterstützen Vorwärts-/Rückauflösung.

Installiere zwei Triggerfunktionen:

- `tickets.fn_validate_github_relation()` läuft `BEFORE INSERT`: `implements` und `closes`
  verlangen `from.kind = 'pull_request'` sowie `to.kind IN ('issue','advisory')`.
  Redirect-Arten verlangen gleiche Objektarten, wobei `replaces` damit ausdrücklich auch
  PR→PR unterstützt. Für `duplicate_of`, `replaces` und `transferred_to` prüft eine rekursive
  CTE über alle drei Redirect-Arten ab `NEW.to_object_id`, dass `NEW.from_object_id` nicht
  erreichbar ist; andernfalls wirft sie vor dem Insert eine Exception. Die p2-Transaktion
  serialisiert konkurrierende Korrekturen zusätzlich; der Trigger ist die fail-closed
  Datenbankgrenze für normale und direkte Writes.
- `tickets.fn_guard_github_relation_history()` läuft `BEFORE UPDATE OR DELETE` und weist jede
  Mutation ab. Korrekturen werden als neue Beziehung angehängt.

Alle Funktionen erhalten schemaqualifizierte Tabellenzugriffe und einen expliziten
`SET search_path = pg_catalog, tickets`, damit Auflösung nicht vom Session-`search_path`
abhängt. Exception-Texte nennen Constraint/Invariant und relevante Objekt-IDs, ohne Inhalte
aus GitHub-Bodies zu loggen.

## Task 2: Schema-Initialisierung verdrahten

**File:** Modify `components/website/src/lib/tickets-schema.ts`

1. Importiere
   `applyGitHubIdentitySchema` aus `./tickets/tables/github-identities.ts` direkt neben den
   bestehenden Tabellenmodulen.
2. Rufe `await applyGitHubIdentitySchema(pool)` unmittelbar nach
   `await applyTicketsCoreSchema(pool)` und vor `applyFactoryControlSchema` auf. Damit existiert
   `tickets.tickets` vor dem FK aus `work_item_refs`, während alle neuen Objekte weiterhin im
   bestehenden `init:tickets`-Advisory-Lock und `ensureSchemaOnce('tickets', …)` liegen.
3. Ändere keine Reihenfolge oder Semantik der übrigen Initialisierer und exportiere keine
   neuen Symbole aus `tickets-schema.ts`.

## RED → GREEN und Akzeptanz

Dieser impl-Partial besitzt absichtlich keine Testdatei; p3 ist der file-disjunkte Test-Owner
für `github-identity-store.test.ts` und den Testbestand. Vor der Implementierung dieser beiden
Zieldateien muss dessen fokussierter Lauf die noch fehlende Schemafunktion nachweisen:

```bash
pnpm --dir components/website exec vitest run src/lib/tickets/github-identity-store.test.ts
# expected: FAIL (applyGitHubIdentitySchema bzw. die vier Tabellen fehlen)
```

Nach Task 1 und 2 muss derselbe Lauf in p3 GREEN werden und mindestens Schema-Replay ohne
Zeilenverlust, Unique-Verletzungen, PR-Work-Item-Ablehnung, Advisory-`provider_ref`,
Koordinaten-Historie, unveränderliche Aliase/Relationen und Redirect-Zyklen abdecken.

<!-- vitest: kein neuer Test in diesem Partial nötig, weil p3 die file-disjunkten Schema- und Store-Tests sowie das Test-Inventar besitzt. -->

Lokale statische Akzeptanz für p1:

```bash
pnpm --dir components/website exec tsc --noEmit
bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

- [ ] Alle vier Tabellen, benannten Constraints, Partial-Indizes und Trigger sind nach
      wiederholtem `initTicketsSchema()` unverändert vorhanden.
- [ ] Bestehende `T######`-Tickets bleiben ungebunden und unverändert; es gibt weder Import
      noch Delete/Rewrite in diesem Partial.
- [ ] `tickets-schema.ts` initialisiert das Modul erst nach dem Core-Schema.
- [ ] Beide Zieldateien bleiben innerhalb der oben festgehaltenen S1-Budgets; die Baseline
      wird nicht erweitert.
