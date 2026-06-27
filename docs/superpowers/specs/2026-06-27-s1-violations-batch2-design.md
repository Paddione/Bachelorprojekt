---
ticket_id: T001155
plan_ref: openspec/changes/s1-violations-batch2/tasks.md
status: active
date: 2026-06-27
---

# Design Spec: s1-violations-batch2 (G-RH01 Wave 2)

**Datum:** 2026-06-27
**Ticket:** T001155 (Folge von Batch 1: T001108, gemergt in #2083)
**Branch:** feature/s1-frozen-paydown
**Status:** approved
**Slug:** `s1-violations-batch2`
**Plan-Datei:** `openspec/changes/s1-violations-batch2/tasks.md`

---

## Kontext

G-RH01 verlangt `docs/code-quality/baseline.json` von ursprünglich 98 auf ≤ 30 Einträge. Batch 1 (T001108, PR #2083) hat zwei Hebel gezogen: `task quality:baseline:refresh` entfernte stale Einträge, und `website/src/lib/questionnaire-db.ts` (1227 LOC) wurde in `questionnaire-db/{queries,scoring,types,index}.ts` aufgeteilt. Ergebnis: 98 → 70.

Stand 2026-06-27: 70 Einträge, davon ~30 S1-Frozen-Files mit echtem Refactoring-Bedarf. Die zwei größten verbleibenden Source-Files mit niedrigstem Risiko sind:

| File | LOC | Test-Coverage | Warum jetzt |
|---|---|---|---|
| `website/src/lib/tickets-db.ts` | 1096 | vitest indirekt (16 Siblings in `tickets/`) | Pattern bereits im Repo etabliert (`tickets/admin.ts` 677 LOC) |
| `scripts/backup-restore.sh` | 1037 | BATS exzellent (5 BATS-Dateien in `tests/unit/`) | Klarer Subcommand-Split, Helpers extrahierbar |

Gleichzeitig fehlt ein harter CI-Guard: `Taskfile.yml:937-965` blockiert Baseline-Key-*Wachstum*, erlaubt aber neue Keys, sofern sie pre-existing main violations einfrieren. Diese Grauzone hat historisch zur 98-Einträge-Spitze beigetragen.

---

## Ziel

In **einer PR + einem Sprint**:

1. `website/src/lib/tickets-db.ts` (1096) aufteilen in 3-4 Sibling-Module unter `tickets/`, sodass die Datei als Re-Export-Compat-Index ≤ 200 LOC hat
2. `scripts/backup-restore.sh` (1037) aufteilen in Helper-Lib + 4 Subcommand-Skripte, sodass das Hauptscript ≤ 200 LOC hat
3. CI-Guard härten: `freshness:check` blockt **jede** Erweiterung von `baseline.json` um neue Keys, sofern nicht explizit per PR-Tag `[baseline-allow:<reason>]` freigegeben
4. `task quality:baseline:refresh` ausführen → Baseline sinkt auf ≤ 30 Einträge
5. Failing-Test → GREEN: `tests/spec/s1-violations-batch2.bats` zählt `baseline.json` ≤ 30

Erwarteter Endstand: 70 → 25-28 Einträge, Restbestand sind Tickets-DB-Submodule + script-Shell-Dispatches (kein Refactoring-Bedarf).

---

## Nicht im Scope

- `InboxApp.svelte` (1017 LOC, **keine** Tests) → bleibt für Wave 3 mit vorherigem vitest-Aufbau
- `QuestionnaireView.svelte`, `helpContent.ts`, `projekte/[id].astro`, `InboxDetail.svelte` und alle weiteren Top-30-Files → Wave 3+
- Sanctioned ignore-list (`website-db.ts` 4485 LOC, `GLTFLoader.js` 3629 LOC, `ticket.sh`, `pipeline.js`) → bleibt
- Schwellwert-Absenkung in `gates.yaml` (S1-Limit pro Extension) → nicht in dieser Welle
- Komplette S2/S3/S4-Violations (24/12/4 Einträge separat) → separater Plan

---

## Architektur-Entscheidungen

### A1. tickets-db.ts Split-Pattern

Existierendes Vorbild: `website/src/lib/tickets/admin.ts` (677 LOC, eigenständig, getestet via `tickets/cockpit-schema.test.ts` etc.). Die Top-Level-Datei `tickets-db.ts` exportiert heute drei Symbole: `ticketEmbeddingModel()`, `initTicketsSchema()` (~1063 LOC Body), `isFeatureEnabled()`. Der Body von `initTicketsSchema` ist eine Kaskade von `pool.query(...)` für ~15 Tabellen + ~25 Indexes + 5 partial-unique Constraints.

**Split:**
- `tickets/tables/tickets.ts` (≈ 250 LOC) — DDL für `tickets.tickets`, `ticket_links`, `ticket_activity`, `ticket_comments`
- `tickets/tables/factory-control.ts` (≈ 200 LOC) — DDL für `factory_control` + `pipeline_*` Tabellen
- `tickets/tables/systemtest-linkback.ts` (≈ 150 LOC) — `ALTER TABLE … ADD COLUMN IF NOT EXISTS source_test_*` (parallel zu `systemtest/db.ts`)
- `tickets/migrations.ts` (≈ 200 LOC) — Legacy-Migrations-Patches aus Zeilen 87-112, 222-230
- `tickets-db.ts` (≤ 200 LOC) — `initTicketsSchema()` ruft die 4 Module sequentiell auf, Re-Export von `ticketEmbeddingModel` + `isFeatureEnabled`

API-Bruch: **keiner**. Bestehende Importer nutzen `import { initTicketsSchema } from '~/lib/tickets-db'` — bleibt durch Index-File.

### A2. backup-restore.sh Split-Pattern

Heute: ein 1037-Zeilen-Script mit usage (10-64), flag-parsing (66-83), helpers (85-130), und ein riesiger `case "$CMD" in … esac` Block (132+). Die BATS-Tests prüfen nur den Public-Surface (Subcommands, exit codes, stdout) — Refactor ist verhältnismäßig sicher.

**Split:**
- `scripts/backup-restore-lib.sh` (≈ 100 LOC) — sourced: `_die`, `_render_recovery_browser`, `_db_pass_key`, `_pvc_service_mount`, `_target_kind`, `usage`
- `scripts/backup-restore-db.sh` (≈ 250 LOC) — `cmd_db_*` Subcommands
- `scripts/backup-restore-pvc.sh` (≈ 250 LOC) — `cmd_pvc_*` Subcommands
- `scripts/backup-restore-filen.sh` (≈ 200 LOC) — `cmd_filen_*` Subcommands
- `scripts/backup-restore-recovery.sh` (≈ 250 LOC) — `cmd_recovery_*` Subcommands
- `scripts/backup-restore.sh` (≤ 200 LOC) — usage + flag-parsing + `case "$CMD" in db|pvc|filen|recovery) exec scripts/backup-restore-$CMD.sh "$@" ;; esac`

API-Bruch: keiner. `bash backup-restore.sh <subcmd>` bleibt die Aufrufform. BATS-Suite bleibt unverändert grün.

### A3. CI-Guard Härtung

Heute (`Taskfile.yml:937-965`): Baseline-Key-Count-Assertion blockt nur, wenn `count > frozen-count-of-main`.

**Neu:** Assertion-Hardening-Patch in `scripts/code-quality/baseline-key-count-assertion.mjs` (oder inline-Erweiterung der bestehenden Assertion):
- `diff = current_keys - main_keys` (Set-Diff)
- `new_keys = diff.where(key not in main)`
- `if new_keys.length > 0:`
  - `if not pr_body.includes("[baseline-allow:"): exit 1` mit `Missing [baseline-allow:<reason>] tag for N new baseline key(s): <list>`
- Logik in `Taskfile.yml:Phase 3` der `freshness:check` Target-Pipeline einhängen

**PR-Tag-Konvention:** `[baseline-allow:vendor-exclude|merge-legacy|...]` im PR-Body. Reviewer-Pflicht bleibt (Human-in-the-Loop), aber Ventil für legitime Fälle (Vendor-Excludes, Merge-Erweiterungen).

### A4. Failing-Test

Datei: `tests/spec/s1-violations-batch2.bats`

```bats
@test "G-RH01: baseline.json hat ≤ 30 Einträge" {
  count=$(jq 'keys | length' "$REPO_ROOT/docs/code-quality/baseline.json")
  [ "$count" -le 30 ]
}

@test "G-RH01: tickets-db.ts ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/website/src/lib/tickets-db.ts")
  [ "$loc" -le 600 ]
}

@test "G-RH01: backup-restore.sh ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/scripts/backup-restore.sh")
  [ "$loc" -le 500 ]
}

@test "G-RH01: CI-Guard blockt neue Baseline-Keys ohne Tag" {
  # Test: Erstelle temp baseline.json mit +1 Key, kein Tag → freshness:check exit != 0
  # Skip im CI, nur lokal lauffähig
  skip "Local-only, requires git/PR context"
}
```

---

## Datei-Struktur (neu/erstellt)

```
docs/superpowers/specs/2026-06-27-s1-violations-batch2-design.md   ← DIESE DATEI
openspec/changes/s1-violations-batch2/
  ├── proposal.md                                                   ← NEU
  └── tasks.md                                                      ← NEU (vom Plan-Subagenten)
website/src/lib/
  ├── tickets-db.ts                                                 ← MODIFY: re-export-Index
  └── tickets/
      ├── tables/
      │   ├── tickets.ts                                            ← NEU
      │   ├── factory-control.ts                                    ← NEU
      │   └── systemtest-linkback.ts                                ← NEU
      └── migrations.ts                                             ← NEU
scripts/
  ├── backup-restore.sh                                             ← MODIFY: dünner Dispatcher
  ├── backup-restore-lib.sh                                         ← NEU: sourced Helpers
  ├── backup-restore-db.sh                                          ← NEU
  ├── backup-restore-pvc.sh                                         ← NEU
  ├── backup-restore-filen.sh                                       ← NEU
  └── backup-restore-recovery.sh                                    ← NEU
docs/code-quality/
  ├── baseline.json                                                 ← MODIFY: refresh nach Refactor
  └── baseline-key-count-assertion.mjs                              ← NEU (oder inline in Taskfile)
tests/spec/
  └── s1-violations-batch2.bats                                     ← NEU
Taskfile.yml                                                        ← MODIFY: Phase 3 Härtung
```

---

## Akzeptanzkriterien

| # | Kriterium | Verifikation |
|---|---|---|
| AC-1 | `baseline.json` ≤ 30 Einträge | `jq 'keys \| length' docs/code-quality/baseline.json` |
| AC-2 | `tickets-db.ts` ≤ 600 LOC | `wc -l website/src/lib/tickets-db.ts` |
| AC-3 | `backup-restore.sh` ≤ 500 LOC | `wc -l scripts/backup-restore.sh` |
| AC-4 | Alle bestehenden BATS-Tests grün | `task test:changed` |
| AC-5 | `vitest` für website/ grün | `npm --prefix website test` |
| AC-6 | `task quality:check` exit 0 | manuell |
| AC-7 | `task freshness:check` exit 0 | manuell + CI |
| AC-8 | CI-Guard blockt neue Keys ohne Tag | manueller Test (siehe AC-Skizze oben) |
| AC-9 | PR-Title: `chore(quality): s1-violations-batch2 (70→≤30) [T001108]` | bei Merge |

---

## Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| API-Bruch bei tickets-db.ts durch Sibling-Extract | niedrig | Re-Export-Compat-Index + vitest-Suite ist grüner Lackmustest |
| Shell-Sourcing-Bug in backup-restore.sh (Funktionen nicht in Subshells) | mittel | `_render_recovery_browser` via `source` aufgerufen, nicht `export -f`; `tests/unit/recovery-domain-durability.bats` deckt das ab |
| CI-Guard blockiert legitime Refactor-PRs in der Zukunft | mittel | PR-Body-Tag `[baseline-allow:<reason>]` + Reviewer-Pflicht |
| `_render_recovery_browser` Env-Vars nicht propagiert nach Subshell-Split | niedrig | `backup-restore-recovery.sh` bekommt die Vars via positional args oder `env` command |
| `freshness:check` Härtung bricht andere laufende Refactors | mittel | Tag-Konvention ist additive, kein Breaking Change; PR-Body-Scan ist non-invasive |

---

## Out-of-Band-Aufgaben (für dev-flow-execute)

1. Vor jedem Task: `bash scripts/agent-lock.sh reap` (Session-Coordination)
2. Vor Commit: `task test:changed` (BATS + vitest) — muss grün sein
3. Vor Push: `task freshness:regenerate` (Artefakte aktualisieren) + `task freshness:check` (Gate)
4. Nach Merge: `git push origin --delete feature/s1-frozen-paydown` (G-RH04-Policy)

---

## Verweise

- `openspec/changes/s1-violations-batch1/proposal.md` — Vorgänger-Welle (gemergt #2083)
- `.claude/lib/goals.md:8-32` — G-RH01 SSOT
- `scripts/code-quality/check.mjs:24-33` — S1-Blocking-Set-Logik
- `Taskfile.yml:937-965` — Baseline-Key-Count-Assertion (zu härten)
- `docs/code-quality/gates.yaml:s1.limits` — S1-Schwellwerte
- `tests/unit/recovery-domain-durability.bats` — deckt `_render_recovery_browser`-Vertrag ab
