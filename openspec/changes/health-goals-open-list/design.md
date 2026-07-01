## Context

`scripts/health-goals-update.sh` parst die Prio-C-Tabelle in `.claude/lib/goals.md` per Python-
Heredoc (`row_re`) und schreibt frisch gemessene Werte zurück. Der Marker (`✓`/`⚠`) wird pro Zeile
bereits berechnet, aber nur für Zeilen ausgewertet, deren Wert sich im aktuellen Lauf geändert hat
(`if old_val == actual: continue`). Volle Spec: siehe
`docs/superpowers/specs/2026-07-01-health-goals-open-list-design.md`.

## Goals / Non-Goals

**Goals:**
- Nach jedem Refresh sichtbar machen, welche Prio-C-Ziele ihr Target verfehlen — auch wenn sie
  in diesem Lauf unverändert ⚠ geblieben sind.
- Pro offenem Ziel einen direkt copy-paste-fähigen `scripts/ticket.sh create ...`-Befehl liefern.

**Non-Goals:**
- Kein neues CLI-Flag, kein `--list-open`-Schalter — der Report läuft immer mit.
- Keine automatische Ticket-Erstellung oder interaktive Prompts.
- Keine Änderung an `health-goals-check.sh` (Mess-Logik) oder am Tabellen-Schreibformat.

## Decisions

- **Marker-Berechnung entkoppeln vom "geändert"-Gate:** Der bestehende `old_val == actual`-Continue
  bleibt für die Tabellen-Schreib-Logik bestehen (verhindert unnötige Diffs), aber vor diesem
  Continue wird jetzt zusätzlich `ok`/`marker` für JEDE Zeile berechnet und bei `marker == "⚠"` in
  eine neue Liste `open_goals` gesammelt — unabhängig vom Änderungsstatus. Alternative verworfen:
  zweiter Parse-Durchlauf nur für den Report — unnötige Redundanz, gleiche Regex zweimal pflegen.
- **Sortierung nach `gid`:** deterministisch, konsistent mit der Zeilen-Reihenfolge in `goals.md`.
- **Escaping von `"`/`` ` `` in Ziel-Text:** macht den gedruckten `ticket.sh create`-Befehl direkt
  in einer Bash-Shell ausführbar, ohne dass Sonderzeichen im Ziel-Namen die Quotes brechen.
- **`cmp_op`-Symbole in ASCII (`<=`/`>=`/`==`) für die Description:** vermeidet
  Encoding-Überraschungen beim Copy-Paste aus dem Terminal in eine andere Shell/Editor.
- **Immer aktiv, kein Flag:** Der Report ist ein reiner zusätzlicher stdout-Block; er ändert
  weder Exit-Code noch Schreibverhalten, daher ist ein Opt-in-Flag unnötiger Overhead.

## Risks / Trade-offs

- [Risk] Ziel-Text (`Ziel`-Spalte) enthält unerwartete Zeichen, die das Escaping nicht abdeckt
  (z. B. `$`-Interpolation in Bash) → Mitigation: Escaping-Test in `tests/spec/repo-health-goals.bats`
  deckt `"` und `` ` `` ab; `$` kommt in bisherigen Ziel-Namen nicht vor (grep-verifiziert gegen
  aktuelle `goals.md`), daher kein Blocker für diesen Change — bei künftigem Auftreten nachziehen.
- [Trade-off] Der Report läuft immer mit (kein Flag) → bei sehr vielen offenen Zielen wird der
  stdout-Output länger. Akzeptiert, da `task health:goals:update` ohnehin ein manuell getriggerter,
  nicht CI-gebundener Befehl ist.

## Migration Plan

Kein Migrationsschritt nötig — reine Erweiterung eines bestehenden, manuell aufgerufenen Skripts.
Kein Rollback-Bedarf über `git revert` hinaus.
