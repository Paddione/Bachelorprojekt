# p1 — Shell-Guard-Ausnahme in update-status.sh (T003072)

## Ziel

Der Terminal-Guard in `scripts/vda/ticket/update-status.sh` (T002382) blockt
`done → <nicht-terminal>` ausnahmslos. Ein fälschlich als done angelegtes
Ticket (`resolution IS NULL`, `created_at = updated_at`) muss über den
sanktionierten Pfad reparierbar sein.

## Steps

1. **RED.** `tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats --filter 'T003072'`
   — Test 1 (update-status.sh) schlägt fehl. `expected: FAIL`.

2. **GREEN.** In `scripts/vda/ticket/update-status.sh`:
   - Guard-SELECT erweitern (T002906-Bindung `:'tid'` beibehalten):
     `SELECT status || '|' || COALESCE(resolution,'') || '|' || (created_at = updated_at)::text FROM tickets.tickets WHERE external_id = :'tid' LIMIT 1;`
     Das `|`-Delimiter überlebt das bestehende `tr -d '[:space:]'`.
   - Ergebnis splitten: `IFS='|' read -r _cur_status _cur_res _no_lifecycle <<<"…"`.
   - Im `done:*)`-Zweig: wenn `_cur_res` leer UND `_no_lifecycle = "t"` →
     `echo "WARN: invalid done state (no resolution, no lifecycle) — allowing repair transition to '$status'." >&2`
     und weiterlaufen (kein Exit); sonst unverändert Exit 2 mit der
     bestehenden Fehlermeldung.
   - `archived:*`, `done:done`, `done:archived` unverändert.

3. **Verifikation.** BATS-Filter T003072-Test 1 grün; bestehende
   T002382-M1/M2-Tests und T002876-Tests bleiben grün
   (`tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats`).

## Acceptance

- Ungültiges done (beide Kriterien) → WARN + Übergang erlaubt.
- Gültiges done (Resolution ODER Lebenszyklus) → weiterhin Exit 2.
- Keine Änderung am archived-Verhalten.
