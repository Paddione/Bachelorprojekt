---
title: "db-quality-goals — Implementation Plan"
ticket_id: T001739
domains: [database, health-goals]
status: archived
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-quality-goals — Implementation Plan

_Ticket: T001739 · verlinkt T001738 (db-backup-Ausfall, Root-Cause NICHT Teil dieses Plans)_

Verdrahtet fünf neue, read-only reproduzierbare Datenbank-Gesundheitsziele (`G-DB01`, `G-DB03`,
`G-DB04`, `G-DB06`, `G-DB08`) in `.claude/lib/goals.md` und `scripts/health-goals-check.sh`.
Der Plan verdrahtet ausschließlich die **Messung** — er zieht weder die 4 fehlenden Indizes (G-DB01)
noch die 44 CHECK-Constraints (G-DB03) nach und fixt auch T001738 (G-DB04) nicht. Das entspricht der
etablierten „Target, kein Zwangs-Fix"-Praxis der G-AGENTIC01/09/10-Serie und der „messen →
dokumentieren"-Praxis von G-CQ08/G-DEP02 in `.claude/lib/goals.md`.

Alle fünf Messgrundlagen wurden am 2026-07-09 live gegen den `shared-db`-Pod im fleet-Cluster
(Namespace `workspace`, DB `website`, User `website`) verifiziert — die im Plan eingebetteten Queries
liefern exakt die genannten Ist-Werte.

## File Structure

```
scripts/health-goals-check.sh                              (geändert) — DB-Mess-Helfer + 5 row-Aufrufe
.claude/lib/goals.md                                       (geändert) — 5 Ziel-Einträge, Messzyklus, Offene-Tickets-Tabelle
openspec/changes/db-quality-goals/specs/db-quality-goals.md (geändert) — 5 Requirements (H3) + Scenarios (H4)
tests/spec/db-quality-goals.bats                           (neu)      — Smoke-Test: Script läuft + rendert die 5 IDs
```

### S1-Zeilenbudget (Plan-Quality-Gate, pro Datei geprüft)

- `scripts/health-goals-check.sh`: Ist **275** Zeilen · `.sh`-Limit **500** · nicht-baselined
  (`jq -r '."S1:scripts/health-goals-check.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json`
  → `nicht-baselined`) → **Budget 225**. Erwartete Ergänzung: ~60–70 Zeilen (Helfer + 5 rows) →
  neuer Ist-Wert ~340, deutlich unter 500. Kein Split nötig.
- `.claude/lib/goals.md`: `.md` hat **kein** S1-Zeilenlimit (`gates.yaml → s1.limits` listet `.md`
  nicht) und die Datei ist von keinem Health-Goal gegatet → unbeschränkt.
- `tests/spec/db-quality-goals.bats`: neue Datei, `.bats` hat **kein** S1-Zeilenlimit; von
  S4-Orphan-Scope (`tests/**/*.bats`) bereits als erreichbar abgedeckt.
- `openspec/changes/db-quality-goals/specs/db-quality-goals.md`: Delta-Spec, kein S1-Limit.

Kein neuer Baseline-Eintrag wird angelegt (die Key-Count-Assertion in `freshness:check` würde sonst
failen).

## Verify (RED → GREEN)

### Task 1 — RED: Smoke-Test `tests/spec/db-quality-goals.bats` anlegen

**Datei:** `tests/spec/db-quality-goals.bats` (neu)

Der Test ruft `scripts/health-goals-check.sh` mit `--fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08`
auf. `--fast` erzwingt in den (später hinzugefügten) DB-Helfern den `-`/SKIP-Pfad, sodass der Test
**ohne Cluster-Zugriff deterministisch** läuft — die `row`-Funktion druckt auch für SKIP-Zeilen die
Ziel-ID. Der Test prüft: (a) jede der 5 IDs erscheint in der Ausgabe, (b) der Exit-Code ist 0 oder 1
(erlaubt einen roten Gate-Wert bei G-DB04 gegen einen echten Cluster), niemals ein Absturz-Code
(≥2/127). Zusätzlich ein Syntax-Gate `bash -n`.

Orientierung am Stil von `tests/spec/software-factory.bats` (File-Level-Variablen, `run`-basierte
Assertions). Inhalt:

```bash
#!/usr/bin/env bats
# tests/spec/db-quality-goals.bats
# SSOT: openspec/changes/db-quality-goals/specs/db-quality-goals.md (→ openspec/specs/ nach archive)
# Konvention: ein .bats-File pro OpenSpec-SSOT-Spec.

HGC="scripts/health-goals-check.sh"
DB_IDS="G-DB01 G-DB03 G-DB04 G-DB06 G-DB08"

setup() {
  cd "$BATS_TEST_DIRNAME/../.." || return 1
}

@test "health-goals-check.sh ist syntaktisch valide (bash -n)" {
  run bash -n "$HGC"
  [ "$status" -eq 0 ]
}

@test "health-goals-check.sh --fast --only=<G-DB*> rendert alle 5 DB-Ziele ohne Absturz" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  # 0 = alle gruen/uebersprungen, 1 = Gate-Verstoss (z.B. G-DB04 live rot). Beides ok, kein Absturz.
  [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id"
  done
}

@test "keine der 5 DB-Ziel-IDs fehlt in der --only-Ausgabe" {
  run bash "$HGC" --fast --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08
  missing=0
  for id in $DB_IDS; do
    echo "$output" | grep -q "$id" || missing=$((missing+1))
  done
  [ "$missing" -eq 0 ]
}
```

**RED-Nachweis (auf dem Branch VOR Task 2):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-quality-goals.bats
# expected: FAIL — die IDs G-DB01/03/04/06/08 existieren noch nicht in health-goals-check.sh,
#                  daher druckt --only=<G-DB*> keine dieser Zeilen und die grep-Assertions failen.
```

### Task 2 — GREEN: DB-Mess-Helfer + 5 `row`-Aufrufe in `scripts/health-goals-check.sh`

**Datei:** `scripts/health-goals-check.sh` (geändert)

**2a — DB-Helfer im Mess-Helfer-Block** (nach dem bestehenden `mcp_servers()`-Helfer, vor der
`GATES`-Sektion). Alle Helfer sind read-only, ermitteln den Pod **dynamisch** über das Label
`app=shared-db` (kein hardcodierter Pod-Name, gemäß `mcp-tool-guide.md` §psql-Helper) und geben `-`
zurück, sobald `kubectl`/Cluster/Pod nicht erreichbar ist oder `--fast` gesetzt ist. `kubectl` läuft
mit `--request-timeout`, damit CI ohne Cluster nicht blockiert:

```bash
# ── DB-Mess-Helfer (read-only; SKIP bei --fast oder wenn Cluster/Pod nicht erreichbar) ──
DB_NS="${HG_DB_NS:-workspace}"; DB_CTX="${HG_DB_CTX:-fleet}"; PGPOD=""
_db_pod() {  # Pod dynamisch ermitteln (Label app=shared-db), Ergebnis cachen
  [ -n "$PGPOD" ] && { echo "$PGPOD"; return 0; }
  command -v kubectl >/dev/null 2>&1 || return 1
  PGPOD=$(kubectl get pod -n "$DB_NS" --context "$DB_CTX" --request-timeout=5s \
            -l app=shared-db -o name 2>/dev/null | head -1)
  [ -n "$PGPOD" ] && { echo "$PGPOD"; return 0; } || return 1
}
db_scalar() {  # $1=SQL → einzelne Ganzzahl, oder "-" wenn nicht messbar
  [ "$FAST" = 1 ] && { echo "-"; return; }
  local pod; pod=$(_db_pod) || { echo "-"; return; }
  local out
  out=$(kubectl exec "$pod" -n "$DB_NS" --context "$DB_CTX" --request-timeout=15s \
          -c postgres -- psql -U website -d website -tAc "$1" 2>/dev/null) || { echo "-"; return; }
  out=$(printf '%s' "$out" | tr -d '[:space:]')
  [[ "$out" =~ ^[0-9]+$ ]] && echo "$out" || echo "-"
}
db_backup_age_h() {  # Stunden seit juengstem erfolgreichen db-backup-Job, "-" wenn nicht messbar
  [ "$FAST" = 1 ] && { echo "-"; return; }
  command -v kubectl >/dev/null 2>&1 || { echo "-"; return; }
  local ts epoch now
  ts=$(kubectl get jobs -n "$DB_NS" --context "$DB_CTX" --request-timeout=5s \
         -o jsonpath='{range .items[?(@.status.succeeded==1)]}{.metadata.name}{" "}{.status.completionTime}{"\n"}{end}' 2>/dev/null \
       | grep -E '^db-backup' | awk '{print $2}' | sort | tail -1)
  [ -n "$ts" ] || { echo "-"; return; }
  epoch=$(date -u -d "$ts" +%s 2>/dev/null) || { echo "-"; return; }
  now=$(date -u +%s)
  echo $(( (now - epoch) / 3600 ))
}
```

**2b — Fünf `row`-Aufrufe.** G-DB06 ist ein **Gate** (eq 0, halten), G-DB04 ein **Gate**
(le 26 h Backup-Alter). G-DB01/G-DB03/G-DB08 sind **Targets** (kein CI-Fail ohne `--strict`).
G-DB04/G-DB06 in die GATES-Sektion (nach `row gate G-SEC01 …`), G-DB01/G-DB03/G-DB08 in die
TARGETS-Sektion (nach `row target G-SEC05 …`):

```bash
# ── DB-Gesundheit — GATES ──
row gate G-DB06 "$(db_scalar "SELECT
  (SELECT count(*) FROM tickets.ticket_plans p    WHERE p.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=p.ticket_id))
+ (SELECT count(*) FROM tickets.ticket_comments c WHERE c.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=c.ticket_id))
+ (SELECT count(*) FROM tickets.ticket_links l    WHERE l.from_id  IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id=l.from_id));")" eq 0 "Orphan-Rows (ticket_plans/comments/links → tickets)"
row gate G-DB04 "$(db_backup_age_h)" le 26 "Backup-Alter (h) seit letztem erfolgr. db-backup-Job — T001738"

# ── DB-Gesundheit — TARGETS ──
row target G-DB01 "$(db_scalar "WITH fk AS (
    SELECT c.conrelid AS relid, c.conkey[1] AS col FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND array_length(c.conkey,1)=1),
  idx AS (SELECT i.indrelid AS relid, i.indkey[0] AS col FROM pg_index i)
  SELECT count(*) FROM (SELECT relid,col FROM fk EXCEPT SELECT relid,col FROM idx) x;")" le 0 "FK-Spalten ohne Index"
row target G-DB03 "$(db_scalar "SELECT
    (SELECT count(DISTINCT table_schema||'.'||table_name) FROM information_schema.columns
       WHERE column_name='brand' AND table_schema NOT IN ('pg_catalog','information_schema'))
  - (SELECT count(DISTINCT conrelid) FROM pg_constraint
       WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%brand%' AND pg_get_constraintdef(oid) ILIKE '%mentolder%');")" le 0 "brand-Spalten ohne CHECK-Constraint (messen)"
row target G-DB08 "$(db_scalar "SELECT count(*) FROM pg_stat_user_tables
    WHERE n_live_tup>10000 AND seq_scan>0
      AND (seq_scan::numeric/NULLIF(seq_scan+idx_scan,0))>0.05;")" le 3 "Tabellen >10k Rows mit Seq-Scan-Anteil >5% (messen)"
```

**Verifizierte Ist-Werte (live, 2026-07-09):** G-DB01 → 4 · G-DB03 → 44 · G-DB06 → 0 ·
G-DB08 → 1 (`chunks` 9.5 %; `questionnaire_answers` liegt mit 0.8 % unter der 5 %-Schwelle) ·
G-DB04 → ~163 h (6 d 19 h) 🔴 gegen den Live-Cluster, `-`/SKIP offline.

**GREEN-Nachweis:**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-quality-goals.bats
# expected: PASS — die 5 IDs werden jetzt gerendert (unter --fast als SKIP), Exit 0/1.
```

### Task 3 — `.claude/lib/goals.md`: 5 Ziel-Einträge + Messzyklus + Offene-Tickets

**Datei:** `.claude/lib/goals.md` (geändert)

**3a — Fünf Ziel-Einträge** im Format der bestehenden Einträge (Prosa `**Was:**`, Mess-Befehl im
Code-Fence, Meta-Zeile `Priorität · Baseline · Target · Aufwand · Messzyklus · Reproduzierbar ·
Ticket`). Einordnung:

- **G-DB06** (Gate, grün) → Prio-C-Tabelle (Green Gates), Zeile analog zu den G-SEC-Einträgen:
  `| G-DB06 | Orphan-Rows (3 FK-Paare) | 0 ✓ | 0 | db_scalar NOT-EXISTS-Summe |`.
- **G-DB04** (Gate, aktuell rot) → Prio-A (Aktive Defekte), voller Eintrag mit `**A**`-Meta-Zeile,
  Baseline `6d19h 🔴`, Target `≤ 26 h`, Ticket `T001739`, Querverweis auf `T001738` (Root-Cause).
- **G-DB01**, **G-DB03**, **G-DB08** (Targets) → Prio-B (Offene Ziele), je ein voller Eintrag.
  G-DB01 Baseline 4 → 0; G-DB03 Baseline 44 → 0 mit explizitem Vermerk „nur Messung verdrahtet,
  kein erzwungener Fix aller 44 Tabellen"; G-DB08 Baseline 1 (dokumentiert, `chunks` 9.5 %) →
  Target `≤ 3`, Vermerk „messen → dokumentieren, kein hartes Target initial".

Jede Meta-Zeile trägt `**Reproduzierbar:** ja` und `**Ticket:** T001739` (G-DB04 zusätzlich
`(Root-Cause T001738)`). Die Mess-Befehle in den Code-Fences sind die `db_scalar`/`db_backup_age_h`-
Einzeiler aus Task 2 (SSOT ist das Skript; goals.md zeigt den Kern-Query zur Nachvollziehbarkeit).

**3b — Messzyklus-Abschnitt** (`# Mess-Werkzeug {#mess-werkzeug}`):
- In der **Täglich**-Zeile die nie definierte Phantom-ID `G-DATA01` durch `G-DB04` ersetzen — das
  ist genau der tägliche DB-Check, auf den der Phantom-Anker gestikulierte (behebt zugleich eine
  hängende Referenz).
- In der **Wöchentlich**-Zeile `G-DB01, G-DB03, G-DB06, G-DB08` ergänzen.

**3c — Offene-Tickets-Tabelle** (am Dateiende) um fünf Zeilen erweitern:

```
| G-DB01 | T001739 | offen (Messung verdrahtet; Index-Fix ausstehend) |
| G-DB03 | T001739 | offen (Messung verdrahtet; CHECK-Constraints ausstehend) |
| G-DB04 | T001739 | offen (rot; Root-Cause T001738) |
| G-DB06 | T001739 | gruen (Gate, halten) |
| G-DB08 | T001739 | offen (dokumentierte Baseline, kein hartes Target) |
```

**Verifikation:**

```bash
bash scripts/health-goals-check.sh --only=G-DB01,G-DB03,G-DB04,G-DB06,G-DB08 || true
grep -c 'G-DB0[13468]' .claude/lib/goals.md   # >= 5 Vorkommen erwartet
```

### Task 4 — Delta-Spec `openspec/changes/db-quality-goals/specs/db-quality-goals.md`

**Datei:** `openspec/changes/db-quality-goals/specs/db-quality-goals.md` (geändert)

Das Skeleton (`## ADDED Requirements` mit Platzhalter-Requirement) durch fünf echte Requirements
ersetzen — ein `### Requirement: G-DBxx …` (H3, englisch, `SHALL`) plus mindestens ein
`#### Scenario:` (H4, Given/When/Then) je Ziel-ID. Stil-Vorbild ist
`openspec/specs/agentic-tooling-quality-goals.md` (`### Requirement: G-AGENTIC0x …` gefolgt von
`#### Scenario:` mit `**GIVEN**/**WHEN**/**THEN**`). Die H2-Operationsheader-Zeile
`## ADDED Requirements` bleibt erhalten.

Je Requirement wird festgehalten: Messquelle (read-only `db_scalar`/`db_backup_age_h`), Klasse
(Gate vs. Target), und dass der Ist-Wert in `goals.md` als Baseline dokumentiert wird — ohne CI-Fail
(bei Targets) bzw. mit CI-Fail bei Verletzung (bei G-DB06). Grundgerüst für einen Eintrag:

```markdown
### Requirement: G-DB06 Orphan-Row Integrity Gate

The measurement command SHALL count orphan rows across the FK pairs
`tickets.ticket_plans.ticket_id`, `tickets.ticket_comments.ticket_id`, and
`tickets.ticket_links.from_id` (each referencing `tickets.tickets.id`) using read-only
`NOT EXISTS` sub-queries. This is a Gate — a non-zero total SHALL fail
`scripts/health-goals-check.sh`.

#### Scenario: No orphan rows across the tracked FK pairs

- **GIVEN** the three FK pairs in the `tickets` schema
- **WHEN** the G-DB06 measure command runs against the live `shared-db`
- **THEN** the summed orphan count is 0 and the gate passes
```

Analog für G-DB01 (Target, FK-Spalten ohne Index, Baseline 4), G-DB03 (Target, brand-Spalten ohne
CHECK, Baseline 44), G-DB04 (Gate, Backup-Alter ≤ 26 h, verweist auf T001738), G-DB08 (Target,
Seq-Scan-Anteil >5 % auf Tabellen >10k Rows, Baseline 1).

**Verifikation:**

```bash
bash scripts/openspec.sh validate    # bzw. task test:openspec — muss gruen sein
```

### Task 5 — Test-Inventar + finale CI-Gates

**5a — Test-Inventar regenerieren** (neuer BATS-File → sonst failt der CI-Inventory-Check):

```bash
task test:inventory   # aktualisiert website/src/data/test-inventory.json
```

`website/src/data/test-inventory.json` mitcommitten.

**5b — OpenSpec-Validierung** vor dem Commit:

```bash
task test:openspec    # (== bash scripts/openspec.sh validate) — Delta-Spec muss valide sein
```

**5c — Die drei verpflichtenden CI-Gates** (STRUCT3):

```bash
task test:changed          # gezielte Tests der geaenderten Domains (inkl. tests/spec/db-quality-goals.bats)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Aequivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Alle drei müssen grün sein. `freshness:check` bestätigt zugleich, dass kein Baseline-Eintrag
hinzugefügt wurde und die S1-Budgets (Abschnitt „File Structure") eingehalten sind.

## Out of Scope (bewusst NICHT in diesem Plan)

- Root-Cause-Fix für T001738 (db-backup-Ausfall) — separates Ticket.
- Nachziehen der 4 fehlenden Indizes (G-DB01) bzw. der 44 CHECK-Constraints (G-DB03) — dieser Plan
  verdrahtet nur die Messung.
- G-DB05 (Restore-Test-Automatisierung) — separates Folge-Ticket.
- Observability/Runtime-Health und DX/Agent-Effizienz-Kategorien — Backlog (siehe Design-Spec).
