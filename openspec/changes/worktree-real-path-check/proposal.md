# Worktree-Real-Path-Check

## Purpose (Deutsch)

`worktree-create.sh` soll nach dem Anlegen den REALEN Worktree-Pfad aus
`git worktree list --porcelain` verifizieren und bei Abweichung vom übergebenen Pfad
laut warnen sowie den realen Pfad in der Abschlussmeldung nennen. Beobachtet 2026-08-14:
Aufruf mit Pfad `.worktrees/batch-worktree-guard-tooling-fixes` (ohne Suffix), realer
Worktree hieß `.worktrees/batch-worktree-guard-tooling-fixes-T004295` (Ticket-Suffix),
die Skript-Ausgabe meldete den übergebenen Pfad — exakt die Pfad-Drift-Quelle aus
T003991 (Lock zeigt auf Pfad A, realer Worktree heißt B). Der Batch T004295 (p2) hat die
Folge im Lock-Treiber entschärft; die stille Abweichung im create-Pfad bleibt.

## Problem / Auslöser

Das Skript übergibt `WT_PATH` direkt an `git worktree add` und meldet in der
Abschlusszeile `$WT_PATH` — es verifiziert nie, welcher Pfad tatsächlich registriert
wurde. Weicht der reale Pfad ab (Suffix durch parallelen Aufrufer, Tool-Ableitung aus
dem Branch-Namen o.ä.), bleibt die Drift unsichtbar, bis der Lock-Treiber anhand des
falschen Pfads scheitert.

## Fix-Richtung

- **Neue source-bare lib `scripts/lib/worktree-real-path.sh`** mit Funktion
  `worktree_real_path <repo-root> <wt-path>`: parst `git worktree list --porcelain`,
  gibt den registrierten Pfad des Worktrees zurück (leer, wenn nicht registriert).
  Offline testbar, von create-Skript und Lock-Treibern nutzbar.
- **`scripts/worktree-create.sh`**: nach `git worktree add` + Checkout den realen Pfad
  ermitteln und mit `WT_PATH` vergleichen:
  - Abweichung → stderr-Warnung `worktree-create: realer Worktree-Pfad weicht ab —
    übergeben: $WT_PATH, registriert: $REAL_WT` + Abschlussmeldung mit `$REAL_WT`.
  - Übereinstimmung → bestehendes Verhalten unverändert.
- Keine Änderung an der Suffix-Quelle selbst (kann ein paralleler Aufrufer sein) —
  der Check macht die Drift sichtbar, statt sie zu erraten.

## Out of Scope

- Keine Suffix-Abschaffung im Tool-/Skill-Pfad (unbekannter Aufrufer, T004610-Kontext).
- Keine Änderung an agent-lock.sh (p2-Entschärfung existiert).
