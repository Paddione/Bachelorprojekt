## ADDED Requirements

### Requirement: Plan-Frontmatter wird im Archiv-Arbeitsbaum auf completed gesetzt

The post-merge finalizer SHALL apply the `status: completed` frontmatter transition to the
plan file copy that the archive commit is built from: inside the archive section, after the
`git checkout -B "$ARCHIVE_BRANCH" origin/main` branch switch and before
`openspec.sh archive`. The pre-archive working tree SHALL NOT retain an uncommitted
frontmatter change produced by the plan-archive step. The Postgres persistence via
`ticket.sh archive-plan` SHALL observe the same post-transition file state as the archive
commit, so both consumers read `status: completed`. Existing skip, resume and idempotency
semantics of the archive section (T015783) SHALL be preserved.

#### Scenario: Archiv-Commit trägt completed

- **GIVEN** ein gemergter Fix-PR mit Plan-Frontmatter `status: active`
- **WHEN** `scripts/devflow-post-merge-finalize.sh <ticket-id>` die Archiv-Sektion ausführt
- **THEN** wird der Frontmatter-Wechsel auf dem Archiv-Branch angewendet (nach dem `git checkout -B`, vor `openspec.sh archive`)
- **AND** der archivierte `tasks.md`-Snapshot unter `openspec/changes/archive/` trägt `status: completed`

#### Scenario: Kein Streu-Diff im Haupt-Checkout

- **GIVEN** der Finalizer hat die Archiv-Sektion abgeschlossen
- **WHEN** der Haupt-Checkout anschließend einen `git pull --ff-only` ausführt
- **THEN** blockiert keine uncommittete Frontmatter-Änderung an `openspec/changes/<slug>/tasks.md` den Pull

#### Scenario: DB-Kopie und Archiv-Snapshot sind konsistent

- **GIVEN** die verschobene Reihenfolge (Frontmatter-Wechsel vor Persistierung)
- **WHEN** `ticket.sh archive-plan` den Plan nach `tickets.ticket_plans` persistiert
- **THEN** liest es die Datei im Zustand `status: completed`
- **AND** die bestehenden Guards des Schritts (PLAN_FILE-Leerprüfung, Branch-Commit-Fallback, Fehlpfade) bleiben unverändert wirksam

#### Scenario: Idempotente Wiederholung bleibt erhalten

- **GIVEN** ein Wiederholungslauf, bei dem Schritt 8 als „bereits archiviert“ überspringen würde oder ein Resume (`half`, T015783) erkannt wird
- **WHEN** der Finalizer erneut läuft
- **THEN** ändern die Skip-/Resume-Pfade ihr Verhalten nicht
- **AND** eine nicht mehr existierende `$PLAN_FILE` führt zu keinem Fehler durch den Frontmatter-Wechsel

#### Scenario: DB-freier Testeinstieg

- **GIVEN** das Skript stellt die Frontmatter-Transition als DB-freies Unterkommando bereit (Präzedenz: `--archive-state`, T015783)
- **WHEN** ein BATS-Test das Unterkommando gegen eine Fixture-Datei mit `status: active` aufruft
- **THEN** endet es mit Exit 0 und der Datei im Zustand `status: completed`
- **AND** bereits `completed` Dateien bleiben unverändert und Werte außerhalb der Transition-Regex werden nicht angetastet
