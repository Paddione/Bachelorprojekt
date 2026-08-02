---
ticket_id: T002329
plan_ref: openspec/changes/ticket-type-vocabulary/tasks.md
status: active
date: 2026-07-27
---

# Design: Typ-Vokabular auf Conventional-Commit-Werte (T002329)

Teil B des Epics **T002326**. Teil A (T002328, Commit-Scopes) ist gemergt; C (T002330) und
D (T002331) folgen.

## Kernentscheidung: Dual-Vokabular macht die Transaktion überflüssig

Das Ticket verlangt, `v_active_features` und `v_factory_metrics` „in derselben Transaktion" mit
der Datenmigration zu ändern, weil sie sonst still brechen. Diese Kopplung entfällt, wenn die
Views **beide** Vokabulare lesen (`type IN ('feature','feat')`): dann sind sie vor *und* nach dem
`UPDATE` korrekt, und die Reihenfolge ist gleichgültig.

Das ist nicht nur bequemer, sondern passt zur Datei: `migrations.ts` fährt Einzelstatements im
Autocommit. Eine explizite `BEGIN`/`COMMIT`-Klammer wäre dort ein Fremdkörper und müsste über
einen eigens gezogenen Client laufen.

Denselben Effekt hat das Dual-Vokabular auf den Deploy: die DB-Migration reist im Website-Image
(~4 min Build + Flux-Reconcile), die Bash-Skripte kommen mit dem Merge sofort auf dem Host an.
Diese beiden Zeitpunkte fallen zwangsläufig auseinander. Solange beide Vokabulare gültig sind,
ist das Fenster folgenlos.

## Schicht 1 — Datenbank (`website/src/lib/tickets/migrations.ts`)

Der bestehende CHECK steht inline an `ADD COLUMN IF NOT EXISTS type` (Z. 11). Gegen eine
existierende Spalte ist dieses Statement ein **No-op** — die Zeile zu ändern wirkt live nicht.
Dieselbe Datei löst das für `status` (Z. 48–52) und `effort` (Z. 63–67) bereits über ein
benanntes `DROP`/`ADD`; `type` folgt diesem Muster.

```sql
-- 1. CHECK-Klausel aus dem ADD-COLUMN-Statement entfernen (bleibt: ADD COLUMN … type TEXT)
-- 2. Benannter Constraint, 13 Werte (10 neue + 3 Altwerte)
ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_type_check
  CHECK (type IN ('fix','feat','chore','project',
                  'docs','refactor','perf','test','ci','build',
                  'bug','feature','task'));

-- 3. Datenmigration, idempotent — zweiter Lauf trifft 0 Zeilen
UPDATE tickets.tickets SET type = CASE type
    WHEN 'bug'     THEN 'fix'
    WHEN 'feature' THEN 'feat'
    WHEN 'task'    THEN 'chore'
  END
 WHERE type IN ('bug','feature','task');
```

Die Reihenfolge ist zwingend: der erweiterte Constraint muss **vor** dem `UPDATE` stehen, sonst
verletzt das `UPDATE` den noch geltenden alten CHECK.

**Beide Brand-DBs ohne Sonderweg.** Weil die Migration in `applyLegacyMigrations()` steht und
beide Brands dasselbe Website-Image fahren, läuft sie beim Pod-Boot je gegen die eigene Datenbank.
Ein One-Shot-Skript würde diesen Weg verlassen und müsste zweimal von Hand angestoßen werden.

Ist-Bestand (mentolder-DB, erhoben 2026-07-27): 823 `task`, 541 `bug`, 334 `feature`, 32
`project` — davon **33 offen**. Die Migration ist damit ganz überwiegend eine Historien-Umschrift.

## Schicht 2 — Views und Trigger

| Objekt | Fundstelle | Änderung |
|---|---|---|
| `v_active_features` | `tables/tickets.ts:461` | `WHERE type IN ('feature','feat')` |
| `v_factory_metrics` | `tables/tickets.ts:441` | `COUNT(*) FILTER (WHERE type IN ('feature','feat'))` |
| `trg_notify_feature_inserted` | `migrations.ts:573` | `WHEN (NEW.type IN ('feature','feat'))` |
| `fn_purge_test_data` | `migrations.ts:441,450` | unverändert — nutzt nur `project` |

Der Trigger steht **nicht** im Ticket. Ohne die Anpassung feuert er nach der Migration nie wieder.
Er ist zwar als NOT-CONSUMED dokumentiert, aber ein stumm gewordener Trigger ist eine Falle für
den künftigen Consumer, für den er ausdrücklich vorgehalten wird.

## Schicht 3 — Dispatcher (`scripts/factory/queue.sh`)

```sql
   (type IN ('feature','feat') AND status='backlog'
    AND COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true)
OR (type <> 'project' AND status='plan_staged'
    AND COALESCE((readiness->>'execution_released')::boolean, true) = true)
```

Die staged-Lane wird von einer Whitelist auf eine **Negativliste** umgestellt. Begründung:
T002333 entstand genau dadurch, dass ein Typ in der Whitelist fehlte. Bei zehn Werten statt vier
wird diese Lücke wahrscheinlicher, nicht seltener. Eine Ausschlussregel kann den Fehler
strukturell nicht mehr machen — und `project` ist der einzige Typ, der inhaltlich nie selbst
bearbeitet wird (Epic).

Die backlog-Lane bleibt eine Positivliste, weil sie fachlich an „Feature" hängt, nicht an
„irgendein Arbeitstyp".

**Damit ist T002333 miterledigt** und sollte beim Merge geschlossen werden.

## Schicht 4 — Werkzeuge und Website

| Datei | Änderung |
|---|---|
| `scripts/ticket.sh`, `scripts/vda/ticket/*` | Typ-Validierung auf 13 Werte |
| `scripts/ticket-mcp/go/internal/tools/{workflow,triage,list}.go` | 6 Enum-Stellen + `validTypes` |
| `scripts/factory/auto-triage.sh` | LLM-Prompt (Z. 171) + Enum (Z. 246) |
| `scripts/factory/auto-close-merged.sh:85` | Resolution-Ableitung → `type IN ('bug','fix') → fixed` |
| `website/src/lib/tickets/cockpit-db.ts` | 3× `type IN ('task','bug')` → um `chore`, `fix` erweitert |
| `website/src/lib/tickets/cockpit-labels.ts:54` | dieselbe Resolution-Ableitung wie oben |
| `website/src/lib/planning-office.ts:249` | `VALID_TYPES` |

`ticket-mcp` ist der einzige Baustein mit einem **manuellen Deploy-Schritt**: es ist ein
Go-Binary, das per `make install` nach `/usr/local/bin/ticket-mcp-go` wandert. Ein Merge allein
tauscht das laufende Binary nicht aus — ohne diesen Schritt validiert das MCP weiter gegen das
alte Vier-Werte-Enum. Der Schritt gehört in den Plan, nicht in eine Fußnote.

## Teststrategie

RED-Phase in `tests/spec/ticket-system.bats` (die Datei zum Parent-SSOT-Spec; keine neue
ticket-nummerierte Datei). Der zentrale Test ist der vom Ticket geforderte View-Vergleich:
Zeilenzahl von `v_active_features` **vor** und **nach** der Datenmigration muss identisch sein.
Genau dieser Test schlägt fehl, wenn jemand die Views auf das reine Neu-Vokabular umstellt statt
auf das duale.

Ergänzend Struktur-Assertions gegen die Quelltexte: kein `CHECK (type IN` mehr am
`ADD COLUMN`-Statement, benannter Constraint vorhanden, `queue.sh` enthält `type <> 'project'`.

**BATS-Konvention beachten:** Assertions nicht unqualifiziert gegen `$output` prüfen — der
Worktree heißt `ticket-type-vocabulary` und enthält damit die Suchbegriffe `ticket`, `type` und
`vocabulary` bereits im Pfad. Treffer auf die relevante Zeile einschränken.

## Abgrenzung

| Gehört **nicht** hierher | Ziel |
|---|---|
| `/admin/bugs`, `bug-report.ts`, `scope`-Spalte, FA-26-Rückbau | C — T002330 |
| Altwerte aus dem CHECK entfernen | D — T002331 |
| Dispatcher-Fortsetzungsfähigkeit | T002327 (ungeplant) |

## Risiken

1. **`ticket-mcp` braucht `make install`** — sonst bleibt das MCP-Enum alt. Verifikationsschritt
   im Plan.
2. **T002307 läuft parallel** in `.worktrees/mishap-ticket-rbac` an `scripts/vda/ticket/_ticket-core.sh`.
   Rein textuelle Kollision (Pod-Selektor vs. Typ-Validierung), kein semantischer Konflikt —
   B rebasen statt warten.
3. **Der `feature`→`feat`-Schritt trifft `v_active_features`,** also die Arbeitsmenge des
   Dispatchers. Der View-Zeilenzahl-Test ist genau dagegen gerichtet.
