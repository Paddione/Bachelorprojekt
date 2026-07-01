---
title: "G-SEC05: Messfehler health-goals-check.sh filtert nur eine von zwei Bot-Mail-Varianten"
ticket_id: T001358
domains:
  - quality
status: completed
---

## File Structure

- `scripts/health-goals-check.sh` — G-SEC05-Zeile: `grep -v` muss beide Bot-Mail-Varianten ausschließen
- `tests/bats/health-goals.bats` — Testfall für die korrekte Filterung (optional, falls BATS-Struktur existiert)
- `scripts/health-goals-check.sh` (Test-Mode) — Prüfung des gefilterten Ergebnisses

## Tasks

### 1. Fix Filterlogik in health-goals-check.sh

`scripts/health-goals-check.sh:116` filtert nur `41898282+github-actions\[bot\]@users.noreply.github.com` heraus, aber nicht die zweite Variante `github-actions[bot]@users.noreply.github.com` (ohne den numerischen Präfix). Erweitere den `grep -v`-Ausdruck, sodass **beide** Adressen gefiltert werden:

```
grep -vE '(41898282\+)?github-actions\[bot\]@users\.noreply\.github\.com'
```

Die `?`-Gruppe macht den `41898282+`-Präfix optional, ohne den Rest zu duplizieren. Der gesamte Ausdruck muss escaped korrekt im Bash-Kontext bleiben.

### 2. Test schreiben (BATS)

Falls noch kein Test für G-SEC05 existiert: erzeuge einen BATS-Test in `tests/bats/health-goals.bats`, der eine simulierte `git log`-Ausgabe mit beiden Bot-Mail-Varianten durch den Filter jagt und sicherstellt, dass keine von beiden als unsigniert zählt. Struktur:

- `setup` legt eine temporäre `main`-Reference mit Test-Commits an
- Test "G-SEC05 filtert beide Bot-Mail-Varianten" läuft `row target G-SEC05 …` und erwartet 0

### 3. Verifikation und Freshness-Gate

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Prüft, dass alle Tests grün sind und alle generierten Artefakte aktuell eingecheckt werden.
