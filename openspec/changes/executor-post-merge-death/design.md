---
ticket_id: T006284
plan_ref: openspec/changes/executor-post-merge-death/tasks.md
status: active
date: 2026-08-15
---

# Design: executor-post-merge-death

## Symptom vs. Ursache (T002448-M5)

**Symptom (beobachtet, Fakt):** Nach dem Merge des Fix-PR #4460 (fix/mcp-task-runner-cancel-escalation-T005592, merged 2026-08-14T17:58:10Z) starb der dev-flow-execute-Executor mitten im Ablauf:

- Ticket blieb `in_progress` (Closure unterblieb)
- Plan wurde nicht nach `tickets.ticket_plans` archiviert, OpenSpec-Change nicht ins Archiv verschoben
- Worktree/Branches wurden nicht bereinigt
- Branch-Lock war verwaist (owner PID tot)

Die Eskalation (deepseek-v4-flash) schloss das Ticket manuell (`done/fixed`), verifizierte das vom Factory-Poller angestoßene Archiv und räumte Cleanup + Lock manuell nach.

**Hypothese (aus der Ticket-Beschreibung):** „lief aus dem Kontext" — Kontext-Erschöpfung des Executors.

**Evidenz für die Hypothese:**

1. **Strukturell (im Repo belegbar):** Die Post-Merge-Schritte 6.4–7.5 (Merge-Wait-Loop → Ticket-Closure → Plan-Archiv → Worktree/Branch-Cleanup → Lock-Release) sind die **letzten** Schritte des dev-flow-execute-Ablaufs und laufen **im Orchestrator-Kontext**, der zuvor die gesamte Implementierung (Implementer-Delegation), das Review-Gate und die CI-Fix-Schleife (Logs, Rebase-Entscheidungen) getragen hat. Der Kontext ist an dieser Stelle maximal belastet.
2. **Dokumentiert (T001571, `.claude/skills/references/subagent-provisioning.md` §4):** „Subagenten degradieren still, wenn ihr Kontext gegen das Fenster (~200k Tokens) läuft: Scope-Drift, fachfremde Edits, **vergessene Auftragsdetails**." Das beobachtete Muster — die Post-Merge-Schritte wurden ersatzlos vergessen, ohne Fehler, ohne Handoff — ist exakt diese Fehlerklasse.
3. **Incident-Fakten:** Es gab keinen Fehler-Exit und keine Meldung — die Schritte fehlten einfach. Auch der Factory-Poller (`auto-close-merged.sh`) griff nicht rechtzeitig ein (Eskalation war schneller; der Poller schließt zudem nur Tickets, archivert nicht, räumt nicht auf).

**Befund:** Die Ursache liegt nicht in einem einzelnen Befehl, sondern in der **architektonischen Platzierung** der Finalisierung am Ende eines kontextschweren Agenten-Lebenszyklus. Ein reines Prompt-Verbot („behalte Kontext im Blick") ist die Fehlerklasse, die T005565/T002365 bereits als wirkungslos dokumentiert haben („Die Härtung entfernt die Gelegenheit, statt die Direktive zu verschärfen").

## Goals

- Die Post-Merge-Finalisierung (Merge-Wait, Closure, Archiv, Cleanup, Lock-Release) läuft in **frischem Kontext** — unabhängig vom erschöpften Executor-Kontext.
- Eine **deterministische, idempotente** Finalisierungs-Einheit: die offenen Abschluss-Schritte sind mit **einem** Befehl nachholbar (Recovery-Session, Eskalation, Factory-Poller).
- Der Finalizer meldet den Endzustand strukturiert zurück (was erledigt, was offen).

## Non-Goals

- Kein neuer Factory-Watchdog/Zeitgeber: die bestehenden Poller (`auto-close-merged.sh`, `branch-reaper.sh`, `agent-lock.sh reap`) bleiben unverändert in ihrer Rolle; der Fix adressiert die Primär- statt der Sekundärversicherung.
- Keine Änderung der Implementer-/Orchestrator-Trennung aus T002365 (Schritte 2–3.8 bleiben, wie sie sind).
- Kein automatisches Öffnen von PRs durch den Finalizer über die Archiv-PR hinaus (Verhalten von `openspec.sh archive` bleibt).
- Kein Eingriff in `agent-lock.sh` selbst (Lock-System funktioniert; der Fix verhindert die Entstehung verwaister Locks im Normalpfad).

## Entscheidungen (Decisions)

### D1: Finalisierung als frischer Subagent — nach dem Review-Gate

Nach bestandenem Review-Gate (Schritt 3.8) und **vor** dem Übergang in die kontextschwere CI-Fix-Schleife endet der Orchestrator-Kontext für die Finalisierung: Die Schritte 6.4–7.5 werden an einen **frischen Finalizer-Subagenten** delegiert, der ein kompaktes Lagebild bekommt (Ticket-ID, PR-Nummer, Branch, Worktree-Pfad, Plan-Pfad, Resolution). Begründung: identisches Muster wie die Implementer-Delegation (T002365) und der T001571-Handoff — „frischer Kontext per Konstruktion". Der Orchestrator behält nur die CI-Fix-Schleife (5.5), weil diese den Implementer-Reset benötigt (bestehende Entscheidung, unverändert).

Abgrenzung zu T005565 (Review-Gate vor Auto-Merge): Das Gate bleibt Orchestrator-Schritt; delegiert wird erst die **Phase nach** dem Auto-Merge-Request.

### D2: Idempotentes Finalize-Skript als deterministische Einheit

`scripts/devflow-post-merge-finalize.sh <ticket-id>` bündelt die Abschluss-Schritte (PR-Link, `done`, `verify:done`-Event, Plan-Archiv nach `tickets.ticket_plans`, OpenSpec-Archiv inkl. Archiv-PR, Lock-Release, Worktree-Remove, Branch-Delete) als **idempotente** Einheit: Jeder Schritt erkennt erledigte Arbeit (Ticket bereits `done`? Plan bereits archiviert? Lock bereits frei?) und überspringt sie. Damit

- arbeitet der Finalizer-Subagent deterministisch (ein Befehl, keine Ad-hoc-Ketten),
- kann jede Recovery-Session/Eskalation die offenen Schritte mit einem Aufruf abschließen — genau das musste die Eskalation im Incident manuell in mehreren Schritten tun,
- kann der Factory-Poller später anbinden, ohne Closure-Logik zu duplizieren.

Begründung: Die Einzelschritte existieren bereits (`ticket.sh archive-plan`, `openspec.sh archive`, `agent-lock.sh release`, `git worktree remove`, `branch-reaper.sh`); es fehlt die **Zusammenfassung in einer aufrufbaren, idempotenten Einheit** mit klarem Exit-Code für Guards.

### D3: Der Finalizer-Prompt trägt die T001571-Standing-Direktive

Der Finalizer-Subagent bekommt die Kontext-Budget-Direktive („bei Anzeichen von Kontext-Überlauf: Handoff-Report liefern") — plus die Pflicht, das Finalize-Skript zu nutzen statt Schritte frei zu rekonstruieren. Der Endzustand wird als strukturierter Report zurückgemeldet.

## Betroffene Subsysteme / Dateien

- `.claude/skills/dev-flow-execute/SKILL.md` — Ablauf: Finalisierung als Delegation, Orchestrator-Stopp nach 3.8
- `.claude/skills/references/dev-flow-execute-phases.md` — Schritte 6.4–7.5 als Finalizer-Skript-Kette
- `scripts/devflow-post-merge-finalize.sh` — NEU: idempotente Finalisierungs-Einheit
- `openspec/specs/agent-skills.md` — SSOT-Delta (neues Requirement)
- `tests/spec/agent-skills/executor-post-merge-death.bats` — NEU: RED-Test (Konvention + Output-Verifikation)

## Edge-Cases

- **PR noch nicht gemergt** beim Finalizer-Start: Merge-Wait-Loop (Timeout, Exit-Code wie `devflow-ci-watch.sh`-Muster), danach Fortsetzung; Timeout → Report statt Closure (kein Ticket=done bei PR=OPEN, T001149-M1).
- **Finalizer stirbt selbst:** Das Finalize-Skript ist idempotent — erneuter Aufruf (Recovery/Eskalation) setzt an der ersten offenen Stelle fort.
- **Plan-Pfad nicht mehr im Branch-Commit** (Branch wurde zwischenzeitlich gelöscht): `ticket.sh archive-plan` erkennt das und skippt mit Meldung — Archiv aus DB-Daten ist bereits persistiert.
- **Kein OpenSpec-Change mehr vorhanden** (bereits archiviert): `openspec.sh archive` skippt; Skript-Ende-Status ok.
- **Lock gehört nicht dieser Session:** `agent-lock.sh release` nur bei eigenem Claim; fremde Locks bleiben liegen (T003102-Respekt).
