# Proposal: factory-worktree-reaper-lock-guard

## Why

Am 2026-08-09 verloren 3 von 6 `ticket-ops`-Subagents mitten im Lauf ihren Worktree UND ihren
Branch (T002896), obwohl jeder einen **live** ticket-scoped Agent-Lock derselben Session hielt.
Der Agent-Lock ist damit Buchhaltung ohne Wirkung: `agent-lock.sh check` meldete `live`/`mine`,
waehrend das Arbeitsverzeichnis darunter geloescht wurde. Kosten des einen Laufs: rund 440k
Subagent-Token, drei verlorene Plan-Entwuerfe, ein verlorener RED-Test und ein verlorenes
OpenSpec-Scaffold.

## What

**Root-Cause-Verifikation (Symptom vs. Hypothese, T002448-M5):**

Symptom (belegt): Alle vier betroffenen Worktrees wurden ueber `scripts/worktree-create.sh
--unattended` angelegt (inkl. Anker-Commit). Der Anker-Schutz griff nicht — HEAD sprang beim
T002663-Agent vom eigenen Anker-Commit `073b1dff4` auf den main-Tip `181d122a1`, `git ls-files`
lieferte 0 Dateien. Das ist die Signatur einer **frisch neu angelegten** Worktree an genau
diesem Pfad, nicht einer Ancestry-basierten Loeschung.

Hypothese, verifiziert per Code-Lesung (nicht geraten): `scripts/worktree-create.sh` Zeile 257
fuehrt bei **jedem** Aufruf unbedingt aus:

```bash
git worktree remove --force "$WT_PATH" 2>/dev/null || true
```

Kommentiert als "Idempotency: drop a stale worktree at this path left by a prior aborted run" —
aber ohne jede Pruefung, ob der bestehende Worktree an `$WT_PATH` tatsaechlich verwaist ist. Der
Anker-Commit aus T002412 schuetzt nur gegen **Ancestry-basierte** Aufraeumlogik ("ist vollstaendig
in main enthalten?") — nicht gegen einen **Pfad-Kollisions**-Force-Remove, der die Ancestry gar
nicht erst prueft. Das erklaert woertlich, warum der Ticket-Text notiert: "Der Anker-Schutz hat
nicht gegriffen."

Dieser Pfad wird von JEDEM Worktree-Erstellungs-Caller durchlaufen — `dev-flow-plan` selbst,
`scripts/factory/pipeline.mjs` (`setupWorktree()`, ueber `dispatcher-bridge.sh`),
`scripts/factory/mishap-rollup.sh`, `scripts/factory/auto-chore-plan.sh`. Berechnet ein zweiter
Caller (z. B. die Factory-Pipeline fuer dasselbe Ticket, wenn die REUSE-Erkennung ueber
FACTORY-PLAN-REF race-bedingt nicht greift und `WORK_WT` dadurch auf denselben `.worktrees/<slug>`-
Pfad wie das human-erstellte Worktree faellt — siehe `pipeline.mjs`: `WORK_WT = REUSE ? ... :
WT` mit `WT = ${REPO}/.worktrees/${slug}`) denselben Zielpfad, loescht `worktree-create.sh`
Zeile 257 den bestehenden — live — Worktree kommentarlos und legt daran einen neuen an. Das
deckt sich mit der Beobachtung in T002896 zu T002876 ("ein Worktree entstand, den niemand aus
dieser Session anlegte").

Als zweite, unabhaengige Angriffsflaeche: `scripts/factory/cleanup.sh` entfernt am Pipeline-Ende
bedingungslos `--worktree <pfad>` (`git worktree remove --force`) und `--branch <name>`
(`git branch -D`) — beide Parameter kommen vom Aufrufer, ohne jede Lock-Pruefung. Anders als
`scripts/agent-lock.sh reap`, das seinen eigenen Branch-Loeschschritt bereits gegen
`_branch_is_live_claimed()` absichert (T001448 M3), hat `cleanup.sh` keine aequivalente Bremse.

**Fix-Ansatz:** Eine gemeinsame, wiederverwendbare Lock-Pruefung (`agent-lock.sh
check-branch-live <branch>` als oeffentlicher Wrapper um die bestehende interne
`_branch_is_live_claimed()`) wird an **beiden** Stellen als Vorbedingung eingezogen:

1. `scripts/worktree-create.sh` Zeile 257 (Idempotency-Remove) — bricht mit einem klaren
   Diagnosetext und Exit-Code ab (analog zum bestehenden Exit-Code 3 fuer "branch in use"),
   statt den bestehenden Worktree stillschweigend zu ersetzen, wenn dessen ausgecheckter Branch
   einen live Agent-Lock traegt, der NICHT der eigenen Session gehoert.
2. `scripts/factory/cleanup.sh` — ueberspringt `--worktree`/`--branch`-Removal sichtbar geloggt
   (statt sie zu entfernen), wenn der Branch einen live Fremd-Lock traegt.

Guard-Test (T002896 Untersuchungsschritt 4): Worktree mit fremdem Live-Lock anlegen, den
jeweiligen Reap-Pfad laufen lassen, per Kommando-Output belegen, dass der Worktree noch
existiert — im selben Test ein Positiv-Anker: ein Worktree OHNE Lock wird weiterhin entfernt.

_Ticket: T002896_
