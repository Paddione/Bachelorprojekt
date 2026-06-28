# Proposal: g-spec03-proposal-tickets

_Ticket: T001301_

## Why

12 der 28 nicht-archivierten OpenSpec-Changes haben keine `.ticket`-Datei. Diese Datei enthält die externe Ticket-ID (z.B. `T000991`) und ist der einzige maschinell lesbare Rückverfolgbarkeitspfad zwischen Change-Verzeichnis und Ticketsystem. Ohne sie kann `openspec.sh` den Change-Status nicht automatisch auf `plan_staged` ziehen, das Factory-Dispatch-System kann keinen Claim prüfen, und `scripts/plan-context.sh` findet keinen Ticket-Anker für die Kontexterzeugung beim Agent-Inject. Kurz: ein Change ohne `.ticket` ist ein toter Ast im Traceability-Graphen.

Die Ursache ist historisch: `.ticket` wurde erst nach dem Anlegen vieler Changes als Pflichtfeld eingeführt. Die Datei-Inhalte sind in den meisten Fällen bereits in `proposal.md` oder `tasks.md` als `ticket_id:`-Frontmatter-Feld vorhanden — sie müssen nur als `.ticket`-Datei materialisiert werden.

## What

Für die elf Changes mit nachweisbarem Ticket-Bezug wird je eine `.ticket`-Datei mit der bekannten Ticket-ID als einzigem Inhalt angelegt:

| Change-Slug | Ticket-ID | Quelle |
|---|---|---|
| `agent-push-notifications` | T000991 | `proposal.md` Zeile 2 |
| `ai-ticket-auto-triage` | T000992 | `tasks.md` Frontmatter |
| `bats-coverage-batch1` | T001117 | `tasks.md` Frontmatter |
| `cockpit-bulk-status` | T000989 | `proposal.md` Frontmatter |
| `cockpit-filter-presets` | T000988 | `proposal.md` Frontmatter |
| `cockpit-mobile-view` | T000987 | `proposal.md` Frontmatter |
| `dev-flow-chore-ticket-ops-mishaps` | T001210 | `tasks.md` Frontmatter |
| `mentolder-react-rebuild` | T001026 | `proposal.md` Zeile 3 |
| `openspec-ssot-quality` | T001266 | `tasks.md` Frontmatter |
| `s1-violations-batch1` | T001108 | `tasks.md` Frontmatter |
| `ticket-mcp-go` | T001043 | `proposal.md` Titel |

Das Verzeichnis `openspec/changes/g-dep01-npm-vuln/` enthält nur ein leeres `specs/`-Verzeichnis — kein `proposal.md`, kein `tasks.md`, kein echter Plan. Die eigentliche Arbeit ist bereits unter `openspec/changes/archive/2026-06-28-g-dep01-npm-vuln/` archiviert. Das verbleibende Skelett wird gelöscht.

## Impact

Neue Dateien: 11 `.ticket`-Dateien in den jeweiligen Change-Verzeichnissen.
Gelöschte Dateien: `openspec/changes/g-dep01-npm-vuln/specs/g-dep01-npm-vuln.md` und das leere Skelett-Verzeichnis.
Keine Änderungen an Kubernetes-Manifesten, CI-Workflows oder Website-Code.
Risiko: keines — `.ticket` ist eine reine Metadatendatei ohne Laufzeitwirkung.
Out-of-Scope: inhaltliche Überarbeitung der Changes, Statuswechsel, Archivierungsentscheidungen für andere Changes.
