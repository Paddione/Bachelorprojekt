---
title: "mishap-t002407 — Implementation Plan"
ticket_id: T002407
domains: [scripts, ticket-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002407 — Implementation Plan

_Ticket: T002407 · [Proposal](proposal.md)_

Baut auf T002390 auf (gemergt). Die Go-Binary-Mechanik (`mishap.go`) liegt bereits auf `main`: `isIncidentType`, `ROLLUP_TICKET_TITLE`, `findOrCreateRollupTicket`, `appendToRollupContainer`, Incident-Pfad vor dem Buffer-Write. Dieser Plan schließt die Lücken in DB, Scripts, Tests und Docs.

## File Structure

```
website/src/lib/tickets/migrate-type-vocabulary.ts   # 'incident' in NEW_TYPES + CHECK
website/src/lib/tickets/tables/tickets.ts            # Inline-CHECK deckungsgleich
website/src/lib/tickets/cockpit-labels.ts            # TYPE_LABELS.incident
scripts/factory/queue.sh                             # Lane 47: incident ausschließen
scripts/ticket-mcp/go/internal/tools/mishap.go       # (bereits auf main) — kein Change nötig
scripts/ticket-mcp/go/internal/tools/mishap_test.go  # Tests für incident + rollup ergänzen
scripts/factory/mishap-rollup.sh                     # NEU: Rollup-Treiber (fester Branch)
scripts/factory/auto-close-merged.sh                 # Recycle-Zweig für den Container
scripts/factory/wakeup.sh                            # Rollup-Aufruf pro Brand
scripts/factory/migrate-mishap-bundles.sh            # NEU: Einmal-Migration der Altbundles
.claude/skills/mishap-tracker/SKILL.md               # Incident-Routing, Rollup-Semantik
tests/spec/ticket-system.bats                        # incident-Typ + queue.sh-Ausschluss
tests/spec/mcp-skill-integration.bats                # Buffer-/Incident-Verhalten
tests/spec/software-factory.bats                     # Container-Lifecycle, Rollup-Treiber
```

## Tasks

### 1. DB-Typ `incident` registrieren

Reihenfolge ist zwingend: Der Constraint muss deployed sein, BEVOR `report_mishap` Incident-Tickets anlegt — sonst schlägt das INSERT fehl und der Incident geht verloren.

**1.1. `incident` in `NEW_TYPES` und den benannten CHECK aufnehmen.** `website/src/lib/tickets/migrate-type-vocabulary.ts`: `NEW_TYPES` um `'incident'` erweitern und die `CHECK (type IN (…))`-Liste in `applyTypeVocabularyMigration` deckungsgleich mitziehen. Die Migration läuft bei jedem Pod-Boot und ist idempotent.

**1.2. Inline-CHECK in `tables/tickets.ts` angleichen.** Zeile 19 trägt dieselbe Liste für den Erstanlage-Fall. Weicht sie ab, hängt das Verhalten davon ab, ob die Tabelle neu erzeugt oder migriert wurde — `'incident'` in beide Listen aufnehmen.

**1.3. `TYPE_LABELS.incident` in `cockpit-labels.ts`.** Ohne Label ist das Ticket im Cockpit unbeschriftet.

**1.4. `queue.sh` Lane 47:** `type <> 'project'` → `type NOT IN ('project','incident')`. Den Kommentar darüber um `incident` ergänzen. Incident-Tickets sind `attention_mode=needs_human` und dürfen nie automatisch dispatched werden.

**1.5. Failing-Test vorab:** Einen BATS-Test schreiben, der `queue.sh` aufruft und assertiert, dass ein gestagter `incident`-Ticket NICHT in der Queue auftaucht — während ein gestagter `chore`-Ticket weiterhin sichtbar ist. Der Test MUSS auf dem aktuellen Branch fehlschlagen (der `incident`-Typ existiert im CHECK noch nicht).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — incident-Typ ist dem CHECK unbekannt
```

### 2. Go-Tests erweitern

**2.1. `mishap_test.go` erweitern.** Tests für:
- `report_mishap(type=incident)` → sofort Ticket, kein Buffer-Eintrag
- `report_mishap(type=broken)` → gleicher Pfad (Alias)
- `report_mishap(type=degraded)` → Buffer, kein Ticket
- Rollup-Container: neu angelegt, wiederverwendet, Buffer < Schwelle → kein Append
- Erzeugte Tickets tragen `incident` bzw. `chore`, nie `task`
- `findOrCreateRollupTicket` erzeugt Container mit `status=plan_staged`, nie `triage`

### 3. Rollup-Treiber `scripts/factory/mishap-rollup.sh`

**3.1. Skript anlegen** (angelehnt an `auto-chore-plan.sh` [T002390]). Übernommen werden:
- Worktree-Anlage über `worktree-create.sh` (git-crypt-Sicherheit)
- `plan-lint` als Hard Gate
- Verkettetes `commit && push`
- `stage-plan` erst nach dem Push

Geändert werden:
- Fester Slug: `mishap-incident-rollup` (nicht pro Ticket)
- Fester Branch: `chore/mishap-incident-rollup` (wird nie gelöscht)
- Update statt Abbruch: existiert `openspec/changes/mishap-incident-rollup/` bereits, wird `tasks.md` neu erzeugt — kein `exit 3`
- Existiert der Branch auf dem Remote: auschecken und auf `origin/main` rebasen statt neu anlegen
- Plan-Erzeugung: aus den unverarbeiteten Kommentar-Batches des Containers per LLM generieren
- Nach erfolgreichem `stage-plan`: `execution_released=true` setzen

**3.2. No-op-Pfad.** Keine unverarbeiteten Batches → Meldung und `exit 0`, ohne Worktree-Anlage.

### 4. Merge-Recycling für den Container

**4.1. `auto-close-merged.sh` Recycle-Zweig.** Vor dem regulären `done/shipped`-Abschluss prüfen: Hat das Ticket den Titel `ROLLUP_TICKET_TITLE` aus `mishap.go`? Falls ja, statt Abschluss:
- `status=plan_staged` + `execution_released=false` setzen (via `ticket.sh update-status` + DB-Update)
- Audit-Kommentar mit PR-Nummer anhängen
- `continue` (nicht done setzen)

Den T001580-Skip NICHT wiederverwenden — der bedeutet inhaltlich etwas anderes.

**4.2. Failing-Test vorab:** BATS-Test, der einen Container simuliert und assertiert, dass `auto-close-merged.sh` ihn NICHT auf `done` setzt.

### 5. Tick-Integration

**5.1. `wakeup.sh`:** Nach dem Mishap-Flush (Zeile 214-219) und vor dem Auto-Chore-Plan (Zeile 225-228) `mishap-rollup.sh` pro Brand aufrufen, best-effort wie die Nachbarschritte.

```bash
for _mr_brand in mentolder korczewski; do
  BRAND="$_mr_brand" bash "${REPO}/scripts/factory/mishap-rollup.sh" 2>&1 \
    | sed "s/^/[mishap-rollup:${_mr_brand}] /" >&2 || true
done
```

### 6. `mishap-tracker` SKILL.md aktualisieren

**6.1. Step-1-Tabelle:** `incident` ergänzen (sofort Ticket, `needs_human`). `broken`/`security` als Aliase dokumentieren.

**6.2. Step-3/Eingang:** „Bundle-Ticket" durch „Anhängen an den Rollup-Container" ersetzen. Die Rückmeldung aus `report_mishap` ist jetzt entweder „Incident-Ticket angelegt" oder „Mishap gespeichert (%d/%d) — Rollup-Container-Append bei Erreichen der Schwelle".

**6.3. Step-3.5:** Auf den Rollup-Treiber (`scripts/factory/mishap-rollup.sh`) verweisen statt auf `auto-chore-plan.sh`.

**6.4. Fallback.** Incident-Pfad erwähnen: „Falls ticket-mcp nicht erreichbar: incident als separates Ticket manuell anlegen mit `--type incident`".

### 7. Migration der Altbundles

**7.1. `scripts/factory/migrate-mishap-bundles.sh` anlegen** (Einmal-Skript, idempotent). Pro Bundle (T002325, T002342, T002354, T002355, T002364, T002371, T002372, T002379, T002381, T002392, T002409, T002410):
- Beschreibung an `### Mishap N:` zerlegen
- Einträge mit `**Typ:** broken|security` → je ein `incident`-Ticket anlegen
- Alle übrigen → als Kommentar-Batch an den Rollup-Container
- Bundle-Ticket auf `done/resolution=obsolete` setzen, per `relates_to` mit Container verlinken

**7.2. `--dry-run`-Modus.** Vor der echten Migration die Aufteilung prüfen. T002409 (`major`) muss mindestens einen `incident` abwerfen; T002410 (`minor`) darf keinen abwerfen.

### 8. BATS-Tests

**8.1. `tests/spec/ticket-system.bats` — Append.** Tests für:
- `incident` ist ein gültiger DB-Typ
- `queue.sh` liefert gestagten `incident` NICHT (Negativtest)
- `queue.sh` liefert gestagten `chore` weiterhin (Positivtest)

**8.2. `tests/spec/mcp-skill-integration.bats` — Append.** Tests für:
- Incident umgeht den Buffer
- Nicht-kritische Mishaps puffern weiter
- Erzeugte Tickets tragen nie `task`

**8.3. `tests/spec/software-factory.bats` — Append.** Tests für:
- Container wird in `plan_staged` angelegt, nie in `triage`
- Merge von Container → Recycling statt `done`
- Treiber bricht bei existierendem Change-Verzeichnis NICHT ab

<!-- vitest: Die website/ TypeScript-Änderungen (migrate-type-vocabulary, cockpit-labels) werden durch BATS-Tests gegen die DB abgedeckt (ticket-system.bats), nicht durch Vitest-Unit-Tests. queue.sh ist ein Bash-Script, kein TypeScript. -->

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Tests aus Task 8 zuerst schreiben. Sie müssen auf dem aktuellen Branch FEHLSCHLAGEN — insbesondere der `queue.sh`-Ausschlusstest für `incident` und der Container-Lifecycle-Test.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL — incident-Typ ist dem CHECK unbekannt, queue filtert ihn nicht
```

- [ ] **Fix-Step (GREEN).** Tasks 1–7 implementieren. Danach müssen dieselben Tests grün sein.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
