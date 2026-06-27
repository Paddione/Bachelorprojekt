---
title: "Proposal: Mishap-Bundle dev-flow-chore (git-crypt) + ticket-ops (dedupe)"
ticket_id: T001210
plan_ref: openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md
status: planning
date: 2026-06-27
---

# Proposal: Mishap-Bundle dev-flow-chore + ticket-ops (T001210)

> Quelle: `docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md`
> (Bundle-Design-Note, T001210).
> Bundle aus zwei Skill-Edits; keine neuen Endpoints, keine neuen Module,
> keine ausführbaren Code-Änderungen. Verifizierbar per BATS-Suite
> `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats`.

## Why

Zwei process-Mishaps in den agent-skills, beide auf `main` reproduzierbar:

- **Mishap 1.** `.claude/skills/dev-flow-chore/SKILL.md` Step 4 benutzt
  `git add -A`. In einem git-crypt-Worktree tauchen ~21 Pfade unter
  `environments/.secrets/**` als „modified" auf (Clean/Smudge-Filter-Artefakt).
  Ein blanket-`git add -A` würde diese in den Index ziehen. Workaround
  existiert ad hoc (PR #2135 / T001199), ist aber nicht in der Skill selbst
  verankert.
- **Mishap 2.** `.claude/skills/ticket-ops/SKILL.md` hat keinen Title-Dedupe-
  Check am Intake-Pfad. Resultat: 4 Duplikat-Tickets (T001196, T001197, T001201,
  T001202) am 2026-06-27 erzeugt, obwohl das kanonische T001147 `done` und das
  Vorgänger-Mishap-Bundle T001148 `done` ist. Re-Trigger eines upstream-Signals
  ⇒ N Duplikate.

## What

- **Mishap 1.** Step 4: expliziter Pathspec statt `git add -A`; Secret-in-Index-
  Guard (FATAL-Exit) wenn `environments/.secrets/**` im Index. Cross-Refs auf
  T000925 (silent-commit-Failure-Variante), T001199 / PR #2135 (ad hoc-
  Workaround).
- **Mishap 2.** Phase 4 Step 4.4 + Phase 1 Step 1.4: Title-Dedupe-Lookup vor
  INSERT. Reuse existing `external_id`; Comment auf bestehendem Ticket
  notiert Re-Trigger-Quelle; KEIN neuer `tickets.tickets`-Row. Cross-Refs auf
  T001147 (kanonisch), T001148 (Vorgänger-Mishap), T001196–T001202 (Symptom).

## Akzeptanzkriterien

1. `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` ist 5/5 grün nach
   Apply. Auf dem aktuellen Branch (HEAD 2cc010f5, vor Apply) ist die Suite
   0/5 grün (= rot).
2. dev-flow-chore/SKILL.md Step 4 enthält keinen blanken `git add -A` mehr.
3. dev-flow-chore/SKILL.md Step 4 enthält den Secret-in-Index-Guard.
4. ticket-ops/SKILL.md Phase 4 Step 4.4 enthält einen Title-Dedupe-Guard.
5. ticket-ops/SKILL.md Phase 4 Step 4.4 zitiert T001147 als kanonische
   Referenz (Regression-Marker).
6. `task test:changed` PASS, `task freshness:check` PASS, `bash scripts/
   plan-lint.sh` PASS, `bash scripts/openspec.sh validate` PASS.

## Out of scope

- Identifikation der upstream-Re-Trigger-Quelle für Mishap 2 (Factory-Tick?
  gecronter Re-Fail? Event-Replay?). Die Symptom-Fix (Dedupe am Intake) ist
  der höchste Wert dieser Bundle; die Root-Cause-Investigation bleibt ein
  separates Ticket.
