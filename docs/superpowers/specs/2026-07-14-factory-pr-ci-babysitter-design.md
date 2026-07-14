---
ticket_id: T001805
plan_ref: openspec/changes/factory-pr-ci-babysitter/tasks.md
status: active
date: 2026-07-14
---

# factory-pr-ci-babysitter — Design Spec

## ARCH

Die Software Factory besitzt einen CI-Fix-Loop ausschließlich innerhalb der Deploy-Phase des
eigenen Pipeline-Runs (`scripts/factory/pipeline.js` Deploy-Phase, two-gated Self-Healing ≤2
Retries). Offene PRs außerhalb eines laufenden Runs — abgebrochene Factory-PRs, dev-flow-PRs,
manuelle PRs — haben keinen Mechanismus, der rote CI erkennt oder behebt. Der Dispatcher kennt
nur die Ticket-Queue als Work-Source; Watchdog und Wakeup-Reconcile fragen den PR-CI-Status
nie ab.

**Neu:** `scripts/factory/babysit-prs.sh` — ein leichtgewichtiger, ticket-loser Babysitter-Step
im Wakeup-Tick. Er scannt offene PRs auf rote CI und wendet den bestehenden two-gated
Fix-Mechanismus an, wiederverwendet über den deterministischen Loop-Kern
`scripts/factory/build-loop.sh` (`build_loop_decide`: Gate 1 Klasse ∈ ci|test|lint|freshness,
Gate 2 `paths_are_escalate_class` Exit 1, No-Progress-Hash, Iterationslimit).

Einhängepunkt: `scripts/factory/wakeup.sh`, in der bestehenden pre-dispatcher
`for _x_brand`-Kette (nach `reconcile-ticket-status.sh`), best-effort (`|| true`, sed-Präfix) —
der Babysitter läuft aber brand-agnostisch nur einmal pro Tick (PRs sind repo-weit, nicht
brand-gebunden); der Aufruf steht daher außerhalb der Brand-Schleife.

Ablauf pro Tick:
1. Guards: `guard_killswitch_on` (global) → Skip. Dry-Run (`FACTORY_DRY_RUN`) → nur Scan+Log.
2. Scan: `gh pr list --state open --json number,headRefName,isDraft,mergeStateStatus,statusCheckRollup,author,labels`.
3. Filter (ein Kandidat, Concurrency 1 — erster Treffer nach PR-Nummer aufsteigend):
   - CI-Rollup enthält FAILURE; nicht Draft
   - kein Label `ci-babysitter-gave-up`
   - Autor nicht Renovate-Bot, außer `FACTORY_BABYSIT_RENOVATE=true`
   - `mergeStateStatus != CONFLICTING` (CONFLICTING → einmalig Notify + Label `ci-babysitter-conflict`, kein Fix)
   - Head-Branch hat keinen aktiven `agent-lock`-Claim UND kein via `[TNNNNNN]`-Titel-Tag
     auflösbares Ticket mit Status `in_progress` (Dedup gegen laufende Pipeline/Session)
4. Versuchszählung: PR-Kommentare mit Marker `<!-- ci-babysitter attempt=N -->` zählen;
   N ≥ 2 → Label `ci-babysitter-gave-up` + Notify, fertig.
5. Fix: CI-Log via `gh run view --log-failed` holen, `classify_failure` bestimmen,
   `build_loop_decide` entscheidet. `continue` → Fix ausführen:
   - Klasse `freshness`: deterministisch im Script (Temp-Worktree des PR-Branches,
     `task freshness:regenerate`, commit `chore: refresh (ci-babysitter)`, push).
   - Klasse `ci|test|lint`: Agent-Dispatch `${CLAUDE_BIN} -p` mit kleinstmöglichem Fix-Auftrag
     im Temp-Worktree (analog wakeup-Dispatcher-Muster, allowedTools eng).
   - `abort:*` → Notify (PushNotification-Muster via aufrufendem Workflow bzw.
     `qa-notify.sh`-Payload-Format auf stdout) + Marker-Kommentar.
6. Nach jedem Versuch: Marker-Kommentar `<!-- ci-babysitter attempt=N -->` mit Klasse,
   Entscheidung und Log-Tail auf den PR.

## GOALS

- G1: Rote CI auf offenen PRs wird spätestens einen Wakeup-Tick später erkannt und (wenn
  gate-konform) automatisch behoben — ohne Ticket, Slot oder Factory-Floor-Status.
- G2: Vollständige Wiederverwendung der bestehenden Klassifikations-/Gate-Bausteine
  (`classify-failure.sh`, `classify-paths.sh`, `build-loop.sh`) — keine Logik-Duplikate.
- G3: Deterministisch testbar (BATS, gh-Stub) inkl. aller Filter- und Abbruchpfade.
- G4: Budget-schonend: max. 1 PR pro Tick, max. 2 Versuche pro PR (lebenslang, via
  PR-Kommentar-Marker), Agent-Dispatch nur wenn deterministischer Fix nicht reicht.

## RISKS

- R1: Race mit einer live laufenden Pipeline auf demselben PR → Dedup via agent-lock-Claim +
  Ticket-Status-Check (D4); Rest-Race akzeptiert (push schlägt fehl, best-effort).
- R2: Agent-Fix verschlimmbessert → Gate 2 (Escalate-Pfade) + Diff im Marker-Kommentar +
  hartes 2-Versuche-Limit; kein Force-Push, kein Merge durch den Babysitter.
- R3: `statusCheckRollup`-Semantik (pending vs. failure) → nur eindeutige FAILURE-Conclusions
  zählen; pending/laufende Checks werden übersprungen (nächster Tick).
- R4: Kommentar-Marker-Parsing fragil → striktes maschinelles Format in HTML-Kommentar,
  BATS-getestet.

## DECISIONS

- D1 (User): Leichtgewichtiger Loop ohne Ticket-Overhead — kein Auto-Ticket, keine Slots,
  Retry-State lebt am PR (Kommentar-Marker), Eskalation = Notify + Label statt needs_human.
- D2 (User): Max. 2 Fix-Versuche pro PR, analog pipeline.js.
- D3 (User): Concurrency 1 — genau ein PR pro Wakeup-Tick.
- D4 (User): Dedup gegen aktive Runs via agent-lock-Claims und in_progress-Ticket-Check.
- D5: Wiederverwendung von `build_loop_decide` statt Neuimplementierung der Gates.
- D6: `gh` (nicht gh-axi) — konsistent mit allen Factory-Scripts.
- D7: CONFLICTING-PRs werden nie automatisch rebased/gefixt — CI ist dort unterdrückt
  (Gotcha-Liste); nur einmalige Meldung.
- D8: Babysitter läuft repo-weit einmal pro Tick (nicht pro Brand) — PRs sind brand-agnostisch.
