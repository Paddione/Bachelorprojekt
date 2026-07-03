# Proposal: t001582-mishap-bundle

## Why

Ein `mishap-tracker`-Aggregat-Ticket (T001582) bündelt drei unabhängige, aber thematisch
verwandte Kleinbugs aus dem Mishap-Tracker rund um `scripts/agent-lock.sh` und die
`scripts/ticket.sh`/`scripts/vda/ticket/*.sh`-CLI-Familie:

1. `scripts/agent-lock.sh` `_reapable()` misst das Reap-Alter eines Claims gegen `created_at`
   statt gegen `heartbeat_at` — ein Claim, der gerade erst refresht wurde (frischer Heartbeat),
   aber ursprünglich lange zuvor erstellt wurde, wird fälschlich als tot gereapt, sobald sein
   `owner_pid` (transient, z. B. durch einen Tool-Call-Wechsel) nicht mehr lebt.
2. `scripts/vda/ticket/create.sh` validiert `--severity` nicht clientseitig, bevor es die
   Datenbank kontaktiert — ein ungültiger Wert (z. B. Tippfehler) schlägt erst am DB-Insert fehl
   und verbrennt dabei eine Ticket-Sequence-ID.
3. `scripts/vda/ticket/get.sh` ruft `_ticket_offline_refuse_read` auf, eine Funktion, die nur in
   `scripts/ticket.sh` definiert war, nicht in der gemeinsam genutzten
   `scripts/vda/ticket/_ticket-core.sh`, die `get.sh` tatsächlich sourced — jeder `get`-Aufruf
   erzeugt dadurch einen `command not found`-Stderr-Fehler.

Ohne Fix bleiben: Live-refreshte Session-Claims verlieren stillschweigend ihren Lock
(Wettlauf-Risiko für parallele Agenten), fehlerhafte `--severity`-Eingaben verschwenden
Sequence-IDs, und `vda.sh ticket get` erzeugt bei jedem Aufruf Rauschen auf stderr.

## What

Ein Plan, drei unabhängige Fix-Tasks im selben Branch `fix/t001582-mishap-scripts`:

- **M1 (agent-lock.sh):** `_reapable()` erhält eine gemeinsame Altersbasis
  `age_base="${hb:-${ct:-0}}"` (bevorzugt `heartbeat_at`, fällt nur auf `created_at` zurück, wenn
  kein Heartbeat vorliegt) und verwendet sie in den `pid-dead`- und `sid-dead`-Reap-Zweigen statt
  `created_at` allein. Der `heartbeat-ttl`-Zweig bleibt unverändert der ultimative Fallback für
  wirklich tote Sessions.
- **M2 (create.sh):** Ein clientseitiger Guard validiert `--severity` gegen
  `critical|major|minor|trivial` (leer bleibt erlaubt), bevor `_pgpod`/`_exec_sql` aufgerufen
  werden. `scripts/ticket.sh`s Usage-Text dokumentiert die vier erlaubten Werte.
- **M3 (_ticket-core.sh):** `_ticket_offline_skip` und `_ticket_offline_refuse_read` wandern von
  `scripts/ticket.sh` in die gemeinsam genutzte `scripts/vda/ticket/_ticket-core.sh`, sodass auch
  `scripts/vda/ticket/get.sh` (das nur den Core sourced, nicht `ticket.sh`) sie erreicht.

## Impact

- `scripts/agent-lock.sh`, `scripts/ticket.sh`, `scripts/vda/ticket/create.sh`,
  `scripts/vda/ticket/_ticket-core.sh`
- Test-SSOT: `tests/spec/t001582-mishap-bundle.bats` (7 Tests, ein Test pro Fix + Regressions-/
  Empty-Severity-Guards)
