## ADDED Requirements

### Requirement: Worktree-Aktivitätsschutz vor Zombie-Löschung

Der Watchdog SHALL einen Worktree nur dann als Zombie löschen, wenn keine
Aktivitätssignale ihn schützen. Aktivitätssignale sind: ein Prozess mit cwd im
Worktree, ein offener Datei-Handle unter dem Worktree-Pfad oder eine
Schreibaktivität im Worktree innerhalb des Aktivitätsfensters.

#### Scenario: Aktiver Prozess mit fremdem cwd wird geschont

- **GIVEN** ein unclaimed Worktree ohne Prozess-cwd im Worktree
- **WHEN** ein anderer Prozess ein Datei-Handle unter dem Worktree-Pfad offen hält
- **THEN** löscht der Watchdog den Worktree nicht und protokolliert die Schonung

#### Scenario: Kürzliche Schreibaktivität wird geschont

- **GIVEN** ein unclaimed Worktree ohne Prozesse und offene Handles
- **WHEN** der Worktree enthält Dateien mit mtime jünger als das
  Aktivitätsfenster (Default 10 Min)
- **THEN** löscht der Watchdog den Worktree nicht

#### Scenario: Ruhiger Zombie wird gelöscht

- **GIVEN** ein unclaimed Worktree ohne cwd-Prozess, offene Handles und mit
  keiner Schreibaktivität im Aktivitätsfenster
- **WHEN** der Watchdog den Zombie-Cleanup ausführt
- **THEN** wird der Worktree entfernt wie bisher

### Requirement: Serialisierung von Heartbeat-TTL-Reap und Zombie-Purge

Heartbeat-TTL-Reap (agent-lock) und Zombie-Purge (Watchdog) SHALL ihre
Entscheidungen serialisieren, sodass nicht beide im selben Fenster denselben
Worktree löschen. Der Purge SHALL die Liveness-Probe unmittelbar vor dem
`git worktree remove` wiederholen.

#### Scenario: Reap und Purge im selben Fenster

- **GIVEN** ein Lock wird per Heartbeat-TTL gerade gereapt
- **WHEN** der Watchdog-Zombie-Purge im selben Fenster denselben Worktree erreicht
- **THEN** prüft der Purge erneut Liveness und bricht ab, wenn inzwischen Leben
  erkannt wurde; die beiden Pfade laufen nie ungeschützt gleichzeitig

### Requirement: factory_excluded-Tickets bleiben vom eigenen Watchdog verschont

Der Watchdog SHALL Worktrees von Tickets mit `readiness.factory_excluded=true`
nicht selbst reapen (T006364-Kontext bleibt erhalten).

#### Scenario: Eigenes factory_excluded-Ticket

- **GIVEN** ein Ticket mit `factory_excluded=true` besitzt einen Zombie-kandidaten-Worktree
- **WHEN** der Watchdog-Cleanup läuft
- **THEN** wird dieser Worktree nicht angetastet
