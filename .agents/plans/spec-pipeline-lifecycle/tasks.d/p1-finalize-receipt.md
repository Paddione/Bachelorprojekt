---
id: P1
role: impl
ticket: T900999
depends_on: []
target_files:
  - scripts/devflow-post-merge-finalize.sh
---

# P1 Finalize-Receipt (Schritt 7, ohne Delete)

Ziel: `finalize` Schritt 7 schreibt nach dem Merge ein Receipt nach
`tickets.ticket_plans` (Plan-Frontmatter + Check-Evidenz + Merge-SHA).
KEIN Delete in diesem Partial — das ist P2 (`branch-reaper.sh`).

## Steps

1. `scripts/devflow-post-merge-finalize.sh` lesen: Schritt 7 finden,
   bestehende Archiv-Logik und DB-Zugriff (`ticket.sh`-Helper) verstehen.
2. Receipt-Payload festlegen: Plan-Frontmatter (id, ticket, slug),
   Check-Evidenz (plan-lint PASS, Test-Nachweis) und Merge-SHA; Feldnamen
   an `tickets.ticket_plans`-Schema anlehnen, nichts raten — Schema pruefen.
3. Schritt 7 erweitern: nach Merge das Receipt per Upsert nach
   `tickets.ticket_plans` schreiben; idempotent (erneuter Lauf kein Duplikat).
4. Fail-open vermeiden: DB-Schreibfehler -> exit != 0 mit klarer Meldung,
   kein stilles Weiterlaufen; kein `git rm`, kein Ordner-Delete hier.
5. Trockenlauf: finalize auf einem Test-Ticket/einer Fixture ausfuehren,
   Receipt-Zeile in `tickets.ticket_plans` verifizieren (SELECT per psql).
6. Regression: vorhandene finalize-BATS/Tests laufen lassen
   (`task test:changed` bzw. zuständige BATS-Suite); Gruen dokumentieren.
7. Disjunktheit pruefen: nur `scripts/devflow-post-merge-finalize.sh`
   geaendert (`git status --porcelain`); keine anderen Dateien anfassen.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS (0 hard)
- Finalize-BATS bzw. `task test:changed` gruen (falls keine finalize-Tests
  vorhanden: Trockenlauf-Nachweis aus Schritt 5)
