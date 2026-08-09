---
title: "factory-worktree-reaper-lock-guard — Design"
ticket_id: T002896
status: draft
domains: [factory, devflow]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: Worktree-Reaper respektiert live Agent-Locks

## Root-Cause (Symptom vs. Hypothese, T002448-M5)

**Symptom (belegt, aus dem Ticket-Text):**
- 3 von 6 `ticket-ops`-Worktrees + Branches verschwanden waehrend eines parallelen
  Factory-Autopilot-Laufs, obwohl jeder einen live ticket-scoped Agent-Lock derselben Session
  trug.
- Alle vier betroffenen Worktrees wurden per `worktree-create.sh --unattended` inkl.
  Anker-Commit angelegt.
- Beim T002663-Agent sprang HEAD vom eigenen Anker-Commit `073b1dff4` auf main-Tip
  `181d122a1`, `git ls-files` lieferte 0 Dateien — Signatur einer frisch neu angelegten
  Worktree an genau diesem Pfad.
- Ausgeschlossen (Loeschmuster passt nicht): `watchdog.sh` (nur `feature/sf-*`/`chore/sf-*`),
  `pr-refresh.sh` (nur `.worktrees/pr-refresh-<num>`), `auto-chore-plan.sh` (nur
  `.worktrees/acp-<slug>` per EXIT-Trap), `branch-reaper.sh` (braucht `--ticket`).

**Hypothese, verifiziert per Code-Lesung** (nicht geraten — siehe `proposal.md` fuer die
zitierten Zeilen):
`scripts/worktree-create.sh:257` fuehrt bei JEDEM Aufruf unbedingt
`git worktree remove --force "$WT_PATH"` aus, kommentiert als reine Idempotency-Massnahme
gegen einen "stale Worktree von einem abgebrochenen vorherigen Lauf" — ohne jede Pruefung, ob
der bestehende Worktree tatsaechlich verwaist ist. Der Anker-Commit aus T002412 schuetzt nur
gegen Ancestry-basierte Cleanup-Logik ("vollstaendig in main enthalten?"); ein
Pfad-Kollisions-Force-Remove prueft Ancestry gar nicht erst. Trifft ein zweiter Caller (z. B.
die Factory-Pipeline fuer dasselbe Ticket bei einer race-bedingt fehlgeschlagenen
FACTORY-PLAN-REF-REUSE-Erkennung) denselben `.worktrees/<slug>`-Pfad, wird der bestehende live
Worktree kommentarlos ersetzt.

Zweite, unabhaengige Angriffsflaeche: `scripts/factory/cleanup.sh` entfernt
`--worktree`/`--branch` bedingungslos, ohne Lock-Pruefung — anders als `agent-lock.sh reap`,
das seinen Branch-Loeschschritt bereits gegen `_branch_is_live_claimed()` absichert.

## Entscheidungen

1. **Eine gemeinsame Primitive statt zwei Implementierungen.** `agent-lock.sh` bekommt einen
   neuen oeffentlichen Subcommand `check-branch-live <branch>`, der die bestehende interne
   `_branch_is_live_claimed()` verwendet (dieselbe Logik, die `agent-lock.sh reap` schon fuer
   seinen eigenen Branch-Loeschschritt nutzt). Kein Code-Duplikat zwischen
   `worktree-create.sh` und `cleanup.sh`.
2. **`worktree-create.sh` bricht ab statt zu ersetzen.** Trifft die Idempotency-Remove-Zeile
   auf einen live Fremd-Claim, ist das Verhalten symmetrisch zum bestehenden Exit-Code 3
   ("branch in use", T002327): abbrechen, klarer Diagnosetext, nichts geloescht. Ein
   Positiv-Anker bleibt Pflicht — ohne Claim wird weiterhin idempotent geraeumt (sonst haeuften
   sich echte verwaiste Worktrees an).
3. **`cleanup.sh` skippt statt zu blockieren.** `cleanup.sh` ist laut eigenem Kopfkommentar
   "best-effort... ALWAYS exits 0". Der Lock-Check aendert daran nichts — er ueberspringt nur
   die konkrete Removal-Aktion und loggt sichtbar, statt den Pipeline-Abschluss zu blockieren.
4. **Kein Eingriff in `mishap-rollup.sh`/`auto-chore-plan.sh`/`babysit-prs.sh`.** Deren
   `rm -rf`/`worktree remove`-Aufrufe sind auf slug-eindeutige, selbst verwaltete Pfade
   beschraenkt (`.worktrees/mishap-incident-rollup`, `.worktrees/acp-<slug>`,
   `.worktrees/pr-refresh-<num>`) und wurden im Ticket bereits als Loeschmuster ausgeschlossen.
   Sie laufen letztlich ohnehin durch `worktree-create.sh`s eigene Anlage-Pruefung (fuer
   `mishap-rollup.sh`/`auto-chore-plan.sh`), die mit Entscheidung 2 den systemischen Schutz
   erhaelt.
5. **Scope-Grenze:** Diese Aenderung macht das Reap-Verhalten sichtbar korrekt (skip + Log),
   behebt aber nicht die vermutete Ursache der Pfad-Kollision selbst (REUSE-Erkennung in
   `pipeline.mjs`). Das ist bewusst getrennt — der Lock-Guard ist die Verteidigungslinie, die
   JEDE Ursache abfaengt, nicht nur die eine hier identifizierte. Eine Ticket-Folge fuer die
   REUSE-Race waere ein separates Ticket, falls sich die Pfad-Kollision reproduzieren laesst.
