# Ticket-Ops-Claim-Timing

## Purpose (Deutsch)

ticket-ops Step 3.6 dokumentiert den Dispatch-Claim in einer Reihenfolge, die mit
dev-flow-plan kollidiert: der branch-scoped Claim wird VOR der Worktree-Erstellung gehalten,
während dev-flow-plan Phase A im **Haupt-Checkout** läuft (propose/design auf main). Mit
aktivem Worktree-Claim blockiert der worktree-write-guard alle Write-Tools im
Haupt-Checkout (korrektes Guard-Verhalten, T002357-M1) — die Phase-A-Arbeit braucht den
Release. Beobachtet 2026-08-14 beim T004295-Lauf; Auflösung war manuelles Releasen,
Phase A im Haupt-Checkout, Re-Claim in Phase B.

## Problem / Auslöser

`.claude/skills/references/ticket-ops-procedures.md` Step 3.6 verlangt
`agent-lock.sh claim branch <branch>` direkt vor der Worktree-Erstellung. Für Tickets, die
noch durch dev-flow-plan müssen (unplanned, `ai_ready`), führt das zum Claim, BEVOR die
Proposal-Phase (Phase A) im Haupt-Checkout gelaufen ist — der Claim gehört erst in die
Planungs-/Dispatch-Phase, nachdem Phase A abgeschlossen ist.

## Fix-Richtung

- **`ticket-ops-procedures.md` Step 3.6** um den Timing-Hinweis ergänzen:
  - Der branch-scoped Claim wird erst NACH der dev-flow-plan-Proposal-Phase (Phase A im
    Haupt-Checkout) gehalten. Für unplanned Tickets heißt das: Phase A zuerst (kein Claim),
    dann Claim + Worktree (Phase B).
  - Konkrete Sequenz nennen: Proposal-Phase (Haupt-Checkout, kein Branch-Lock) → Claim
    branch + Worktree anlegen → Plan/Execute-Dispatch im Worktree.
- **`ticket-ops/SKILL.md`**: in der Invarianten-/Pre-Check-Sektion einen Verweis auf die
  Claim-Timing-Regel ergänzen (eine Zeile, Verweis auf procedures Step 3.6).
- Keine Änderung an `agent-lock.sh` oder dem worktree-write-guard — das Guard-Verhalten
  ist korrekt (T002357-M1); nur die Prozedur-Reihenfolge wird klargestellt.

## Out of Scope

- Keine Änderung an dev-flow-plan selbst.
- Keine Automatisierung des Release/Re-Claim-Zyklus.
