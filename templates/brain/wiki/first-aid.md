---
type: runbook
tags: [troubleshooting, ci]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# First Aid — CI ist rot

## 1 · Welcher Check ist rot?

**Wikilink-Lint** — Meldung: `FAIL: <datei> dead wikilink: [[<slug>]]`
- Tippfehler im Slug? Zielseite umbenannt oder nie angelegt?
- Achtung: auch Links in Code-Fences werden geprüft. Beispiel-Links auf echte
  Seiten zeigen lassen oder Platzhalter als `[[<slug>]]` mit spitzen Klammern
  schreiben ([[cheatsheet]]).

**Frontmatter-Lint** — Meldungen:
- `missing required frontmatter field: <feld>` — `type`/`tags`/`status` ergänzen.
- `invalid type: <wert>` bzw. `invalid status: <wert>` — nur kleingeschriebene
  Enum-Werte sind gültig (`Note` ist ungültig, `note` nicht).
- `tags must be a non-empty list` — mindestens ein Tag setzen.
- Scope: `wiki/` plus `index.md`, `log.md`, `SCHEMA.md`. `raw/` und `README.md`
  sind ausgenommen — eine Meldung auf diese Pfade wäre ein Linter-Bug.

**Secret-Scan (gitleaks)** — Fund entfernen, Wert rotieren, nur noch als
Verweis notieren (nie Klartext, siehe [[SCHEMA]]).

## 2 · Lint lokal reproduzieren

```bash
bash scripts/lint-frontmatter.sh .
bash scripts/lint-wikilinks.sh .
```

Beide Linter listen ALLE Verstöße (G-BRAIN04) — die Ausgabe ist die
vollständige Fix-Liste, kein iteratives Raten nötig.

## 3 · Site-Build rot?

Der Build läuft erst nach grünem Lint-Job (G-BRAIN05). Lokal testen:

```bash
mkdir -p /tmp/build/content
cp -R index.md log.md SCHEMA.md wiki /tmp/build/content/
cp site.Dockerfile /tmp/build/Dockerfile
docker build -t brain-site-test /tmp/build
```

`raw/` gehört nicht ins Staging (G-BRAIN06) — die publizierte Quartz-Site
enthält nur gelintete Inhalte.

Ziele und Mess-Kommandos: [[quality-goals]] · How-to: [[usage]].
