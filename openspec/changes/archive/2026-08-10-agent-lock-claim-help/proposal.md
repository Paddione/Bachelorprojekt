# Proposal: agent-lock-claim-help

_Ticket: T003107_

## Why

`scripts/agent-lock.sh claim` nimmt sein erstes Argument bedingungslos als Scope-Namen
entgegen (`SCOPE="$1"; ID="${2:-}"` in `cmd_claim`). `--help` wird damit zum Scope: der
Aufruf endet mit Exit 0, gibt nichts aus und legt `$AGENT_LOCK_DIR/--help__.json` an — ein
Lock mit leerer `id`, weshalb der Dateiname auf dem Trennzeichen endet.

Am eigenen Rechner nachgestellt (isoliert, gegen ein Temp-Verzeichnis, damit die laufende
Factory unberuehrt bleibt):

```bash
# Stand: origin/main, 2026-08-10
export AGENT_LOCK_DIR="$(mktemp -d)"
bash scripts/agent-lock.sh claim --help; echo "EXIT=$?"; ls "$AGENT_LOCK_DIR"
# EXIT=0
# --help__.json
```

Der Muell-Lock ist nicht bloss kosmetisch: er gilt als `live`, `reap` entfernt ihn nie, und
er verrauscht damit genau die `agent-lock.sh list`-Uebersicht, auf der `ticket-ops` und die
`dev-flow-*`-Skills ihren Pre-Check aufbauen. Der beobachtete Fall trug einen `branch`-Wert
aus einem laengst gemergten Vorgang (T002807) und ueberdauerte diesen also unbegrenzt;
bereinigt wurde er nur per `rm` von Hand.

Die Abgrenzung ist gemessen, nicht angenommen: `check`, `release` und `reap` legen bei
`--help` keinen Lock an. Betroffen ist ausschliesslich `claim`.

## What

1. `cmd_claim` faengt `-h`/`--help` **vor** der Scope-Zuweisung ab und gibt die Optionsliste
   aus (Exit 0). Das Muster existiert bereits in `scripts/worktree-create.sh` (T002783:
   `--help` vor allen Guards) und wird uebernommen statt neu erfunden.
2. `cmd_claim` weist einen leeren Scope und einen Scope, der mit `-` beginnt, als
   Eingabefehler mit Exit != 0 zurueck. Damit kann kein Lock ohne gueltigen Scope mehr
   entstehen — auch nicht bei einem kuenftigen, hier nicht vorhergesehenen Flag.

Nicht Teil dieses Vorgangs: die gleichartige Luecke in `scripts/ticket.sh` (T002843). Sie
betrifft einen anderen Argument-Parser; ein gemeinsamer Fix waere ein eigener Vorgang mit
eigener Abnahme.

## Impact

- `scripts/agent-lock.sh` — `cmd_claim` plus eine Hilfeausgabe. Ist 675 Zeilen,
  nicht baselined, statisches `.sh`-Limit 800 → Budget 125.
- `tests/spec/agent-skills/agent-lock-claim-help-flag.bats` — neu, RED bis zum Fix.
- Kein Verhalten fuer gueltige Aufrufformen aendert sich; bestehende Locks bleiben unberuehrt.
