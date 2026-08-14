---
ticket_id: T004893
plan_ref: openspec/changes/mishap-container-detect-real-db/tasks.md
status: active
date: 2026-08-14
---

# Design: mishap-container-detect-real-db

## Root-Cause (verifiziert)

`cmd_rollup_container` in `scripts/ticket.sh` verwendete bis T004898 eine positive
Status-Allowlist (`status IN ('triage','backlog','planning','plan_staged','in_progress')`).
`blocked` (und `in_review`/`qa_review`) waren unsichtbar → leerer Suchtreffer → neuer
Container angelegt. Reale Folge: T004752 neben T003533 (2026-08-14 07:50). Der Fix
(T004898, auf main) ersetzte die Allowlist durch `status NOT IN ('done','archived')`.

## Fix-Ansatz (dieser Change: Verifikationslücke schließen)

Der Produktions-Fix ist gemergt; offen ist die Verifikation gegen die echte DB.
Neuer BATS-Test `tests/spec/mishap-rollup/container-resolution-real-db.bats`:

1. **Guard (T002820, Rotphase):** Cluster/DB erreichbar? Sonst `skip` — CI skippt
   sauber, lokal (k3d) läuft der Test.
2. **Positiv-Anker (T002356-M1):** Befehl läuft, Output nicht leer.
3. **Aussage A:** Output == der einzige offene Container (per eigenständigem
   DB-Read ermittelt; aktuell T005030) — kein Create-Pfad.
4. **Aussage B:** Open-Container-Count == 1 nach dem Lauf (kein Duplikat).
5. **Aussage C:** kubectl-Passthrough-Wrapper (repo-Idiom, erweitert um
   `exec`-Durchreichung) loggt das emittierte SQL → `status NOT IN ('done','archived')`
   vorhanden, keine `status IN (`-Allowlist. Rot gegen prä-T004898-Code.

RED-Beweis im Wegwerf-Worktree von 9f3e271ed: Aussage C schlägt dort fehl.

## Subsysteme

- `scripts/ticket.sh` (cmd_rollup_container) — nur gelesen, nicht geändert
- `tests/spec/mishap-rollup/` — neue Testdatei (Spec-Dir-Konvention T002416)
- `website/src/data/test-inventory.json` — Regenerierung (CI-Inventar)

## Edge-Cases

- CI ohne Cluster → skip (kein Dauerrot).
- Container-Rotation: Test ermittelt die erwartete ID per DB-Read statt sie
  hart zu kodieren — robust gegen künftige Container-Rotation.
- Kein Container vorhanden (theoretischer Fall): Test schlägt fehl (Anker),
  weil der Create-Pfad nie ausgelöst werden darf, wenn die Invariante
  "genau ein offener Container" gilt — bewusste Design-Entscheidung, die
  Situation wird durch die laufende Produktion (Container existiert immer
  nach dem ersten Flush) nicht erreicht.
- Fremd-Dateien: `tests/spec/software-factory/scheduling.bats`,
  `scripts/branch-reaper.sh` und plan-lint werden NICHT angefasst (parallele
  Sessions).
