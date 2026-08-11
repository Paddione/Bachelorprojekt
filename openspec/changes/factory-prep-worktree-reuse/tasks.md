---
title: "factory-prep-worktree-reuse — Implementation Plan"
ticket_id: T003270
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-prep-worktree-reuse — Implementation Plan

_Ticket: T003270_

## Why

Der Worktree-Pre-Create in `scripts/vda/factory-prep.sh` scheitert dauerhaft,
wenn der Ziel-Branch bereits in einem anderen Worktree ausgecheckt ist
(real: `.worktrees/mishap-incident-rollup` haelt `chore/mishap-incident-rollup`).
Jeder Tick: schedule → pre-create `worktree-create.sh` exit 3 → SKIP
`worktree_failed` → Slot frei → naechster Tick identisch. Endlos-Loop.

Zwei Loesungsstraenge (T003270, Loesungsraum):
- **V1 (Reuse):** Ist der Branch in einem anderen Worktree ausgecheckt, der
  Worktree sauber und keine live Session haelt den Branch, wird ER als
  `worktree_path` weitergenutzt statt zu scheitern.
- **V4 (Eskalation):** Wiederholte `worktree_failed`-SKIPs zaehlen in
  `tickets.factory_control` (`prep_skip:<id>`); ab 3 eskaliert `unfactory`
  (blocked + needs_human) statt stillem Loop.

Dazu muss `worktree_path` bis in `pipeline.mjs` durchgereicht werden — heute
berechnet die Pipeline ihren Worktree selbst aus dem slug.

## File Structure

```
scripts/vda/factory-prep.sh          — V1-Reuse-Detect + V4-Eskalations-Zaehler
scripts/factory/dispatcher-bridge.sh — worktree_path in Workflow-Args durchreichen
scripts/factory/dispatcher.js        — worktree_path an pipeline.mjs durchreichen
scripts/factory/pipeline.mjs         — WORK_WT-Override via A.worktree_path
tests/spec/software-factory/factory-prep-worktree-reuse.bats — BATS (RED, liegt bereits vor)
```

## Tasks

### Task 1: V1 — Reuse eines bestehenden Worktrees in factory-prep.sh

`scripts/vda/factory-prep.sh`, Pre-Create-Block (`wt_path=null` …). Vor dem
`worktree-create.sh`-Aufruf:

1. `git worktree list --porcelain` parsen und pruefen, ob `branch refs/heads/<branch>`
   in einem ANDEREN Worktree liegt (Pfad != `${wt_path}`).
2. Wenn belegt UND `bash scripts/agent-lock.sh check-branch-live <branch>` meldet
   `free` UND `git -C <pfad> status --porcelain` ist leer → `wt_path=<pfad>` setzen,
   kein `worktree-create.sh`-Aufruf, kein SKIP. Der bestehende Worktree wird
   wiederverwendet.
3. Wenn belegt UND (live ODER dirty) → bestehenden SKIP-Pfad beibehalten
   (reason `worktree_failed`), der fremde Stand wird nie uebernommen.
4. `worktree_path` im Launch-JSON bleibt korrekt gesetzt (bereits vorhanden).

S1-Budget `scripts/vda/factory-prep.sh`: Ist 233 - Baseline 0 -> Budget 567 (.sh, Limit 800).

Qualitäts-Gates: BATS-Tests V1 (Reuse / Live-SKIP / dirty-SKIP) gruen.

### Task 2: V4 — prep_skip-Zaehler + Eskalation nach 3 Fehlversuchen

`scripts/vda/factory-prep.sh`, SKIP-Pfad (`worktree_failed`):

1. Vor dem SKIP: `ticket.sh factory-control get --key prep_skip:<ext_id> --brand <brand>`
   lesen (Default 0), inkrementieren, `factory-control set` schreiben.
2. Ab Zaehlerstand >= 3: `ticket.sh unfactory --id <ext_id>` aufrufen
   (status=blocked, attention_mode=needs_human) — analog Watchdog-Eskalation
   (T002389). Der Slot-Release + Status-Restore (T003269) laufen weiter.
3. Bei ERFOLGREICHEM Pre-Create (Task 1 Pfad 1/2 oder normaler Anker) den Zaehler
   auf 0 zuruecksetzen (`factory-control set prep_skip:<ext_id> 0`).

S1-Budget `scripts/vda/factory-prep.sh`: Ist 233 - Baseline 0 -> Budget 567 (.sh, Limit 800) — gleiche Datei wie Task 1, Summe beider Aenderungen bleibt unter dem Budget.

Qualitäts-Gates: BATS-Tests V4 (Eskalation bei 3, Reset bei Erfolg) gruen.

### Task 3: worktree_path bis in pipeline.mjs durchreichen

1. `scripts/factory/dispatcher-bridge.sh`: im Workflow-Args-Block (Zeile ~100-112)
   `worktree_path:$(if …)` ergaenzen (analog `plan_path`).
2. `scripts/factory/dispatcher.js`: im `workflow(...)`-Aufruf (Zeile ~139-145)
   `worktree_path: f.worktree_path || null` ergaenzen.
3. `scripts/factory/pipeline.mjs`: `WORK_WT` berechnet sich heute aus `safeSlug`
   (Zeile ~149). Wenn `A.worktree_path` gesetzt ist, diesen Wert als `WORK_WT`
   verwenden, sonst bisherige Berechnung.

S1-Budgets: `scripts/factory/dispatcher-bridge.sh` Ist 159 - Baseline 0 -> Budget 641
(.sh, Limit 800); `scripts/factory/dispatcher.js` Ist 210 - Baseline 0 -> Budget 590
(.js, Limit 800); `scripts/factory/pipeline.mjs` Ist 731 - Baseline 0 -> Budget 69
(.mjs, Limit 800) — die pipeline.mjs-Aenderung bleibt auf wenige Zeilen beschraenkt.

Qualitäts-Gates: `node --check` auf den JS-Dateien; kein Verhaltensbruch der
unbelegten Fälle (Worktree-Pfad bleibt wie bisher).

### Task 4: Verify (RED → GREEN) und Gesamtdurchlauf

1. RED-Phase ist abgeschlossen — `tests/spec/software-factory/factory-prep-worktree-reuse.bats`
   schlaegt in Tests 2/5/6 erwartungsgemaeß fehl (Stand: Committet als RED).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-prep-worktree-reuse.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

2. Nach Tasks 1-3 gruen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-prep-worktree-reuse.bats
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-prep-stdout-json.bats
# expected: PASS (gruen — Reuse + Eskalation implementiert, JSON-Stream unveraendert)
```

3. Final Verification — die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Neue Datei (kein S1-Limit fuer .bats): `tests/spec/software-factory/factory-prep-worktree-reuse.bats`.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test
      `tests/spec/software-factory/factory-prep-worktree-reuse.bats` liegt
      bereits im Branch und schlaegt rot (Reuse fehlt, Eskalation fehlt).
      Er wird im ersten Implementierungs-Commit mitgefuehrt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-prep-worktree-reuse.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Tasks 1-3 umsetzen; der BATS-Test muss vollstaendig gruen sein.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
