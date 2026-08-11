# batch-repo-hygiene-ops-fixes

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-repo-hygiene-ops-fixes ergänzen._

## Requirements

### Requirement: branch-reaper unterstützt ticketlosen Sweep-Modus

The system SHALL branch-reaper.sh um einen ticketlosen Modus (`--all`/`--sweep`) erweitern, der über alle Remote-Heads läuft und je Branch REAP/KEEP mit Begründung ausgibt.

#### Scenario: Sweep über alle Remote-Branches

- **GIVEN** ein Bestand an Remote-Branches mit und ohne PR
- **WHEN** `scripts/branch-reaper.sh --sweep --dry-run` läuft
- **THEN** listet es jeden Branch mit REAP/KEEP und Begründung
- **AND** ohne `--ticket` bricht es nicht mehr mit Exit 2 ab

#### Scenario: Bestand ohne verwaiste Branches

- **GIVEN** keine verwaisten Remote-Branches
- **WHEN** der Sweep-Modus läuft
- **THEN** meldet er explizit "keine verwaisten Branches gefunden"
- **AND** unterscheidet sich von einem Fehlschlag (kein vakuoses Exit 0)

### Requirement: [gone]-Prune-Reihenfolge korrigieren

The system SHALL die Reihenfolge in repo-hygiene-ops.md §2 so korrigieren, dass der [gone]-Prune NACH branch-reaper läuft oder den Archiv-Tag als zulässiges Positiv-Signal akzeptiert.

#### Scenario: Reaper erzeugt [gone]-Refs im selben Lauf

- **GIVEN** branch-reaper löscht Remote-Branches
- **WHEN** der §2-[gone]-Pfad danach läuft
- **THEN** räumt er die neu entstandenen [gone]-Refs auf
- **AND** nutzt den Archiv-Tag (`refs/tags/reaped/<branch>`) als Sicherheitsanker

### Requirement: Konfliktprobe per merge-tree statt invasivem Merge

The system SHALL in repo-hygiene-ops.md §3 die `git merge-tree --write-tree`-Form als primäre Konflikt-Gegenprobe nennen und den Arbeitsbaum-Merge nur für den Fall vorsehen, in dem Konfliktmarker sichtbar sein sollen.

#### Scenario: Phantomkonflikt in dirty Worktree

- **GIVEN** ein PR-Worktree mit abweichender openspec-status.json (Normalfall)
- **WHEN** die Konfliktprobe gegen origin/main läuft
- **THEN** nutzt sie `git merge-tree --write-tree --name-only`
- **AND** fasst weder Working Tree noch Index an
- **AND** ein Exit 0 + Tree-SHA wird als konfliktfrei gewertet

### Requirement: gh pr checks cancelled ≠ fail

The system SHALL eine rot gemeldete GitHub-Check-Conclusion gegen `gh run view --json jobs` gegenprüfen, bevor sie als Fehler gewertet wird — `cancelled`/`skipped` ist kein `failure`.

#### Scenario: Aggregat-Job cancelled nach grünem Durchlauf

- **GIVEN** ein Check meldet "fail", aber alle Jobs sind success oder cancelled
- **WHEN** die Warteschleife den Check auswertet
- **THEN** stuft sie cancelled nicht als failure ein
- **AND** ein Re-Run genügt statt eines Codefehlers

### Requirement: statusCheckRollup auf head-SHA filtern

The system SHALL beim Auswerten von `statusCheckRollup` auf `.headSha == <headRefOid>` filtern und laufende/leere Conclusions explizit von negativen trennen.

#### Scenario: Läufe eines Vorgänger-Commits

- **GIVEN** Checks von einem Vorgänger-Commit (anderer headSha) erscheinen im Rollup
- **WHEN** die Watch-Schleife den PR-Zustand auswertet
- **THEN** ignoriert sie Checks fremder head-SHAs
- **AND** `conclusion=""` (laufend) wird nicht als Fehler gezählt

### Requirement: Factory-Tick-Vorcheck vor Worktree-Messung

The system SHALL in repo-hygiene-ops.md §1 den Vorcheck auf einen laufenden Factory-Tick (tick_running) dokumentieren und die Worktree-Messung unmittelbar vor dem Remove wiederholen.

#### Scenario: Factory-Tick verändert Worktrees unter dem Lauf

- **GIVEN** ein paralleler Factory-Tick läuft (tick_running=true)
- **WHEN** repo-hygiene die Worktree-Sektion ausführt
- **THEN** überspringt es die Worktree-Sektion oder wiederholt die --porcelain-Prüfung unmittelbar vor dem Remove
- **AND** die Entscheidung basiert auf dem zum Entscheidungszeitpunkt gültigen Zustand

#### Scenario: Cron läuft auch bei leerem non-main-Bestand durch (pipefail-Guard)

- **GIVEN** der Remote hat keine non-main-Branches (leerer grep-Bestand, `grep -v` Exit 1)
- **WHEN** `repo-hygiene-cron.sh standard` unter `set -euo pipefail` läuft
- **THEN** bricht es nicht an der `remote_branch_count`-Pipeline ab
- **AND** liefert Exit 0 mit gültiger JSON-Messung (leerer Bestand = Messwert, kein Fehlschlag)

<!-- merged from change delta batch-repo-hygiene-ops-fixes.md (ebf9e38f7e7c) -->