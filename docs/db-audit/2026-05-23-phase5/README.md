# DB Audit Phase 5 — 2026-05-23

Multi-phase audit of the `shared-db` on both `mentolder` and `korczewski` clusters. Continuation of Phases 1–4 (denormalization, brands FKs, billing cleanup).

## Files
- [`findings.md`](findings.md) — Full categorized findings report (13 entries, organized by detection module).
- [`decision-log.md`](decision-log.md) — Per-DROP approval record (empty — no DROP candidates this phase).
- [`evidence/`](evidence/) — Raw query outputs (CSV / JSON / text) referenced from findings.

## Headline numbers
- 171 missing table comments (autonomous fix)
- 96 missing FK indexes across both clusters (autonomous fix)
- 8 column drift items in shared tables (1 autonomous fix candidate, 7 mentolder-only `systemtest_failure_outbox` columns to back-fill on korczewski)
- 0 removed-feature orphans found (Phase 1–4 was thorough)
- 0 DROP candidates qualified — Module 2 (runtime stats) gated out by recent postgres restart (3.5d uptime, needs ≥30d)

## Spec
Design-Doc entfernt (Doc-Cleanup T001869) — Volltext in der Git-History
(`docs/superpowers/specs/2026-05-23-db-audit-phase5-design.md`). Das wiederverwendbare
Vorgehen (Module, Tiering-Kriterien, Safety-Rails) ist destilliert in
[`docs/runbooks/db-audit-playbook.md`](../../runbooks/db-audit-playbook.md).

## Plan
Kein separater Implementierungsplan — Audit wurde inline ausgeführt (siehe `evidence/` und Hinweis im Re-running-Abschnitt unten).

## Ticket
[T000150](https://web.mentolder.de/admin/bugs)

## Re-running collection
```bash
# Evidence files were collected ad-hoc via kubectl exec; to repeat:
# (the per-script versions referenced in the plan were not generated this run —
#  inline commands captured everything; see git log for the exact commands)
```

## Next audit window
**2026-06-19** or later — once both clusters have >30 days postgres uptime, re-run Module 2 to identify true cold tables eligible for DROP.
