---
title: "agent-interaction-contract — Implementation Plan"
ticket_id: T900235
domains: [agent-skills, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-interaction-contract — Implementation Plan

_Ticket: T900235_

## File Structure

```
AGENTS.md                                            (changed — §Status Protocol → §Interaction Contract)
CLAUDE.md                                            (changed — Zeiger-Abschnitt auf den Vertrag)
tests/spec/agent-skills/interaction-contract.bats    (new — Guard, Source-Grep mit Positiv-Anker)
```

Keine Datei fällt unter ein S1-Limit: `docs/code-quality/gates.yaml` führt unter `s1.limits`
weder `.md` noch `.bats`, und `AGENTS.md`/`CLAUDE.md` liegen außerhalb von `scan.code_roots`.
Budget-Prüfung entfällt deshalb für alle drei Dateien.

```bash
# Stand, gegen den gemessen wurde
PRE=0581141f3
git grep -n 'Status Protocol' "$PRE" -- AGENTS.md CLAUDE.md GEMINI.md openspec/specs tests/spec
# → einziger Treffer: AGENTS.md:89 — weder Spec noch Guard tragen die Regel bisher
```

## Verify (RED → GREEN)

- [ ] **Guard schreiben (RED).** Lege `tests/spec/agent-skills/interaction-contract.bats` an.
      Der Guard prüft per Source-Grep — zulässige Ausnahme nach der Test-Resultats-Konvention
      (T002448-M4), weil der geprüften Sache, einem redaktionellen Abschnitt in `AGENTS.md`,
      jedes Laufzeitverhalten fehlt. Vorbild und zu übernehmende Struktur:
      `tests/spec/agent-skills/messung-mit-befehl.bats` (Kopfkommentar mit Prüfmodus-Begründung,
      Positiv-Anker, Sektions-Extraktion per `sed` von der H2-Überschrift bis zur nächsten H2).

      **Positiv-Anker (Pflicht, T002356-M1):** Jeder Test prüft zuerst, dass `AGENTS.md` existiert
      und die Überschrift `## Interaction Contract` trägt. Ohne den Anker bestünde eine gelöschte
      Datei alle Negativ-Suchen trivial.

      Assertions, je eine pro `@test`:
      1. `AGENTS.md` existiert und enthält `## Interaction Contract`.
      2. `AGENTS.md` enthält **nirgends** `## Status Protocol`.
      3. Der Abschnitt enthält **weder** `NEXT:` **noch** `CONF:`.
      4. Der Abschnitt enthält alle drei verbleibenden Footer-Felder `STATUS:`, `RUNNING:`,
         `BLOCKED:`.
      5. Der Abschnitt nennt die Autonomiegrenze in beiden Richtungen: er enthält sowohl
         `logical completion` als auch `without being asked`.
      6. Der Abschnitt enthält alle vier Stop-Trigger-Marker: `Destructive or irreversible`,
         `Genuine fork`, `Blocked`, `Cost above threshold`.
      7. Der Abschnitt referenziert `.claude/lib/behaviors/escalation-protocol.md` und enthält
         **nicht** `agent-escalate.sh` (Eskalation wird verwiesen, nicht dupliziert).
      8. Der Abschnitt nennt `AskUserQuestion` und `question` und den nummerierten
         Markdown-Fallback (`numbered`).
      9. `CLAUDE.md` existiert und verweist auf den Vertrag: es enthält `Interaction Contract`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/interaction-contract.bats
# expected: FAIL (rot — AGENTS.md trägt noch §Status Protocol, CLAUDE.md hat keinen Zeiger)
```

- [ ] **`AGENTS.md` umschreiben (GREEN, Teil 1).** Ersetze den Abschnitt `## Status Protocol
      (every reply, non-negotiable)` (aktuell Zeile 89) vollständig durch den folgenden Text.
      Nichts anderes in `AGENTS.md` wird angefasst; Position im Dokument bleibt gleich (zwischen
      „Dev experience" und „Reference Sections").

````markdown
## Interaction Contract (every reply, non-negotiable)

**Run the assignment to its end.** Carry the assigned task through to its own
logical completion — including verification, commit and pull request where the
assignment covers them — and only then return control. Never stop to have the
user confirm a step you would have recommended anyway. Never start a new task
or pull a new ticket without being asked.

**Stop only on these four triggers:**

1. **Destructive or irreversible** — delete, force-push, prod deploy, secret
   rotation, database drop.
2. **Genuine fork with no default** — two viable designs whose choice materially
   changes the outcome, and the prior-art search (T002829) found no precedent in
   `openspec/specs/` or `tests/spec/`.
3. **Blocked** — missing credentials, unreachable service, contradictory
   requirement. Follow `.claude/lib/behaviors/escalation-protocol.md`; do not
   restate it here.
4. **Cost above threshold** — long-running GPU jobs, large subagent fan-outs,
   expensive cloud runs.

Everything else is reversible and low-risk: act. Deliver the divisible part
regardless — finish everything the open question does not depend on and return
only the blocked remainder.

**Ask so the answer is one keystroke.** A question with a finite set of answers
goes through `AskUserQuestion` (Claude Code) or `question` (opencode, agy). A
harness offering neither falls back to numbered Markdown options with the
recommendation first. Never put a choice into free prose.

**Status footer — once, at the end of a finished thread**, never after every
action:

```
STATUS: <what happened>
RUNNING: <background work or "none">
BLOCKED: <blockers or "none">
```

There is deliberately no `NEXT` and no `CONF` line. A proposed next objective
invites the user to approve a step the agent should simply take; that was the
T016441 footer, replaced here by T900235.
````

- [ ] **`CLAUDE.md`-Zeiger setzen (GREEN, Teil 2).** Füge unmittelbar nach der Einleitungszeile
      („This file provides guidance to Claude Code …") und vor `## Agent Routing` diesen
      Abschnitt ein. Grund: Claude Code lädt `CLAUDE.md`, erreicht `AGENTS.md` aber nur über einen
      expliziten Verweis — ohne den Zeiger bliebe der Vertrag für die Hauptschleife unsichtbar.

```markdown
## Interaction Contract

Wie Agenten mit dir kommunizieren — Autonomiegrenze, die vier Stop-Trigger, die Form von
Entscheidungsfragen und der Status-Footer — steht vollständig in
[`AGENTS.md` → „Interaction Contract"](AGENTS.md). Das ist der harness-übergreifende SSOT;
hier wird er nicht gespiegelt.
```

- [ ] **Guard grün ziehen.** Derselbe Aufruf wie in der Rotphase muss jetzt bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/interaction-contract.bats
```

- [ ] **Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
