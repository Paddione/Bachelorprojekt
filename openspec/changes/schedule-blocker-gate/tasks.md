---
title: Fix fail-open dependency blocker gate in schedule.sh
ticket_id: T005306
domains: [factory, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Fix fail-open dependency blocker gate in schedule.sh — Implementation Plan

Der Blocker-Gate in `scripts/factory/schedule.sh` (Z. 48-67) referenziert
`json_agg(d.external_id)`, aber das Subquery-Alias `d` liefert nur `dep_id`
(`SELECT unnest(depends_on) AS dep_id`). Die Query scheitert still, `blocker_json`
bleibt leer, der Gate wird übersprungen — Tickets mit offenen `depends_on`-Vorgängern
werden geplant (T005306).

## File Structure

- `scripts/factory/schedule.sh` — Blocker-Gate-Query korrigieren, Fehler sichtbar machen (Task 2)
- `tests/spec/software-factory/schedule-blocker-gate.bats` — Verhaltens-Test (Task 1, RED)

## Task 1 — RED: Verhaltens-Test schreiben und rot nachweisen

**DONE (2026-08-14):** Test liegt im Branch-Commit; Rot nachgewiesen — FAIL auf der
Negativ-Aussage: `blocked candidate T005684 was claimed (status=in_progress) — blocker gate fail-open`.

1. `tests/spec/software-factory/schedule-blocker-gate.bats` anlegen
   (`seed_real_feature`-Muster, echter schedule.sh-Lauf mit `FACTORY_GLOBAL_CAP=3`,
   Messung über Ticket-Status nach dem Lauf — DRY_RESOLVE emittiert keinen Plan-Output,
   der Dry-Modus scheidet als Messpunkt aus; Positiv-Anker: unblockierter Kandidat C
   in_progress; Negativ: blockierter Kandidat B NICHT in_progress;
   Teardown-Cleanup via `_sf_teardown`-Registry seit T005309).
2. Rot nachweisen: `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/schedule-blocker-gate.bats`
   — erwartet: FAIL (`expected: FAIL`) auf der Negativ-Aussage: B erscheint heute im
   Launch-Plan (Gate wirkungslos).

## Task 2 — GREEN: Gate-Query korrigieren und Fehler sichtbar machen

**DONE (2026-08-14):** `json_agg(d.dep_id)`; zusaetzlich war der COALESCE-Fallback
wirkungslos (json_build_object ist nie NULL — Kandidaten ohne depends_on kamen als
`{'blocked': true, 'blockers': null}` zurueck) → Query auf `bool_or` + `FILTER` umgestellt.
stderr wird mitgefasst, Query-Fehler skippen den Kandidaten sichtbar (fail-closed).
Guard gruen: PASS (B nicht in_progress, C in_progress).

1. `scripts/factory/schedule.sh`: `json_agg(d.external_id)` → `json_agg(d.dep_id)`
   (dep_id trägt bereits die externe Blocker-ID aus `unnest(depends_on)`).
2. Fehler-Sichtbarkeit: stderr des `factory_psql` nicht vollständig verwerfen — bei
   leerem Ergebnis trotz SQL-Fehler abbrechen (fail-closed), statt den Gate still zu
   überspringen. Mindestens: Fehlertext in die schedule.sh-Ausgabe leiten, damit ein
   künftiger Query-Defekt nicht wieder lautlos fail-open wird.
3. Guard grün fahren: derselbe bats-Aufruf wie in Task 1 — erwartet: PASS
   (B nicht im Plan, C im Plan).

## Task 3 — Verifikation

**DONE (2026-08-14):** siehe Noten unten.

- `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/schedule-blocker-gate.bats tests/spec/software-factory/scheduling.bats` — beide grün
  > Notiz: `schedule-blocker-gate.bats` gruen (isoliert und als Suite). In der Suite
  > rot sind FA-SF-73/FA-SF-25 (Tests 7/12/13) — A/B-Beweis mit Original-schedule.sh
  > (git stash): identische Fehlschlaesge OHNE diese Aenderung. Ursache: fremde echte
  > Queue-Kandidaten (T004893, T005306) in der Dev-DB fuellen Cap/Slots — dokumentierte
  > Vorbedingung "saubere Dev-DB" (T005309) verletzt; FA-SF-73 ruft schedule.sh nicht auf.
- `task test:changed` + `task freshness:regenerate` + `task freshness:check`
- `bash scripts/openspec.sh validate schedule-blocker-gate`
