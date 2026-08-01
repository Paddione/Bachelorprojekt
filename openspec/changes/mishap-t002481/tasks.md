---
title: "mishap-t002481 — Implementation Plan"
ticket_id: T002481
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002481 — Implementation Plan

_Ticket: T002481_

Mishap-Bundle: skills/references, scripts/ticket.sh, agents/gemma-4-12b, scripts/agent-lock.sh, repo/gitignore, repo/commit-scopes, ci, skills, scripts, infra (10 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

### Mishap 1: plan-lint.sh residual_budget existiert nicht, wird aber als Befehl dokumentiert
**Typ:** drift | **Komponente:** skills/references

Der verification-block — zitiert in `dev-flow-chore` Schritt 3 als „vor dem Commit den Restbudget-Check aus dem verification-block laufen lassen (`plan-lint.sh residual_budget`-Schleife)" — beschreibt ein Subkommando, das es nicht gibt.

Tatsaechliche Ausgabe von `bash scripts/plan-lint.sh residual_budget scripts/worktree-create.sh`:

    PLAN-LINT: FAIL — plan not found: residual_budget

Das erste Argument wird als Plan-Pfad interpretiert; ein Subkommando-Dispatch existiert nicht. Der Fehltext („plan not found") legt zudem nahe, man haette einen falschen Pfad angegeben, statt auf das fehlende Subkommando hinzuweisen.

WIRKUNG: Der S1-Restbudget-Check ist als dokumentierter Schritt nicht ausfuehrbar. Fuer T002470 musste das Limit (500) und die Baseline-Ausnahmenliste stattdessen von Hand aus `docs/code-quality/baseline.json` gelesen werden. In `dev-flow-chore` ist dieser Check der einzige S1-Schutz, weil Chores keinen Planungsschritt mit Zeilenbudget haben — dort faellt er damit ersatzlos aus.

FIX-RICHTUNG: Entweder das Subkommando in `scripts/plan-lint.sh` nachruesten, oder die Referenz auf den tatsaechlich vorhandenen Weg umschreiben. Beides ist vertretbar; nicht vertretbar ist der jetzige Zustand, in dem eine Pflichtpruefung auf einen nicht existierenden Befehl zeigt.

---

### Mishap 2: ticket.sh hat keinen link/comment-Fallback für ticket-mcp
**Typ:** degraded | **Komponente:** scripts/ticket.sh

`scripts/ticket.sh` kennt weder `link` noch `comment` — beide Aufrufe enden mit „Unknown command". Verifiziert im Lauf zu T002470:

    ./scripts/ticket.sh link --from T002470 --to T002409 --type related   -> Unknown command: link
    ./scripts/ticket.sh comment --id T002409 --text "..."                 -> Unknown command: comment

Beide Operationen sind ausschliesslich ueber `ticket-mcp` verfuegbar (`link_tickets`, `add_comment`).

WIRKUNG: Die dev-flow-Skills fuehren `scripts/ticket.sh` durchgaengig als Fallback fuer nicht erreichbares `ticket-mcp` (so etwa in `dev-flow-plan` Schritt −3 und in `ticket-stage-procedure`). Fuer Verlinkung und Kommentierung existiert dieser Fallback nicht. Ist `ticket-mcp` nicht erreichbar — was laut T002469 Mishap 2 vorkommt (mcp-postgres auf :13001 nicht erreichbar) —, koennen Ticket-Bezuege ueberhaupt nicht gesetzt werden. Das trifft besonders Mishap-Bundles und Wiederholungsfehler, deren Wert gerade in der Verknuepfung zum Vorgaenger liegt.

Im konkreten Fall umgangen ueber `ticket-mcp` (`link_tickets` T002470 --relates_to--> T002409, plus Kommentar an T002409).

FIX-RICHTUNG: `link` und `comment` in `scripts/ticket.sh` nachruesten (die DB-Zugriffswege fuer beide existieren dort bereits fuer andere Kommandos), oder die Fallback-Zusage in den Skill-Referenzen auf die tatsaechlich abgedeckten Operationen einschraenken.

---

### Mishap 3: gemma-4-12b task returned empty results (no output summary)
**Typ:** suspicious | **Komponente:** agents/gemma-4-12b

Gemma-4-12b subagent returned empty task results on two dispatches (T002454 implementation, T002461 p1-daemon-core). Files WERE created in the second case (server.ts, token.ts existed after the task), proving the agent ran but didn't produce an output summary. This makes it hard for the orchestrator to verify results. [UNVERIFIED — agent ran but no structured output to confirm]

---

### Mishap 4: agent-lock.sh created stale locks with tool='unknown' in opencode
**Typ:** degraded | **Komponente:** scripts/agent-lock.sh

During ticket-ops, `bash scripts/agent-lock.sh claim ticket T002400 --branch ... --label ticket-ops` created locks with `tool='unknown'` and `sid=Zahl` (numeric PID instead of UUID). These locks are stale (owner process died). T002400 and T002408 had stale locks after the session. [VERIFIED: agent-lock list showed tools='unknown' and owner_pid not alive]

---

### Mishap 5: .gitignore blanket .lavish/ blocked K2 daemon code from being tracked
**Typ:** drift | **Komponente:** repo/gitignore

The `.gitignore` had `.lavish/` on line 32, ignoring the entire directory. The K2 implementation plan specifies files under `.lavish/kit/daemon/` — these were invisible to git. Fix: changed to `.lavish/*.html` and `.lavish/*.brainstorm*` patterns to ignore only the prototype HTMLs while tracking the daemon code. [VERIFIED: git check-ignore showed .lavish/kit/daemon/server.ts was ignored]

---

### Mishap 6: commit-msg hook rejected feat(daemon): — 'daemon' kein registrierter Scope
**Typ:** drift | **Komponente:** repo/commit-scopes

A commit with `feat(daemon): partial p1 daemon core ...` was rejected by validate-commit-msg because 'daemon' is not in the allowed scopes list (website, infra, db, security, ops, test, plans, factory, agents, skills, ci, scripts, docs, mcp, deps). Had to use `scripts` as fallback scope. [VERIFIED: commit rejected with 'unknown scope daemon']

---

### Mishap 7: repo-hygiene: CI open fix — 3 PRs rebased, all MERGEABLE
**Typ:** degraded | **Komponente:** ci

repo-hygiene run: 3 PRs (3533, 3534, 3537) were DIRTY/CONFLICTING due to main divergence. All three were rebased, force-pushed, and auto-merge re-enabled. CI re-triggered on fresh branches. No CI failures found on current runs.

---

### Mishap 8: ticket-ops Step-1.1-Fetch-Query schlägt fehl (GROUP-BY-Drift)
**Typ:** drift | **Komponente:** skills

Step-1.1-Fetch-Query in ticket-ops-procedures.md schlägt mit GROUP-BY-Fehler fehl: ORDER BY außerhalb des Subquery bezieht Spalten, die nicht in der GROUP-BY-Klausel sind. Workaround: Query neu generiert (valide Ergebnisse). Fix nötig in .claude/skills/references/ticket-ops-procedures.md.

---

### Mishap 9: PR auf falschem Branch erstellt (gh-axi im Haupt-Checkout statt Worktree)
**Typ:** process | **Komponente:** scripts

gh-axi pr create für T002479 (chore-Branch im Worktree) lief im Haupt-Checkout statt im Worktree-Verzeichnis → PR #3551 wurde auf feature/wire-cockpit-kit-T002458 erstellt (falscher head_ref) und musste geschlossen + korrekt neu erstellt werden (#3552). Die 3 CI-Fails von #3551 gehörten zum falschen Branch. Lehre: PR-Create-Kommando mit explizitem workdir des Worktrees ausführen; nach gh pr create IMMER head.ref verifizieren.

---

### Mishap 10: fleet-gpu Actions-Runner offline — Arbitration-Queue wächst seit >15h
**Typ:** degraded | **Komponente:** infra

Self-hosted fleet-gpu GitHub Actions Runner ist offline (API: total_count=0). Die Merge-Arbitration-Queue (arbitration.yml, runner-label fleet-gpu) wächst: Dutzende queued Runs seit 2026-07-30 22:00 durchgehend, u.a. alle 30-Min-schedule-Runs. Kein Required Check (fail-open per T002423), aber mergeable_state=unknown blockiert die Mergeability-Berechnung für PRs mit queued arbitrate-Check. Befund während PR #3552 (Merge funktionierte letztlich via Auto-Merge). Runner-Daemon muss neu registriert/gestartet werden.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
