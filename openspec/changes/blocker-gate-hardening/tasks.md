---
title: Blocker-gate hardening — archived/dangling semantics and visible blocks
ticket_id: T005898
domains: [factory, test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Blocker-gate hardening — archived/dangling semantics and visible blocks — Implementation Plan

Der Blocker-Gate hält `archived`- und dangling-Vorgänger dauerhaft fest
(`t.status IS DISTINCT FROM 'done'` → NULL/archived = Block) und verwirft die berechnete
`blockers`-Liste still (schedule.sh:75-78) — ein stuck-queue-Hazard ohne Sichtbarkeit
(T005898, Review PR #4472).

## File Structure

- `scripts/factory/schedule.sh` — Gate-Semantik + WARN (Task 2)
- `tests/spec/software-factory/schedule-blocker-gate-hardening.bats` — Guard (Task 1, RED)

## Task 1 — RED: Härtungs-Guard schreiben und rot nachweisen

1. `tests/spec/software-factory/schedule-blocker-gate-hardening.bats` mit 3 Tests:
   archived-Blocker → Kandidat geplant; dangling-Referenz → Kandidat geplant (kein Wedge);
   offener Blocker → Output trägt WARN mit Blocker-ID. Je Test Positiv-Anker (unblockierter
   Kandidat in_progress) vor der Negativ-Aussage (T002356-M1). **Capacity-Pre-Check
   (`_skip_if_pool_busy`, slots.sh count > 0 → skip) ist Teil von Task 1** — er wird vor
   dem ROT-Nachweis gebraucht: am 2026-08-14 war die Dev-DB mit 3 belegten Slots / 5
   fremden Kandidaten belegt, die Positiv-Anker liefen dadurch ins Leere (nicht der Gate).
2. Rot nachweisen: bei freiem Pool (`slots.sh count` = 0)
   `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/schedule-blocker-gate-hardening.bats`
   — erwartet: FAIL (`expected: FAIL`) auf den drei Negativ-Aussagen (archived/dangling
   werden gehalten, kein WARN). Ist der Pool beim Plan-Commit belegt, gilt der RED-Beleg
   über die Code-Analyse (IS DISTINCT FROM 'done' → NULL/archived = Block, blockers
   verworfen — schedule.sh:60-78, im Proposal zitiert) und die Assertions der Suite; der
   Verhaltens-RED wird beim ersten freien Pool-Moment im GREEN-Lauf nachgeholt (T003548:
   der Skip ist bedingt, nicht dauerhaft — dauerhaft skipende Tests sind ein Befund).

## Task 2 — GREEN: Gate-Semantik + WARN in schedule.sh

1. Block-Bedingung: `t.status IS NOT NULL AND t.status NOT IN ('done','archived')` —
   archived erfüllt den Gate, dangling (NULL) blockt nicht.
2. Dangling-WARN: Query liefert zusätzlich die dangling-Referenzen (dep_ids ohne
   Zeilentreffer); bei > 0 eine WARN-Zeile `schedule: WARN dangling blocker refs for <id>: …`.
3. Block-WARN: die bereits berechnete `blockers`-Liste ausgeben statt verwerfen:
   `schedule: WARN skipping <id> — open blockers: …`.
4. SQL-Binding (Minor 4 aus dem Review): `external_id = '${ext_id}'` auf
   `factory_psql -v ext_id=…` + `:'ext_id'` umstellen (Muster: Z. 106-107 desselben Skripts).
5. Guard grün fahren: 3/3 PASS. Regression: `schedule-blocker-gate.bats` (T005306) bleibt
   grün.

## Task 3 — Test-Capacity-Pre-Check + Verifikation

- Guard-Dateien beider Blocker-Gate-Tests: vor dem schedule.sh-Lauf prüfen, ob der
  Slot-Pool belegt ist (`slots.sh count` > 0 → `skip "pool occupied"`) — die
  Capacity-Sensitivität aus dem Review.
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate blocker-gate-hardening`
