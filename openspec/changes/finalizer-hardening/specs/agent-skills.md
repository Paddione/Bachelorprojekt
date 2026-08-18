## ADDED Requirements

### Requirement: Finalizer serialisiert die Archiv-Sektion

`scripts/devflow-post-merge-finalize.sh` SHALL serialize its archive section (step 8) against
other concurrent runs of the same script on the same repository. The section switches the branch
of a shared working tree via `git checkout -B`, so two concurrent runs would contend for one
index and one branch ref.

The mutual exclusion SHALL span all worktrees of the repository, matching the scope of the shared
index. When the locking primitive is unavailable, the script SHALL continue unserialized and emit
a warning rather than abort — completing the archive matters more than guarding against a rare
timing.

#### Scenario: Zwei gleichzeitige Archiv-Sektionen

- **GIVEN** zwei Läufe des Finalizers für verschiedene Tickets im selben Repository
- **WHEN** beide ihre Archiv-Sektion betreten
- **THEN** betritt der zweite sie erst, nachdem der erste sie verlassen hat — die
  Ausführungsintervalle überlappen nicht

### Requirement: Finalizer trennt nicht auflösbare Eingaben von erledigten Schritten

`scripts/devflow-post-merge-finalize.sh` SHALL distinguish two reasons a step does no work:
the target state is verifiably already reached (a legitimate idempotence skip), and the step
could not resolve its input (a failure). The second SHALL be reported with a marker distinct from
the skip marker, SHALL be counted separately, and the count SHALL appear in the closing summary
line.

Such a warning SHALL NOT change the exit code — the run must stay repeatable — but SHALL make the
condition visible to the caller, who otherwise cannot tell success from silently doing nothing.

Step 10 SHALL detect the contradiction in which the resolved worktree path does not exist while
some worktree still has the target branch checked out, and SHALL report it as a warning rather
than as "already removed".

#### Scenario: Aufgelöster Pfad fehlt, aber ein Worktree hält den Branch

- **GIVEN** der aufgelöste Worktree-Pfad existiert nicht, und ein anderer Worktree hat den
  Ziel-Branch ausgecheckt
- **WHEN** Schritt 10 läuft
- **THEN** meldet er den Widerspruch als Warnung, zählt ihn nicht als übersprungen, und die
  Schlusszeile nennt die Anzahl der Warnungen

### Requirement: Finalizer prüft die Archiv-Idempotenz über den Zielzustand

The step-8 idempotence check in `scripts/devflow-post-merge-finalize.sh` SHALL treat the archive
as done when any of these holds: the archive branch still exists on the remote, the archive
directory for the change exists on `origin/main`, or an archive pull request for that branch has
been merged.

Checking only for the existence of the archive branch is insufficient, because step 8 deletes
that branch itself when merging the archive pull request, and therefore produces the state
"merged, branch gone" as part of its own normal operation.

#### Scenario: Archiv-PR gemergt, Remote-Branch gelöscht

- **GIVEN** der Archiv-PR für einen Change ist gemergt und sein Remote-Branch ist gelöscht,
  während der Change-Ordner lokal noch vorhanden ist
- **WHEN** der Finalizer erneut läuft und Schritt 8 erreicht
- **THEN** überspringt er die Archivierung als bereits erledigt und versucht keinen zweiten
  Archivierungslauf

#### Scenario: Nichts davon trifft zu

- **GIVEN** weder Archiv-Branch noch Archiv-Verzeichnis noch ein gemergter Archiv-PR existieren
- **WHEN** Schritt 8 die Idempotenz prüft
- **THEN** meldet die Prüfung "nicht erledigt" und die Archivierung läuft
