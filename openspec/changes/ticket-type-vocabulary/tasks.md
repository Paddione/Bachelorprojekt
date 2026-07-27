---
title: "ticket-type-vocabulary — Implementation Plan"
ticket_id: T002329
domains: [bachelorprojekt-db, bachelorprojekt-test, bachelorprojekt-website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-type-vocabulary — Implementation Plan

_Ticket: T002329_

Teil B des Epics T002326. `tickets.type` erhält das Conventional-Commit-Vokabular
(`bug`→`fix`, `feature`→`feat`, `task`→`chore`, plus `docs`, `refactor`, `perf`, `test`, `ci`,
`build`). Der Übergang läuft als **Dual-Vokabular**: der CHECK akzeptiert vorübergehend beide
Namensräume, alle lesenden Stellen kennen beide. Entwurf und Begründung stehen in
`openspec/changes/ticket-type-vocabulary/design.md`.

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `website/src/lib/tickets/migrate-type-vocabulary.ts` | neu | 600 |
| `website/src/lib/tickets/migrations.ts` | 576 | 24 |
| `website/src/lib/tickets/tables/tickets.ts` | 485 | 115 |
| `website/src/lib/tickets/cockpit-db.ts` | 395 | 205 |
| `website/src/lib/tickets/cockpit-labels.ts` | 62 | 538 |
| `website/src/lib/planning-office.ts` | 291 | 309 |
| `scripts/factory/queue.sh` | 30 | 470 |
| `scripts/factory/auto-triage.sh` | 390 | 110 |
| `scripts/factory/auto-close-merged.sh` | 98 | 402 |

Ohne S1-Zeilenbudget, weil außerhalb des Gate-Scopes: `scripts/ticket.sh` (in
`docs/code-quality/gates.yaml` als sanktionierte Einzeldatei-CLI ignoriert), die drei
Go-Dateien unter `scripts/ticket-mcp/go/internal/tools/` (`workflow.go`, `triage.go`, `list.go`)
sowie die Testdateien `tests/spec/ticket-system.bats`, `tests/spec/software-factory.bats` und
`website/src/lib/tickets/__tests__/migrate-type-vocabulary.test.ts`.

`migrations.ts` hat bei 576 von 600 Zeilen nur 24 Zeilen Budget — 96 % der Schwelle. Der
Migrationsblock wird deshalb in ein eigenes Modul **ausgelagert** (Task 2), nicht hineingeschrieben.
Das ist ein echter Split: `migrations.ts` wächst nur um Import und Aufruf und verliert im selben
Zug die wirkungslose inline-CHECK-Klausel.

## Task 1 — RED-Nachweis: die Tests sind rot und prüfen wirklich etwas

Die Tests liegen bereits auf dem Branch. Vor jeder Implementierung ihren Rot-Zustand bestätigen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — 12 T002329-Tests rot, die 11 Bestandstests grün
tests/unit/lib/bats-core/bin/bats -f "T002329" tests/spec/software-factory.bats
# expected: FAIL — alle 3 rot
```

Ein bereits grüner T002329-Test ist ein Befund, kein Fortschritt: in der RED-Phase dieses Tickets
waren drei Assertions falsch-grün, weil `run` stdout und stderr gemeinsam einfängt und grep's
`No such file or directory` die Prüfung auf `!= "0"` erfüllte. Sie sind mit `2>/dev/null`
beziehungsweise einer `cat`-Pipe korrigiert. Wer hier Tests ergänzt, prüft denselben Fehler mit.

## Task 2 — Vokabular-Migration als eigenes Modul

Neu: `website/src/lib/tickets/migrate-type-vocabulary.ts`, exportiert
`applyTypeVocabularyMigration(pool: Pool | PoolClient): Promise<void>`.

Inhalt in dieser Reihenfolge — sie ist zwingend, weil das `UPDATE` sonst am noch geltenden alten
CHECK scheitert:

1. `ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_type_check`
2. `ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_type_check CHECK (type IN (…))` mit den
   zehn neuen Werten **und** den drei Altwerten `bug`, `feature`, `task`
3. `UPDATE tickets.tickets SET type = CASE … END WHERE type IN ('bug','feature','task')`

Der `WHERE`-Filter macht die Migration idempotent — sie läuft bei jedem Pod-Boot erneut und
trifft ab dem zweiten Lauf null Zeilen. Weil sie in der regulären Schema-Init hängt, erreicht sie
**beide** Brand-Datenbanken ohne gesonderten Anstoß. Ein Kommentar im Modul hält fest, dass die
Altwerte in Teil D (T002331) aus dem Constraint fallen.

Deckt ab: `die Vokabular-Migration liegt in einem eigenen Modul`, `der type-CHECK wird als
benannter Constraint gesetzt`, `kennt die sechs neu hinzugekommenen Werte`, `akzeptiert waehrend
des Uebergangs die Altwerte`, `Bestandsdaten werden per WHERE-gefiltertem UPDATE migriert`,
`der Constraint wird vor der Datenumschrift erweitert`.

## Task 3 — `migrations.ts` anbinden und den Trigger entschärfen

1. Die `CHECK (type IN (…))`-Klausel aus dem `ADD COLUMN IF NOT EXISTS type TEXT`-Statement
   (Zeile 11) **entfernen**. Sie ist gegen eine bestehende Spalte wirkungslos und wäre nach
   Task 2 eine zweite, abweichende Wahrheit.
2. `applyTypeVocabularyMigration(pool)` importieren und aufrufen — an der Stelle, an der heute
   der `status`-Constraint gesetzt wird, also vor den Views.
3. Die `WHEN`-Klausel von `trg_notify_feature_inserted` auf `NEW.type IN ('feature','feat')`
   erweitern. Ohne diesen Schritt feuert der Trigger nach der Datenmigration nie wieder.

Deckt ab: `migrations.ts ruft die ausgelagerte Vokabular-Migration auf`, `die inline-CHECK-Klausel
am type-ADD-COLUMN ist entfernt`, `der pg_notify-Trigger feuert auch fuer feat`.

## Task 4 — Views lesen beide Vokabulare

In `website/src/lib/tickets/tables/tickets.ts`:

- `v_active_features`: `WHERE type = 'feature'` → `WHERE type IN ('feature','feat')`
- `v_factory_metrics`: `COUNT(*) FILTER (WHERE type = 'feature')` →
  `COUNT(*) FILTER (WHERE type IN ('feature','feat'))`

Damit liefern beide Views vor und nach der Datenmigration identische Zeilen. Genau das macht die
vom Ticket geforderte Transaktionsklammer entbehrlich.

`fn_purge_test_data` bleibt unverändert: sie prüft ausschließlich auf `project`, und dieser Wert
ändert sich nicht.

Deckt ab: `v_active_features liest beide Vokabulare`, `v_factory_metrics zaehlt beide Vokabulare`.

## Task 5 — Dispatcher-Lane auf eine Ausschlussregel umstellen

In `scripts/factory/queue.sh` die beiden Lanes ersetzen:

```sql
   (type IN ('feature','feat') AND status='backlog'
    AND COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true)
OR (type <> 'project' AND status='plan_staged'
    AND COALESCE((readiness->>'execution_released')::boolean, true) = true)
```

Die staged-Lane wird von einer Positiv- auf eine Negativliste umgestellt. T002333 entstand
dadurch, dass ein Typ in der Whitelist fehlte; bei zehn Werten statt vier wird diese Lücke
wahrscheinlicher. Die backlog-Lane bleibt eine Positivliste, weil sie fachlich an „Feature" hängt
und nicht an „irgendein Arbeitstyp".

Der Kommentarblock über den Lanes wird mitgezogen — er spricht heute von „Staged chore/task
tickets" und muss die Ausschlusslogik benennen.

**T002333 ist damit inhaltlich erledigt** und wird beim Merge geschlossen.

Deckt ab: `die staged-Lane schliesst ausschliesslich project aus`, `die staged-Lane ist keine
Typ-Whitelist mehr`, `die backlog-Lane erkennt feature und feat`.

## Task 6 — CLI und MCP kennen das neue Vokabular

1. `scripts/ticket.sh` und die betroffenen `scripts/vda/ticket/*.sh`: Typ-Validierung auf die
   dreizehn Werte erweitern (zehn neue plus drei Altwerte).
2. `scripts/ticket-mcp/go/internal/tools/`: die Enum-Deklarationen in `workflow.go` (Zeile 115 f.),
   `triage.go` (Zeile 22 f. sowie `validTypes` in Zeile 47) und `list.go` (Zeile 29 f. und 101 f.).
3. `scripts/factory/auto-triage.sh`: LLM-Prompt (Zeile 171) und Enum (Zeile 246). Der Prompt muss
   die neuen Typen erklären, sonst klassifiziert die Auto-Triage weiter ins alte Vokabular.
4. `scripts/factory/auto-close-merged.sh` (Zeile 85): die Resolution-Ableitung wird
   `type IN ('bug','fix') → fixed`, sonst `shipped`.

**Der Go-Anteil braucht einen expliziten Deploy-Schritt.** `ticket-mcp` ist ein kompiliertes
Binary; ein Merge tauscht das laufende `/usr/local/bin/ticket-mcp-go` nicht aus:

```bash
make -C scripts/ticket-mcp/go install
```

Ohne diesen Aufruf validiert das MCP weiter gegen das alte Vier-Werte-Enum, während Datenbank und
Skripte bereits umgestellt sind.

Deckt ab: `ticket-mcp validiert gegen das neue Vokabular`.

## Task 7 — Leseseite der Website

1. `website/src/lib/tickets/cockpit-db.ts`: die drei `type IN ('task','bug')`-Filter um `chore`
   und `fix` erweitern.
2. `website/src/lib/tickets/cockpit-labels.ts` (Zeile 54): dieselbe Resolution-Ableitung wie in
   `auto-close-merged.sh` — `type IN ('bug','fix') → fixed`. Beide Stellen müssen übereinstimmen,
   sonst weichen Cockpit-Anzeige und automatischer Merge-Abschluss voneinander ab.
3. `website/src/lib/planning-office.ts` (Zeile 249): `VALID_TYPES` auf die dreizehn Werte.

Labels und Farben für die sechs neuen Typen im Cockpit ergänzen, damit ein `refactor`-Ticket
nicht ohne Beschriftung erscheint.

## Task 8 — Vitest für das neue Migrationsmodul

`website/src/lib/tickets/__tests__/migrate-type-vocabulary.test.ts` gegen einen Fake-Pool, der die
abgesetzten Statements sammelt. Geprüft wird:

- Der `DROP CONSTRAINT` steht vor dem `ADD CONSTRAINT`, und beide vor dem `UPDATE`.
- Der `CHECK` enthält alle dreizehn Werte.
- Das `UPDATE` trägt den `WHERE type IN ('bug','feature','task')`-Filter, ist also idempotent.

```bash
cd website && pnpm vitest run src/lib/tickets/__tests__/migrate-type-vocabulary.test.ts
```

Damit ist die Reihenfolge-Invariante aus Task 2 nicht nur statisch per BATS, sondern auch gegen
die tatsächlich abgesetzten Statements abgesichert.

## Task 9 — Verifikation

```bash
# Die vormals roten Tests müssen jetzt grün sein
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
tests/unit/lib/bats-core/bin/bats -f "T002329" tests/spec/software-factory.bats
cd website && pnpm vitest run src/lib/tickets/__tests__/migrate-type-vocabulary.test.ts && cd ..

# Neue Testdatei ins Inventar aufnehmen (CI vergleicht gegen die committete Fassung)
task test:inventory

# Das MCP-Binary neu bauen, sonst validiert es gegen das alte Enum
make -C scripts/ticket-mcp/go install

# Pflicht-Gates
task test:changed
task freshness:regenerate
task freshness:check
```

Nach dem Merge zu prüfen: die Website-Pods beider Brands haben neu gebootet und die Migration
gefahren. Kontrolle über `SELECT type, COUNT(*) FROM tickets.tickets GROUP BY type` — es dürfen
keine Zeilen mit `bug`, `feature` oder `task` übrig sein, und die Gesamtsumme muss unverändert
bleiben (Stand vor der Migration in der mentolder-Datenbank: 823 `task`, 541 `bug`, 334
`feature`, 32 `project`).
