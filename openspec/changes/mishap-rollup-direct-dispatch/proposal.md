# Proposal: mishap-rollup-direct-dispatch

## Why

Der Rollup-Zyklus (Batch → Plan → **PR-Merge** → Archiv) hat zwei strukturelle Reibungen,
beide am 2026-08-15 am 10er-Batch auf T006843 beobachtet:

1. **Manueller PR-Schritt:** Niemand öffnet den Rollup-PR automatisch — der gepushte
   Zyklus-Branch blieb liegen, bis ein Mensch den PR anlegte.
2. **Freshness-Gap pro Zyklus:** Der Generator committet die regenerierte
   `website/src/data/openspec-status.json` nicht mit. Der Rollup-PR scheitert deshalb
   in jeder Runde erst am CI-Freshness-Gate und braucht einen manuellen
   Follow-up-Commit.

Beide Reibungen entfallen, wenn der Plan nicht per PR auf `main` gemergt wird, sondern
direkt in die Factory-Staged-Lane geht — das Muster, das der Geschwister-Generator
`auto-chore-plan.sh` [T002390] bereits nutzt: Die Factory implementiert den Plan als
normalen Executor-Lauf, der Post-Merge-Finalizer (dev-flow-execute) archiviert den
Change (inkl. Status-Map-Regeneration) und schließt das Ticket per Merge=Closure.

Das Batching bleibt unverändert (Buffer, 10er-Schwelle, 7-Tage-Alters-Flush). Der
Sofort-Dispatch einzelner Mishaps beim Aufkommen bleibt bewusst abgelehnt: die
Factory-Lane ist seriell (max_inflight=1), ein Mishap ist eine Beobachtung ohne
DoR-Reife, und der Befund entsteht oft durch die Session, die noch läuft.

## What

1. `scripts/factory/mishap-rollup.sh` ersetzt den Block „Container schließen
   (done/obsolete)" durch `ticket.sh stage-plan --id <container> --branch <branch>
   --plan <change>/tasks.md --no-hold`. Der Container wird damit zum Dispatch-Ticket
   (plan_staged) statt geschlossen.
2. `scripts/ticket.sh rollup-container` sucht nur noch **Collect-Mode**-Container
   (`triage`/`backlog`/`planning`; `blocked` nur ohne FACTORY-PLAN-REF), damit neue
   Flushes einen frischen Container anlegen, sobald der alte dispatcht ist.
3. Der Container schließt jetzt erst, wenn der Executor-PR gemergt ist
   (Merge=Closure, `resolution=fixed`); die Archivierung des Rollup-Changes übernimmt
   der dev-flow-execute-Finalizer.

_Ticket: T007056_
