# Proposal: ticket-sh-subcommand-help

## Why

Die Kommando-Ebene von `scripts/ticket.sh` ist auffindbar, die Options-Ebene nicht. Verifiziert
am 2026-08-10 auf `origin/main`:

```bash
bash scripts/ticket.sh create --help   # -> "Unknown create option: --help", Exit 2
bash scripts/ticket.sh update-status -h # -> "Unknown update-status option: -h", Exit 2
bash scripts/ticket.sh help            # -> "Unknown command: help", Exit 1
bash scripts/ticket.sh --help          # -> "Unknown command: --help", Exit 1
bash scripts/ticket.sh                 # -> Usage + vollstaendige Kommandoliste, Exit 1
```

Ursache: Jedes Subkommando wertet seine Argumente in einer `while`-Schleife mit einem
`*)`-Zweig aus, der jede nicht erkannte Option zurueckweist (`scripts/vda/ticket/create.sh:25`,
`scripts/ticket.sh:153` u. a.). `--help` faellt in genau diesen Zweig. Auf oberster Ebene gibt
es kein `help`-Kommando: der Usage-Block in `scripts/ticket.sh:1025` greift nur bei `$# -lt 1`,
und `--help` landet im `*)`-Zweig des Dispatchers (`scripts/ticket.sh:1074`).

Das trifft den in CLAUDE.md genannten kanonischen Weg der Bug-Triage-Konvention G-DORA03:
`bash scripts/ticket.sh create --type bug --title "..."` ist unvollstaendig — `--description`
ist Pflicht (`scripts/vda/ticket/create.sh:28`), fehlt im Beispiel aber. Wer die Pflichtfelder
ueber das Skript erfragen will, findet keinen Weg dorthin; der beobachtete Umweg ging ueber das
MCP-Toolschema.

T002697 hat bereits einen Teil dieses Gelaendes bearbeitet: unbekannte Argumente nennen seitdem
den Weg zur erwarteten Form ("Aufruf ohne Argumente zeigt die erwarteten Flags"). Der Hinweis
deckt das *versehentlich falsche* Argument ab, nicht die *absichtliche* Hilfe-Anfrage — und er
fehlt in `scripts/vda/ticket/create.sh` ganz. Guard dazu:
`tests/spec/software-factory/ticket-usage-hints.bats`.

## What

1. `--help`/`-h` in jedem Subkommando **vor** der Options-Schleife abfangen und die Optionen des
   Subkommandos ausgeben, Pflichtfelder markiert, Exit 0. Muster: `scripts/worktree-create.sh`
   faengt `--help` vor allen Guards ab (T002783).
2. `help`, `--help` und `-h` auf oberster Ebene als Alias fuer den argumentlosen Usage-Ausgang
   akzeptieren, aber mit Exit 0 (eine erfuellte Anfrage ist kein Fehler).
3. Das CLAUDE.md-Beispiel der Bug-Triage-Konvention um `--description` ergaenzen, damit die dort
   genannte Zeile ausfuehrbar ist.
4. Unbekannte Optionen bleiben unveraendert ein Fehler mit Exit ungleich 0.

Nicht im Umfang: eine Umstellung der Argument-Auswertung auf `getopts` oder eine Vereinheitlichung
der 20+ Options-Schleifen. Der Fix setzt vor den bestehenden Schleifen an und laesst sie intakt.

_Ticket: T002843_
