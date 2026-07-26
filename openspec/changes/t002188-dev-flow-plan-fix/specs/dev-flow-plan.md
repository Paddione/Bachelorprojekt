## ADDED Requirements

### Requirement: Agent-Lock-Pfad wird über git-common-dir aufgelöst, nicht relativ

Der Pre-Commit-Guard in `.claude/skills/dev-flow-plan/SKILL.md` SHALL den Pfad zur
Agent-Lock-Datei über `$(git rev-parse --git-common-dir)` auflösen statt über das relative
`.git/agent-locks/`. In einem `git worktree` ist `.git` eine **Datei** (ein Zeiger auf das
gemeinsame Git-Verzeichnis), kein Verzeichnis — ein relativer Pfad greift dort ins Leere. Das
Ergebnis ist entweder ein blockierter Commit mit falscher „branch mismatch"-Meldung oder,
schlimmer, ein stillschweigend ungeschützter Commit.

Da die gesamte feature/fix-Arbeit dieses Repos laut Worktree-Pflicht in `.worktrees/`
stattfindet, greift der Guard im Regelfall gar nicht — er schützt nur im Hauptcheckout, wo er
am wenigsten gebraucht wird.

#### Scenario: Der Guard findet die Lock-Datei innerhalb eines Worktrees

- **GIVEN** die Arbeit läuft in einem `git worktree` unter `.worktrees/<slug>`, in dem `.git`
  eine Datei ist
- **WHEN** der Pre-Commit-Guard die Agent-Lock-Datei für das Ticket sucht
- **THEN** löst er den Pfad über `$(git rev-parse --git-common-dir)/agent-locks/ticket__<id>.json`
  auf und findet die tatsächlich vorhandene Lock-Datei

#### Scenario: Ein echter Branch-Mismatch wird weiterhin blockiert

- **GIVEN** eine Lock-Datei existiert und nennt einen anderen Branch als den ausgecheckten
- **WHEN** der Pre-Commit-Guard läuft
- **THEN** blockiert er den Commit mit einer Branch-Mismatch-Meldung

#### Scenario: dev-flow-execute nutzt dieselbe Auflösung

- **GIVEN** `.claude/skills/dev-flow-execute/SKILL.md` enthält einen gleichartigen Guard
- **WHEN** die Skill-Dateien auf relative `.git/`-Pfade geprüft werden
- **THEN** verwendet auch dieser Guard `git rev-parse --git-common-dir` statt eines relativen
  `.git/`-Pfades
