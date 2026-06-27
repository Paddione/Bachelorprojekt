---
title: "agent-lock + dev-flow mishap bundle (T001268): harness-stable identity, pre-commit guards, push verification"
ticket_id: T001268
status: plan_staged
---

# Proposal: agent-lock + dev-flow mishap bundle [T001268]

## Why

Drei orthogonale Mishaps aus den letzten dev-flow-execute Läufen (T001229, T001267):

1. **agent-lock-Session-Identität driftet pro Bash-Aufruf → Locks über Aufrufgrenzen wirkungslos.**
   `scripts/agent-lock.sh` `_my_sid()` nutzt `ps -o sess=` als Identität. Im Claude-Code/opencode-Harness bekommt jeder Bash-Tool-Aufruf eine neue Prozessgruppe / neue SID. Folge: ein in Aufruf A geclaimter Ticket-Lock erscheint Aufruf B als "tote Session" und wird vom impliziten reap entfernt. Das advisory `agent-lock`-Koordinationsmodell ist im Harness faktisch wirkungslos.

2. **Local main hatte stale Commit der nie auf origin war.** `dev-flow-plan` Schritt 5 macht den plan-stage Commit ohne explizit zu prüfen, dass `git status` clean ist und der Branch nicht `main` ist. Bei T001267 landete der Stage-Commit `33e4db52` auf `main` statt im Worktree-Branch, wurde nie gepusht, und beim nächsten `git pull --rebase origin main` dupliziert (replayed) — der Inhalt erschien sowohl unter `openspec/changes/migrate-to-upstream-openspec/` als auch unter `openspec/changes/archive/2026-06-27-migrate-to-upstream-openspec/`.

3. **Implementer-Subagent pusht Archive-Commits nicht.** `dev-flow-execute` Schritt 7 macht `git commit` für die Archive-Schritte, aber der Subagent-Return meldet "Plan archived: ja" allein auf Basis des lokalen Commits — ohne Beweis, dass der Push geklappt hat. Bei T001267 landeten die 3 Archive-Commits (`f1ab1117` + `89822b32` + `30c716de`) nur lokal; der Orchestrator musste manuell Branch pushen, chore/plan-archive-Branch erstellen und PR #2191 anlegen.

Alle drei Mishaps haben dasselbe Meta-Root-Cause: **der dev-flow Harness wird als POSIX-stabil angenommen, ist es aber nicht**. Identität, Branch-State und Remote-State können zwischen Tool-Aufrufen still driften. Die aktuellen Skripte und Skills prüfen das nicht explizit.

## What

Drei kleine, lokalisierte Fixes in **einem PR**:

- **ST-1** (`scripts/agent-lock.sh`): `_my_sid()` honoriert `CLAUDE_SESSION_ID` (harness-stabile env) als Identität — über dem `ps`-Fallback. `_detect_tool()` erkennt `CLAUDE_SESSION_ID` und meldet `tool: claude` statt `unknown`.
- **ST-2** (`.claude/skills/dev-flow-plan/SKILL.md`): Schritt 5 bekommt explizite Pre-Commit-Guards: (a) verbieten Commit auf `main`, (b) `git status --porcelain` muss leer sein, (c) Branch muss zum agent-lock Claim passen.
- **ST-3** (`.claude/skills/dev-flow-execute/SKILL.md`): Schritt 7 bekommt expliziten Push-Verification-Checkpoint: `git push -u origin` + `git ls-remote origin` (SHA-Vergleich) + neuer Subagent-Return-Field `push_verified:<sha>` als Pflicht.

## Acceptance

- Alle 6 `@test` Blöcke in `tests/spec/agent-lock-session-identity.bats` GREEN (vorher 6/6 RED).
- Existierende `tests/local/AGENT-LOCK-01-*.bats` weiterhin GREEN (Regression-Schutz).
- `task test:changed` + `task freshness:check` + `task test:openspec` alle grün.

## Out of scope

- Migration der Skills zu `superpowers:*` Namespaces (anderes Ticket).
- Echte subagent-seitige Enforcement der `push_verified:`-Pflicht (Orchestrator-Change, Follow-up).
- Änderung am agent-lock-Protokoll selbst (kein neues Wire-Format, keine Schema-Änderung — nur eine zusätzliche Env-Var-Quelle).
