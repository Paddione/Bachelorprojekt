---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-01
---

# health-goals-update: Offene-Ziele-Report + Ticket-Vorschlag

## Kontext

`task health:goals:update` (`scripts/health-goals-update.sh`) schreibt frisch gemessene Werte in
die "Aktuell"-Spalte der Prio-C-Tabelle (Green Gates) in `.claude/lib/goals.md`. Nach PR #2415
kamen die neuen `G-AGENTIC03`–`G-AGENTIC17`-Ziele (Agent-/Skill-/MCP-/Command-Health) hinzu. Nach
einem Refresh gibt es aktuell keinen Überblick, welche Ziele ihr Target verfehlen (⚠) — der User
müsste die ganze Tabelle manuell durchscrollen, um zu entscheiden, welche Verletzungen ein Ticket
verdienen.

## Ziel

Nach dem Tabellen-Update druckt das Skript zusätzlich eine Übersicht aller Prio-C-Ziele mit
Marker `⚠` (Target verfehlt) — unabhängig davon, ob sich der Wert in diesem Lauf geändert hat —
und pro Ziel einen fertigen, copy-paste-fähigen `scripts/ticket.sh create ...`-Befehl. Die
Entscheidung, ob und wie ein Ticket angelegt wird, bleibt beim Menschen (kein automatisches
Anlegen, keine interaktiven Prompts).

## Nicht-Ziele

- Kein neues CLI-Flag (`--list-open` o.ä.) — der Report läuft immer mit, auch bei `--dry-run`.
- Keine automatische Ticket-Erstellung.
- Keine Änderung am bestehenden Tabellen-Update-Verhalten (Parsing, Marker-Logik, Exit-Codes).

## Design

### Datenquelle

Kein zusätzlicher Datei-Read. Der bestehende Python-Parse-Loop in `health-goals-update.sh`
iteriert bereits über jede Prio-C-Tabellenzeile (`row_re`-Match) und berechnet pro Zeile `ok`
(Vergleich `actual` vs. `target` über `cmp_op`) und `marker` (`"✓"` oder `"⚠"`). Diese Berechnung
läuft aktuell nur für Zeilen, deren Wert sich geändert hat (`old_val != actual` als Gate vor der
`ok`-Berechnung). Für den neuen Report wird die `ok`/`marker`-Berechnung auch für unveränderte
Zeilen durchgeführt (der `old_val == actual`-Continue-Zweig bleibt für die Tabellen-Schreib-Logik
bestehen, aber sammelt zusätzlich in eine neue Liste `open_goals`, falls `marker == "⚠"`).

`open_goals`-Einträge: `(gid, ziel_text, actual, target)` — `ziel_text` aus der `Ziel`-Spalte
(`m.group(2)`, getrimmt).

### Report-Format

Nach dem bestehenden Ausgabeblock (`Aktualisiert:` / `Keine Änderungen` / `Übersprungen` /
`Ausgeschlossen`) wird angehängt:

```
Offene Ziele (Target verfehlt):
  ⚠ G-AGENTIC17 — Command-Orphans via S4: 3 (Target: ≤ 0)
    scripts/ticket.sh create --type task --brand mentolder \
      --title "Health-Goal: G-AGENTIC17 — Command-Orphans via S4" \
      --description "Aktuell: 3, Target: <= 0. Siehe .claude/lib/goals.md#G-AGENTIC17" \
      --priority mittel
```

Sortierung: nach `gid` aufsteigend (deterministisch, konsistent mit der Tabellen-Sortierung in
`goals.md`).

Bei `open_goals == []`:
```
Offene Ziele (Target verfehlt): keine — alle Prio-C-Gates grün.
```

### Escaping

`ziel_text` kann Anführungszeichen/Backticks enthalten (z. B. Ziel-Namen mit Pfaden). Vor dem
Einsetzen in `--title`/`--description` werden `"` → `\"` und `` ` `` → `` \` `` ersetzt, damit der
gedruckte Befehl direkt copy-paste-fähig in einer Bash-Shell ist. `cmp_op`-Symbole (`<=`, `>=`,
`==`) werden für die Description in ASCII (`<=`/`>=`/`==`) statt Unicode geschrieben, um
Encoding-Überraschungen beim Copy-Paste zu vermeiden.

### Kein neues Flag

Der Report läuft immer am Ende des Skripts, auch bei `--dry-run` (er liest nur, schreibt nichts,
verändert also kein Verhalten bzgl. `goals.md`). Kein Interaktions-Modus, kein `read -p` — das
Skript läuft non-interactive in Agent-/CI-Kontexten durch.

### Tests

Neue BATS-Datei `tests/spec/repo-health-goals.bats` (noch nicht vorhanden — anlegen nach dem
`tests/spec/software-factory.bats`-Vorlage-Muster), Fälle:

1. Fixture-`goals.md` mit einer ⚠-Zeile → Report enthält die Zeile + einen `ticket.sh create`-Befehl
   mit korrektem `--title`/`--description`.
2. Fixture-`goals.md` ohne ⚠-Zeile → Report zeigt die Leer-Meldung, kein `ticket.sh create`-Aufruf
   im Output.
3. Generierter Befehl ist syntaktisch valide (`bash -n <(echo "$cmd")` oder äquivalente
   Flag-Zählung: `--type`, `--title`, `--description`, `--priority` je genau einmal vorhanden).
4. Report erscheint identisch bei `--dry-run` (kein Unterschied zum Normal-Lauf bzgl. des
   Report-Blocks).

## Betroffene Datei

- `scripts/health-goals-update.sh` (Python-Heredoc-Block erweitern)
- `tests/spec/repo-health-goals.bats` (neu)
