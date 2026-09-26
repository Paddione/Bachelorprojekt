## p1 — Executor `scripts/openspec-orphan-archive.sh`

Target files: `scripts/openspec-orphan-archive.sh`

Requirement: openspec-workflow „Orphaned changes are archived by a CI executor without
discretionary flags". Neue Datei, kein S1-Restbudget-Thema; Richtwert unter 120 Zeilen.

- [ ] **Aufrufvertrag umsetzen.**
  `openspec-orphan-archive.sh --slugs <a,b,...> --out <dir> [--dry-run]`.
  - `--slugs` fehlt oder ist leer: Usage auf stderr, Exit 2.
  - `--out` Default: `${RUNNER_TEMP:-/tmp}/openspec-orphan-archive`; Verzeichnis anlegen,
    `archived.txt` und `failed.tsv` zu Beginn leeren (leere Dateien existieren immer).
  - `OPENSPEC_ROOT` wird respektiert (Default `<repo>/openspec`), damit die BATS-Fixtures greifen.
  - Exit 0, sobald der Lauf durchkam — auch wenn Slugs gescheitert sind. Fehlschlaege stehen in
    `failed.tsv`, nicht im Exit-Code, damit der Workflow Erfolge und Fehlschlaege getrennt behandelt.

- [ ] **Pro Slug archivieren, ohne Ermessens-Flags (design.md D4).**
  Schleife ueber die komma-getrennten Slugs:
  - Kein Verzeichnis `$OPENSPEC_ROOT/changes/<slug>/` (oder Slug `archive`): Zeile
    `<slug>\t-\tnot an open change` nach `failed.tsv`, weiter.
  - Ticket aus `changes/<slug>/.ticket` lesen (fehlt: `-`).
  - `--dry-run`: `would archive <slug> (<ticket>)` ausgeben, nichts schreiben, weiter.
  - Sonst `TICKET_OFFLINE=1 bash scripts/openspec.sh archive <slug>` mit gefangener Ausgabe.
    Das Skript uebergibt NIE `--allow-shrink`, `--create-new` oder `--no-merge`.
    - Exit 0: Slug nach `archived.txt`.
    - Exit != 0: `<slug>\t<ticket>\t<reason>` nach `failed.tsv`. `<reason>` ist die erste Zeile
      der Ausgabe, die mit `ERROR:` beginnt (Praefix entfernt), sonst die letzte nicht-leere Zeile;
      Tabs und Zeilenumbrueche darin durch Leerzeichen ersetzen.
  - Ein Fehlschlag bricht die Schleife nicht ab. Einen Rollback braucht es nicht: die Archiv-Guards
    laufen seit T002581 vor jedem Schreibzugriff („Archive guards run before any write to the SSOT").

- [ ] **Zusammenfassung ausgeben.** Am Ende `archived: <n>  failed: <m>` auf stdout.

- [ ] **Executor-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/orphan-archive.bats
# expected: 6/6 ok
```
