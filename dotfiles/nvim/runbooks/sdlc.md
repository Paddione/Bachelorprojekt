---
page: sdlc
ticket: T901049
status: complete
actions:
  - ticket-show
  - ticket-search
  - claims-list
  - messages-read
  - plan-lint
  - ci-gates
  - cfr-show
---

## Voraussetzungen

- Ticket-CLIs verfuegbar (`scripts/ticket.sh get/list`,
  `scripts/agent-lock.sh mine`, `scripts/agent-msg.sh read --unread`).
- `task --list` enthaelt `test:changed`, `freshness:check`,
  `freshness:regenerate`.

## Geordnete Schritte

1. **ticket-show**: Ticket-ID eingeben — Ticket anzeigen (lesend).
2. **ticket-search**: Suchbegriff eingeben — Tickets suchen (lesend).
3. **claims-list**: Eigene Locks anzeigen (`agent-lock.sh mine`, lesend).
4. **messages-read**: Ungelesene Agent-Nachrichten lesen (lesend).
5. **plan-lint**: Plan-Datei eingeben — Plan linten (lokal pruefend).
6. **ci-gates**: CI-Gate-Trio lokal fahren
   (`task test:changed && task freshness:check && task workspace:validate`).
7. **cfr-show**: Change-Fail-Rate anzeigen (`vda.sh cfr`, lesend).

Mutierend ist hier nichts: kein `stage-plan`, kein `release-hold`, kein
Statuswechsel aus dem Editor — solche Schritte hoechstens als kopierbares
Kommando, z.B. `bash scripts/ticket.sh stage-plan --id T...`.

## Erwartetes Ergebnis

Sieben Aktionen, alle lesend oder lokal pruefend; keine Aktion veraendert
Ticket-Status, Locks oder Plaene.

## Troubleshooting

- **CLI fehlt**: im Repo-Root arbeiten (Skripte sind relativ).
- **plan-lint meckert**: Plan-Pfad aus der Ticket-DB nehmen
  (`FACTORY-PLAN-REF`), nicht raten.

## Recovery

Keine: keine Aktion mutiert.
