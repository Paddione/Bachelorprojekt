## MODIFIED Requirements

### Requirement: Agent-Kollisionserkennung bei parallelen Edits

The system SHALL detect when a live peer agent has in-flight modifications to the same files as the
current session. In-flight means the union of the peer's committed branch divergence
(`<base>...HEAD`, three-dot), its unstaged changes and its staged changes — a peer that has already
committed its work MUST still be reported. Peer liveness SHALL follow the same rule as
`agent-lock.sh`: non-numeric (harness-provided) session IDs count as alive because `pgrep -s` cannot
resolve them; numeric session IDs remain `pgrep`-verified. Files whose blob in the peer worktree is
identical to the blob in the base branch SHALL be dropped, so squash-merged branches stop warning.
`--staged` checks staged files, `--all` additionally unstaged, `--branch` the current session's own
committed branch divergence. On collision: exit 1 with a `COLLISION` line naming the file;
`--quiet` suppresses the lines but keeps the exit code; dead or own sessions are ignored. Every git
operation that fails degrades to "no data" (fail-open, exit 0) rather than blocking.

#### Scenario: Überlappende Staged-Datei ergibt Kollision
- **GIVEN** Peer-Session 2222 ist als lebendig markiert und hat `shared.txt` in Worktree B modifiziert; Session 1111 staged `shared.txt` in Worktree A
- **WHEN** `agent-collision.sh check --staged` in Worktree A ausgeführt wird
- **THEN** Exit 1; Ausgabe enthält `COLLISION` und `shared.txt`; `--quiet` gibt Exit 1 ohne Ausgabe

#### Scenario: Tote Session und fehlender Worktree sind fail-open
- **GIVEN** Peer-Session 2222 ist NICHT in `AGENT_LOCK_FAKE_ALIVE` (tot); oder Peer-Worktree-Pfad existiert nicht mehr
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 0 in beiden Fällen; eigene SID (1111) als Peer-Claim ergibt ebenfalls Exit 0 (keine Selbst-Kollision)

#### Scenario: Harness-SID ohne pgrep-Auflösung gilt als lebendig
- **GIVEN** ein Peer-Claim mit nicht-numerischer Session-ID (UUID) und einer überlappenden Datei; `AGENT_LOCK_FAKE_ALIVE` ist NICHT gesetzt
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 1 mit `COLLISION`; eine numerische, nicht existente Session-ID ergibt unter denselben Bedingungen Exit 0

#### Scenario: Committete Peer-Arbeit ist sichtbar
- **GIVEN** der Peer hat seine Änderung an `shared.txt` bereits committed, sein Working Tree ist sauber
- **WHEN** `agent-collision.sh check --staged` mit derselben Datei staged ausgeführt wird
- **THEN** Exit 1 mit `COLLISION` und `shared.txt`; eine committete Peer-Änderung an einer anderen Datei ergibt Exit 0

#### Scenario: Squash-gemergter Peer warnt nicht mehr
- **GIVEN** der Peer hat `shared.txt` committed und derselbe Inhalt steht inzwischen über einen eigenen Commit in `main`, sodass die Blobs identisch sind
- **WHEN** `agent-collision.sh check --staged` ausgeführt wird
- **THEN** Exit 0; solange der Peer-Blob dagegen von `main` abweicht, ergibt derselbe Aufruf Exit 1

#### Scenario: --branch prüft die eigene Branch-Divergenz
- **GIVEN** die eigene Änderung an `shared.txt` ist bereits committed und nichts ist staged; ein lebender Peer hat dieselbe Datei in Arbeit
- **WHEN** `agent-collision.sh check --branch` ausgeführt wird
- **THEN** Exit 1 mit `shared.txt`; `--staged` ergibt im selben Zustand Exit 0; `--branch --quiet` gibt Exit 1 ohne Ausgabe; ein fehlender Peer-Worktree ergibt Exit 0
