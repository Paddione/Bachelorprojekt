## ADDED Requirements

### Requirement: PREP-Worktree-Pre-Create reuse einen bestehenden Worktree

When the target branch of a scheduled ticket is already checked out in another
worktree, `scripts/vda/factory-prep.sh` SHALL NOT fail with a `worktree_failed`
SKIP. Instead, it SHALL check `git worktree list --porcelain` for the owning
worktree and reuse it as `worktree_path` in the launch JSON — provided that
(a) no live agent session holds the branch (`scripts/agent-lock.sh
check-branch-live <branch>` reports `free`) and (b) the owning worktree is clean
(`git status --porcelain` empty). If either precondition fails, the ticket SHALL
be skipped cleanly (`worktree_failed`), because a dirty or session-held worktree
must not be co-opted by the factory.

The chosen `worktree_path` SHALL be passed through to the pipeline: `dispatcher.js`
SHALL forward it in the pipeline invocation and `scripts/factory/pipeline.mjs`
SHALL use it as the worktree path override when set, instead of recomputing
`.worktrees/<slug>-reuse`.

#### Scenario: Branch ist im Mishap-Rollup-Worktree ausgecheckt

- **GIVEN** das Ziel-Branch `chore/mishap-incident-rollup` ist in
  `.worktrees/mishap-incident-rollup` ausgecheckt, die Session haelt keinen
  live Lock und der Worktree ist sauber
- **WHEN** `factory-prep` den Pre-Create fuer dieses Ticket ausfuehrt
- **THEN** scheitert der Pre-Create nicht, `.launch` enthaelt das Ticket, und
  `.worktree_path` zeigt auf `.worktrees/mishap-incident-rollup`

#### Scenario: Branch ist von einer Live-Session gehalten

- **GIVEN** das Ziel-Branch ist in einem Worktree ausgecheckt und eine live
  Session haelt ihn (agent-lock `check-branch-live` = live)
- **WHEN** `factory-prep` den Pre-Create ausfuehrt
- **THEN** wird das Ticket als `worktree_failed` geskippt und der Slot wie bisher
  freigegeben — der fremde Worktree wird NICHT wiederverwendet

#### Scenario: Fremder Worktree ist dirty

- **GIVEN** das Ziel-Branch ist in einem Worktree ausgecheckt, kein live Lock,
  aber der Worktree hat uncommittete Aenderungen
- **WHEN** `factory-prep` den Pre-Create ausfuehrt
- **THEN** wird das Ticket als `worktree_failed` geskippt — ein schmutziger
  Fremdstand wird NICHT in die Implementierung uebernommen

### Requirement: PREP-SKIP eskaliert nach wiederholten Fehlversuchen

`scripts/vda/factory-prep.sh` SHALL count consecutive `worktree_failed` SKIPs per
ticket in `tickets.factory_control` under key `prep_skip:<external_id>` (same
storage mechanism as the watchdog's `factory_attempt:<external_id>`, T002389).
When the counter reaches 3, the ticket SHALL be escalated visibly via
`ticket.sh unfactory` — `status=blocked`, `attention_mode=needs_human` and an
explanatory comment — instead of being silently re-scheduled every tick. A
successful pre-create SHALL reset the counter to 0.

#### Scenario: Drei Fehlversuche eskalieren das Ticket

- **GIVEN** ein Ticket wurde dreimal hintereinander mit `worktree_failed`
  geskippt und sein Zaehler `prep_skip:<id>` steht auf 3
- **WHEN** der vierte Pre-Create-Versuch wieder fehlschlaegt
- **THEN** wird das Ticket via `unfactory` auf `blocked` + `needs_human`
  gestellt und der Endlos-Loop stoppt

#### Scenario: Erfolgreicher Pre-Create setzt den Zaehler zurueck

- **GIVEN** der Zaehler `prep_skip:<id>` steht auf 2
- **WHEN** der naechste Pre-Create fuer dieses Ticket gelingt
- **THEN** wird der Zaehler auf 0 zurueckgesetzt und das Ticket startet normal
