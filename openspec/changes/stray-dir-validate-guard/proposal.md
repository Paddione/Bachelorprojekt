# Proposal: stray-dir-validate-guard

## Why

Das leere, ungetrackte Verzeichnis `openspec/changes/--help/` (entstanden 2026-08-23 ~17:43)
brachte `bash scripts/openspec.sh validate` fail-closed für ALLE Changes zum Scheitern
(`rc=1`, „FAIL: --help missing specs/ delta dir") — der Gate war einen Tag lokal rot, ohne dass
eine Session es bemerkte (Incident T015759). `bash -x` zeigte `base=--help` als erstes
Glob-Match in `cmd_validate`. Die Herkunft des Verzeichnisses ist ungeklärt; ein
arg-parsing-Pfad, der bei `--help`-Aufrufen ein Verzeichnis erzeugt, existiert möglicherweise
weiter und kann es re-erzeugen.

## What

Zwei unabhängige Härtungen an `scripts/openspec.sh`:

1. **Validate-Guard:** `cmd_validate` überspringt komplett leere Verzeichnisse unter `changes/`
   mit einer Warnung (`WARN: skipping empty stray dir: <base>`) statt fail-closed zu greifen.
   Ein leeres Verzeichnis trägt keinen Plan-Inhalt; sein Fehlschlag maskierte einen Tag lang
   echte Gate-Signale. Alle nicht-leeren Verzeichnisse bleiben voll unter den bestehenden
   Checks (specs/-Pflicht, .ticket-Pflicht, Delta-Validierung).
2. **Slug-Frühcheck in propose:** Slugs mit führendem `-` werden vor jeder Dateisystem-Aktion
   abgelehnt (`die "slug must not start with '-'"`) — optionen-artige Tokens können sich so
   nie als Verzeichnis materialisieren. Der bestehende `--help`-Frühcheck aus T002908 bleibt
   unverändert davor.

Nicht im Scope: Jagd nach dem konkreten Erzeuger-Kommando (laut Incident ungeklärt) — die
beiden Guards machen das Symptom sowohl beim Re-Erzeugen als auch beim Wieder-Verschwinden
harmlos bzw. sichtbar.

## Root Cause (Symptom/Ursache getrennt)

- **Beobachtet (Fakt):** `validate` rc=1 auf leerem Dir; `base=--help` als Glob-Match.
- **Hypothese (unverifiziert):** ein unbekannter Pfad erzeugt `changes/--help/` bei
  `--help`-Argumenten. Der Slug-Guard verhindert ihn für `openspec.sh`-eigene Pfade;
  fremde Erzeuger landen künftig im Validate-Warnpfad statt im Repo-weiten Rot.

_Ticket: T015759_
