---
title: "Mishap-Bundle: agent-lock, infra, plans, website, ci, factory (10 Einträge)"
domains: [scripts, infra, ci, plans, website]
ticket_id: T002457
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Mishap-Bundle: T002457 — 10 Einträge

## Intent
Behebt 10 Prozess-/Logik-Probleme aus mehreren Bereichen, die in der ticket-ops-Session am 2026-07-28 als Mishap-Bundle zusammengefasst wurden.

## Changes

### 1. agent-lock.sh: reap räumt Zombie-Locks nicht
**Severity:** degraded | **Area:** scripts/agent-lock.sh
**Issue:** `reap` prüft SID-Liveness statt PID-Liveness. Tote PIDs hinterlassen Zombie-Locks.
**Fix:** In `_sid_alive()` zusätzlich `_pid_alive()` für numerische SIDs prüfen. Bereits in T002447 als Teil der Identitäts-Extraktion adressiert.

### 2. mcp-postgres nicht erreichbar
**Severity:** degraded | **Area:** infra/mcp-postgres
**Issue:** Port-Forward auf :13001 antwortet nicht — Fallback auf kubectl exec nötig.
**Fix:** Port-Forward-Instabilität untersuchen und stabilisieren.

### 3. agent-collision.sh Fehlalarme (Selbstmeldung)
**Severity:** broken | **Area:** infra
**Issue:** Gurad meldet eigene Session und nicht existierende Dateien als Kollision.
**Fix:** Selbst-Ausschluss-Prüfung + Prüfung auf Datei-Existenz vor Kollisionsmeldung.

### 4. Stale Worktree-Eintrag
**Severity:** suspicious | **Area:** infra
**Issue:** `git worktree list` zeigte Eintrag ohne existierendes Verzeichnis.
**Fix:** Bereits durch `git worktree prune` behoben.

### 5. 6 Mishap-Worktrees mit uncommitteten Proposals
**Severity:** suspicious | **Area:** plans
**Issue:** Worktrees für T002372 u.a. haben staged aber uncommittete openspec-Dateien.
**Fix:** Entweder committen oder verwerfen — Worktrees aufräumen.

### 6. bug-report-test Worktree mit unstaged-Modifikation
**Severity:** suspicious | **Area:** website
**Issue:** Worktree mit unstaged Änderung an openspec-status.json.
**Fix:** Änderung stagen/committen oder Worktree bereinigen.

### 7. BATS BW02 Warnings auf 3 PRs
**Severity:** broken | **Area:** ci
**Issue:** `ticket-grill.bats` fehlt `bats_require_minimum_version` → CI rot.
**Fix:** In PR #3513 bereits behoben.

### 8. preflight-pr-scope blockiert PR aus main-Checkout
**Severity:** process | **Area:** ci
**Issue:** Skript fordert Worktree, auch für einfache Fixes.
**Fix:** Workaround dokumentieren oder Skript lockern.

### 9. Factory Scout: 15/20 SCOUT_WEAK
**Severity:** degraded | **Area:** factory
**Issue:** LLM-Fallback unerreichbar, Spec-Qualitäts-Prüfung deklariert Specs als zu kurz.
**Fix:** In `scout-prediction-quality`-Proposal adressiert.

### 10. agent-lock reap (ticket-ops)
**Severity:** degraded | **Area:** scripts/agent-lock.sh
**Issue:** Zombie-Locks von T002342/T002447 benötigten --force.
**Fix:** Siehe Change 1 — gleiche Ursache.

## Trade-offs
- Die meisten Changes sind bereits in anderen Tickets adressiert oder Workaround-dokumentiert.
- Dieses Bundle dient der Nachverfolgung und dem Abhaken, nicht der Neuimplementierung.
