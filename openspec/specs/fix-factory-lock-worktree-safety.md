# fix-factory-lock-worktree-safety

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu fix-factory-lock-worktree-safety ergänzen._

## Requirements

### Requirement: Branch-Lock vor jedem Worktree-Schreibzugriff

Die Factory MUSS vor dem ersten Schreibzugriff auf einen geteilten Worktree (Worktree-Erstellung, Implementierungs-Commits, Merge/Rebase im Worktree, Deploy-Pushes) einen branch-scoped agent-lock claimen. Der Claim MUSS nach Abschluss der Arbeiten freigegeben werden, BEVOR das Worktree-/Branch-Cleanup laeuft — cleanup.sh ueberspringt die Entfernung, solange ein lebender Claim existiert (T002896). Ein eigenes, erneutes Claimen desselben Aufrufers MUSS den Heartbeat auffrischen (TTL 1800s) statt zu scheitern, damit es als Refresh an langen Pipeline-Phasengrenzen dient.

#### Scenario: Factory-Commit laeuft unter aktivem Lock

- **GIVEN** die Factory startet einen Implementierungs-Task fuer einen Branch
- **WHEN** sie den Worktree fuer den Branch aufsetzt und darin `git add -A && git commit` ausfuehrt
- **THEN** existiert vor dem ersten Schreibzugriff eine lebende branch-scoped Claim-Datei (owner_sid der Factory-Session, Label `factory-pipeline`, Branch und Worktree-Pfad eingetragen), und nach Abschluss inklusive Cleanup ist die Claim-Datei entfernt

#### Scenario: Heartbeat-Refresh an Phasengrenzen

- **GIVEN** die Implementierungs-Phase laenger als die Claim-TTL (1800s) dauert
- **WHEN** die Factory den Implementierungs-Loop bzw. die Deploy-Phase beginnt
- **THEN** erneuert die Factory ihren eigenen Claim (Refresh statt Fehlschlag), und ein dabei entdeckter fremder Claim fuehrt zum Defer statt zum Weiterschreiben

### Requirement: Defer statt Ueberschreiben bei fremdem Live-Lock

Vor dem Betreten eines existierenden Worktrees MUSS die Factory pruefen, ob der Ziel-Branch von einer anderen Session live gelockt ist (agent-lock check). Ist das der Fall, MUSS sie die Bearbeitung zurueckstellen (Defer, `reason: branch-locked`) — Slot freigeben, Ticket-Status unveraendert lassen, kein Schreibzugriff. Ein fremder Live-Lock MUSS niemals ueberschrieben oder per `--force` verdrängt werden; ein eigener Claim auf einen von der eigenen Session gehaltenen Branch ist davon unberuehrt.

#### Scenario: Fremd-Lock vor Worktree-Betreten

- **GIVEN** eine andere Session haelt einen live agent-lock auf dem Ziel-Branch (ohne dass `worktree-create.sh` ein "branch in use" meldet)
- **WHEN** die Factory den Worktree betreten will
- **THEN** meldet der Pre-Check `held`, die Factory deferriert mit `reason: branch-locked`, gibt den Pipeline-Slot frei und laesst den fremden Claim samt Besitzer unveraendert

#### Scenario: Lock-Rennen zwischen Worktree-Erstellung und Claim

- **GIVEN** eine fremde Session claimt den Branch in dem Zeitfenster zwischen Worktree-Erstellung und Factory-Claim
- **WHEN** die Factory ihren Claim absetzt
- **THEN** schlaegt der Claim fehl (ok=false), die Factory deferriert mit `reason: branch-locked` und schreibt nicht in den Worktree

### Requirement: Cleanup-Reihenfolge Lock-Freigabe vor Worktree-Entfernung

Der finally-Pfad der Factory MUSS den branch-scoped Claim freigeben, BEVOR cleanup.sh aufgerufen wird. Das Cleanup entfernt andernfalls weder Worktree noch Branch (T002896) — jeder Factory-Lauf liesse Aufraeumung zurueck. Die Freigabe darf keine Fremd-Claims beruehren (SID-Check in agent-lock.sh) und MUSS ein No-op sein, wenn kein Claim existiert.

#### Scenario: Freigabe vor Cleanup in jedem Ausgang

- **GIVEN** ein Factory-Lauf endet (Erfolg, Defer oder Fehler)
- **WHEN** der finally-Block ausgefuehrt wird
- **THEN** ist der eigene Claim vor dem cleanup.sh-Aufruf freigegeben, und Worktree/Branch werden tatsaechlich entfernt

<!-- merged from change delta fix-factory-lock-worktree-safety.md (9ab54b92fd9e) -->

### Requirement: Create-Skript verifiziert den realen Worktree-Pfad

`scripts/worktree-create.sh` SHALL, after creating a worktree, resolve the actually
registered path via `git worktree list --porcelain` (helper
`scripts/lib/worktree-real-path.sh`, function `worktree_real_path`) and compare it with
the requested path. On mismatch the script SHALL print a warning naming both paths and
report the registered path in its final line; on match the existing behavior is
unchanged.

#### Scenario: Realer Pfad weicht ab — Drift wird sichtbar

- **GIVEN** worktree-create.sh wurde mit Pfad A aufgerufen, `git worktree list` registriert den Worktree aber unter Pfad B (z. B. Ticket-ID-Suffix)
- **WHEN** das Skript nach dem Anlegen den realen Pfad prüft
- **THEN** eine Warnung nennt beide Pfade, und die Abschlussmeldung nennt den registrierten Pfad B

#### Scenario: Pfad stimmt überein — Verhalten unverändert

- **GIVEN** der registrierte Pfad entspricht dem übergebenen Pfad
- **WHEN** das Skript den realen Pfad prüft
- **THEN** keine Warnung; Abschlussmeldung wie bisher

#### Scenario: Helper ist offline testbar und source-bar

- **GIVEN** ein lokales git-Fixture mit einem Worktree (oder ohne)
- **WHEN** `worktree_real_path <repo-root> <wt-path>` gesourct und aufgerufen wird
- **THEN** es liefert den registrierten Pfad bzw. leeren Output für nicht registrierte Pfade

<!-- merged from change delta fix-factory-lock-worktree-safety.md (5604f7e07300) -->