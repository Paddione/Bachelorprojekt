# Design: terminal-guard-invalid-done-repair (T003072)

## Symptom & Beleg

- T003025: angelegt 2026-08-09 15:41:36 als `done`, `resolution=null`,
  `created_at == updated_at`. `gh pr list --search T003025` → nur #4004
  (OPEN, rot); `git log origin/main --grep=T003025` leer. Kein Merge-Nachweis.
- `mcp__ticket-mcp__transition_status({id: T003025, status: in_progress})` →
  Exit 2 „Cannot transition from 'done' to 'in_progress' — terminal tickets can
  only transition to 'archived'" (Terminal-Guard T002382).
- Der Guard wurde bewusst NICHT per SQL umgangen — der Widerspruch ist als
  Kommentar an T003025 dokumentiert (Ticket-Beschreibung T003072).

## Code-Pfade

1. **Shell:** `scripts/vda/ticket/update-status.sh` — Guard-SELECT
   `SELECT status FROM tickets.tickets WHERE external_id = :'tid'` (T002906-
   Bindung), `case done:*)` → Exit 2.
2. **TS:** `website/src/lib/tickets/transition.ts` — FOR-UPDATE-SELECT
   (`id, external_id, type, status, reporter_email, brand`), Guard vor dem
   UPDATE mit identischer Fehlermeldung.

## Lösung (Operator-Entscheid 2026-08-14: Guard-Ausnahme)

### Erkennung „ungültiges done"

Ein `done` ist genau dann maschinell ungültig, wenn:
`resolution IS NULL AND created_at = updated_at` (kein Lebenszyklus, kein
Abschluss-Metadatum). Beide Kriterien stehen in der Ticket-Zeile — kein
Heuristik-Spielraum.

### Shell-Seite

Guard-SELECT erweitern, delimiter-überlebend für das bestehende
`tr -d '[:space:]'`-Muster:

```sql
SELECT status || '|' || COALESCE(resolution,'') || '|' || (created_at = updated_at)::text
  FROM tickets.tickets WHERE external_id = :'tid' LIMIT 1;
```

```bash
IFS='|' read -r _cur_status _cur_res _no_lifecycle <<<"$(echo "$_sql" | _exec_sql "$pod" -v tid="$id" 2>/dev/null | tr -d '[:space:]')"
```

`case`-Logik:

```bash
done:*)
  if [ "$_cur_res" = "" ] && [ "$_no_lifecycle" = "t" ]; then
    echo "WARN: invalid done state (no resolution, no lifecycle) — allowing repair transition to '$status'." >&2
  else
    echo "ERROR: Cannot transition from 'done' …" >&2; exit 2
  fi ;;
```

`archived:*` bleibt unverändert hart. `done:done`/`done:archived` idempotent
wie bisher.

### TS-Seite

FOR-UPDATE-SELECT um `resolution, created_at, updated_at` erweitern:

```ts
const invalidDone =
  b4 === 'done' &&
  before.resolution == null &&
  before.created_at instanceof Date &&
  before.created_at.getTime() === before.updated_at.getTime();
if (b4 === 'done' && p.status !== 'done' && p.status !== 'archived' && !invalidDone) {
  throw new Error(`Cannot transition from 'done' to '${p.status}' — …`);
}
```

Der UPDATE (`resolution = CASE WHEN $1 IN ('done','archived') … ELSE NULL END`)
bleibt unverändert — bei der Reparatur bleibt `resolution` NULL (korrekt).

## Risiken & Grenzen

- **Echte Abschlüsse bleiben geschützt:** Jedes legitime done trägt eine
  Resolution ODER hat einen Lebenszyklus (`created_at < updated_at` — jeder
  Statuswechsel berührt `updated_at`). Die Ausnahme greift nur bei beidem
  gleichzeitig falsch.
- **Race:** Der Guard-SELECT läuft wie bisher best-effort ohne Transaktion
  (vorbestehende Limitation, im Code kommentiert). Kein neues Risiko.
- **reconcile-ticket-status.sh:** bleibt unverändert (Watchdog-Pfad,
  bewusste SQL-Direkt-Umgehung).
- **archived:** keine Ausnahme — der Operator hat die Reparatur nur für
  `done` freigegeben.
