# g-size02-large-files-gate

## Purpose

Stellt sicher, dass alle Quelldateien im Repository, die mehr als 600 Zeilen umfassen, innerhalb des Gate-Scopes von `docs/code-quality/gates.yaml` liegen und damit durch das S1-Zeilenlimit-Gate überwacht werden. Aktuell befinden sich 18 solcher Dateien vollständig außerhalb des Scopes (`15× VideoVault/`, `3× .opencode/`) und wachsen ohne automatisierten Gegendruck. Dieses Spec definiert die Akzeptanzbedingungen für das Erreichen von ≤ 8 Dateien außerhalb des Gate-Scopes.

## Requirements

- REQ-1: Der Measure-Command ist reproduzierbar und liefert bei identischem Repository-Stand stets dasselbe numerische Ergebnis. Er ist frei von Abhängigkeiten außerhalb von Standard-POSIX-Tools (`git`, `wc`, `awk`, `grep`) und läuft ohne Netzwerk- oder Cluster-Zugriff.

- REQ-2: Das Verzeichnis `.opencode` ist in `scan.code_roots` in `docs/code-quality/gates.yaml` eingetragen. Alle drei derzeit übergroßen Plugin-Dateien (`background-agents.ts`, `worktree.ts`, `worktree/terminal.ts`) stehen in `s1.ignore` mit einer dokumentierten Begründung.

- REQ-3: Mindestens sieben der fünfzehn VideoVault-Dateien, die aktuell mehr als 600 Zeilen aufweisen, wurden durch Splitting auf unter 600 Zeilen pro Datei reduziert. Alle neu extrahierten Dateien liegen ebenfalls unter 600 Zeilen.

- REQ-4: Kein bestehendes TypeScript-Kompilat in `VideoVault/` bricht durch die Splits: alle Imports in Konsumenten-Dateien und Test-Dateien bleiben korrekt (entweder unverändert oder aktualisiert auf neue Pfade).

- REQ-5: Der Measure-Command liefert nach Abschluss aller Änderungen einen Wert ≤ 8.

- REQ-6: Das S1-Gate läuft ohne Fehler durch — `s1.ignore`-Einträge für die `.opencode`-Plugin-Dateien sind gesetzt, bevor `.opencode` in `scan.code_roots` landet.

## Acceptance Criteria

- THEN liefert der Measure-Command
  ```bash
  git ls-files VideoVault .opencode \
    | grep -E '\.(ts|tsx|js|mjs|cjs|svelte|astro|sh|py)$' \
    | grep -v node_modules \
    | xargs wc -l 2>/dev/null \
    | grep -v ' total$' \
    | awk '$1>600' \
    | wc -l
  ```
  einen Wert **≤ 8**.

- THEN ist `.opencode` in `scan.code_roots` in `docs/code-quality/gates.yaml` eingetragen.

- THEN enthalten die `s1.ignore`-Einträge für alle drei `.opencode`-Plugin-Dateien eine Begründungszeile.

- THEN enthält keine der in Tasks 2–8 aufgeteilten VideoVault-Dateien mehr als 600 Zeilen gemäß `wc -l`.

- THEN schlägt `task test:changed` nicht fehl.

- THEN gibt `bash scripts/health-goals-check.sh --only=G-SIZE02` grünen Status aus.

- THEN gibt `task freshness:check` Exit 0 zurück.
