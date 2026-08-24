## MODIFIED Requirements

### Requirement: Post-Merge-Finalisierung als idempotente Skript-Einheit

Das Skript `scripts/devflow-post-merge-finalize.sh <ticket-id>` SHALL existieren und die Abschluss-Schritte (PR-Link, Ticket-Status `done` mit korrekter Resolution, `verify:done`-Phase-Event, Plan-Archiv nach `tickets.ticket_plans`, OpenSpec-Archiv inklusive Archiv-PR, Lock-Release, Worktree-Remove, Branch-Delete) als eine deterministische, **idempotente** Einheit ausführen: Bereits erledigte Schritte (Ticket bereits `done`, Plan bereits archiviert, Lock bereits frei, Worktree bereits entfernt) SHALL erkannt und übersprungen werden. Das Skript SHALL einen klaren Exit-Code liefern (0 = alle Schritte erledigt/übersprungen, 1 = Fehler) und ohne Cluster-/DB-Zugriff für den Offline-Modus einen dokumentierten Fehlerpfad haben.

**Frontmatter-Garantie (T015916):** Der Wechsel des Plan-Frontmatters auf `status: completed` SHALL in derselben Arbeitsbaum-Sicht erfolgen, in der die Archivierung committet wird — also in der Archiv-Subshell NACH dem `git checkout -B "$ARCHIVE_BRANCH" origin/main` und VOR `openspec.sh archive` bzw. vor dem Resume-Commit. Der frühere Schritt-7-Sed gegen den Haupt-Checkout-Arbeitsbaum SHALL entfernt sein; der Haupt-Checkout bleibt nach einem Finalize-Lauf ohne uncommittete Frontmatter-Reste. Für die Verifikation SHALL ein DB-freier Einstieg `--frontmatter-state <slug> [--repo <dir>]` existieren (Prüfmodus-Muster wie `--archive-state`, T015783), der den Frontmatter-Zustand des Plans meldet (`completed` | `stale`), ohne Cluster-/DB-Zugriff.

| | Before | After |
|---|---|---|
| Frontmatter-Wechsel (Schritt 7/8) | Sed läuft vor der Archiv-Subshell im Haupt-Checkout-Arbeitsbaum — das Archiv erhält `status: active` (9 von 12 Fällen), der Haupt-Checkout behält eine uncommittete Änderung | Sed läuft in der Archiv-Subshell nach `checkout -B` auf dem Archiv-Branch — der Archiv-Commit enthält `status: completed`, der Haupt-Checkout bleibt sauber |
| Testbarkeit | Laufzeitpfad nur mit Ticket-DB prüfbar | DB-freier Einstieg `--frontmatter-state` meldet den Zustand per Kommando-Output |

#### Scenario: Frontmatter erreicht das Archiv als completed

- **GIVEN** ein gemergter Plan liegt mit `status: active` auf origin/main
- **WHEN** die Archiv-Subshell den Archiv-Branch erzeugt und archiviert
- **THEN** trägt die archivierte `tasks.md` unter `openspec/changes/archive/` den Wert `status: completed`
- **AND** der Haupt-Checkout hat nach dem Lauf keine uncommittete Änderung an der Plan-Datei

#### Scenario: Resume-Pfad setzt das Frontmatter am Archivziel

- **GIVEN** eine unterbrochene Archivierung (`ARCHIVE_RESUME=1`), die Verschiebung ist vollzogen aber uncommittet
- **WHEN** der Resume-Pfad committet
- **THEN** wurde das Frontmatter zuvor auf der verschobenen Datei gesetzt
- **AND** der Resume-Commit enthält `status: completed`

#### Scenario: Frontmatter-State ist DB-frei prüfbar

- **GIVEN** ein Change-Ordner mit `tasks.md` und `status: active`
- **WHEN** `devflow-post-merge-finalize.sh --frontmatter-state <slug> --repo <dir>` aufgerufen wird
- **THEN** meldet es `stale` mit Exit 0, ohne Cluster-/DB-Zugriff
- **AND** nach dem Fix meldet es für eine `completed`-Datei `completed`
