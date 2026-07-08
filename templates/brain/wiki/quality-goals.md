---
type: decision
tags: [quality, goals, meta]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Quality Goals — G-BRAIN01 bis G-BRAIN11

Verbindliche Qualitätsziele für Struktur und Organisation dieses Wikis.
Baseline gemessen am 2026-07-03 (Seed-Zustand: 2 Wiki-Seiten, leeres raw/).
Klassen: **Gate** = maschinell erzwungen (Linter/CI), **Target** = dokumentiert
gemessen, bewusst ohne Enforcement.

| ID | Ziel | Klasse | Baseline (2026-07-03) | Target |
|---|---|---|---|---|
| G-BRAIN01 | Wikilink-Lint versteht alle drei Formen (plain, Alias, Anker); 0 tote Links | Gate | Alias/Anker ungeprüft | alle 3 Formen geprüft, 0 tote Links |
| G-BRAIN02 | `tags` nicht-leer auf jeder Frontmatter-pflichtigen Seite | Gate | `tags: []` passierte den Lint | leere tags werden abgewiesen |
| G-BRAIN03 | Frontmatter-Lint scoped auf `wiki/` + Hubs; `raw/` und `README.md` exempt | Gate | Lint lief über alle `*.md` inkl. `raw/` | korrekt gescoped |
| G-BRAIN04 | Beide Linter melden ALLE Verstöße (Datei + Feld/Link) und brechen nie stumm ab | Gate | Crash ohne Diagnose bei ungültigem Enum | vollständige Fehlerliste, Exit ungleich 0 erst am Ende |
| G-BRAIN05 | Site-Build/Publikation nur nach grünem Lint | Gate | Build entkoppelt vom Lint | Lint-Job als `needs`-Voraussetzung |
| G-BRAIN06 | `raw/` erscheint nicht im publizierten Site-Content | Gate | `raw/` wurde mitpubliziert | aus dem Content-Staging entfernt |
| G-BRAIN07 | 0 Orphan-Seiten: jede `wiki/`-Seite ist von mindestens einer anderen Seite verlinkt | Target | 0 Orphans (unbewacht) | 0 Orphans, regelmäßig gemessen |
| G-BRAIN08 | Jede `wiki/`-Seite ist über maximal 2 MOC-Hops von `index.md` erreichbar | Target | erfüllt (trivial bei 2 Seiten) | weiterhin max. 2 Hops |
| G-BRAIN09 | 1 `log.md`-Eintrag pro inhaltlichem Commit auf main | Target | 1 Eintrag / 2 Commits (50 %) | 100 % |
| G-BRAIN10 | Keine `raw/`-Datei älter als 14 Tage (Backlog-Frische) | Target | raw/ leer | gemessen ab Erst-Ingest |
| G-BRAIN11 | Jede Hauptrepo-Spec (`openspec/specs/*.md`) hat eine Brain-Seite mit `source::`-Rückverweis | Target | 0/24 | 24/24 |

## Gates (G-BRAIN01–06)

Die sechs Gates werden maschinell erzwungen: `scripts/lint-wikilinks.sh` und
`scripts/lint-frontmatter.sh` laufen in der CI auf jeden Push/PR; der
Site-Build startet nur nach grünem Lint-Job und staged `raw/` nicht auf die
publizierte Quartz-Site. Fehlermeldungen und Fixes: [[first-aid]].

## Targets (G-BRAIN07–11) — Mess-Kommandos

Jedes Kommando läuft offline im Repo-Root.

### G-BRAIN07 — Orphans

```bash
for p in wiki/*.md; do s="$(basename "$p" .md)"; grep -rl --include='*.md' -e "\[\[$s" . | grep -v "wiki/$s.md" | grep -q . || echo "ORPHAN: $s"; done
```

Ziel: keine `ORPHAN:`-Zeile.

### G-BRAIN08 — MOC-Hops

```bash
links() { grep -oE '\[{2}[A-Za-z0-9._-]+' "$1" 2>/dev/null | tr -d '[' ; }
l1="$(links index.md)"; l2="$(for s in $l1; do f="$(find . -name "$s.md" | head -n1)"; [ -n "$f" ] && links "$f"; done)"
for p in wiki/*.md; do s="$(basename "$p" .md)"; printf '%s\n' $l1 $l2 | grep -qx "$s" || echo "TIEFER-ALS-2-HOPS: $s"; done
```

Ziel: keine `TIEFER-ALS-2-HOPS:`-Zeile.

### G-BRAIN09 — Journal-Disziplin

```bash
c="$(git log --oneline --no-merges -- wiki raw index.md SCHEMA.md | wc -l)"; e="$(grep -c '^- 20' log.md)"; echo "log-Eintraege: $e / Content-Commits: $c (Ziel: e >= c)"
```

### G-BRAIN10 — raw/-Backlog-Frische

```bash
find raw -name '*.md' -type f -mtime +14 -print | grep . && echo 'BACKLOG UEBERALTERT' || echo 'raw-Backlog OK'
```

### G-BRAIN11 — OpenSpec-SSOT-Abdeckung

```bash
n="$(grep -rlE '^source:: .*openspec/specs/' wiki | wc -l)"; echo "SSOT-Seiten: $n / 24 (Nenner: Specs im Hauptrepo, Stand 2026-07-03)"
```

Erfüllung via künftigen Ingest (Worklist-Gruppe `ssot-specs` im Hauptrepo);
siehe [[llm-workflows]] für den Sync-Prompt.

## Beförderungs-Regel Target → Gate

Ein Target wird zum Gate befördert, sobald sein Mess-Kommando über ca. 4 Wochen
stabil das Ziel hält: Kommando als `scripts/`-Check portieren, als CI-Step
registrieren, Tabellenzeile hier auf Klasse Gate umstellen. Entscheidung und
Datum gehören als Eintrag in [[log]].

Siehe auch: [[usage]], [[cheatsheet]], [[SCHEMA]].
