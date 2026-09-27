# Inventur — Messwerte (T900560)

Stand: `PRE=0425e2bc3` auf `origin/main`. Zählmethode je Zeile angegeben.

## Root

| Maß | Wert | Befehl |
|-----|------|--------|
| Einträge gesamt (Arbeits-Checkout) | 54 | `ls -1 \| wc -l` |
| Davon gitignoriert/lokal | 12 (`scratch/`, `website/`, `tmp/`, `.output/`, `node_modules/`, `skills.json`, `.mishaps.log`, `consideration.md`, `.gemini/`, `.vscode/`, `.lighthouseci/`, …) | `git check-ignore`, `git ls-files`-Abgleich |
| Tracked Root-Einträge | ~42 | `git ls-files \| grep -v /` + Top-Dirs |
| `Taskfile.yml` | 5.428 Zeilen / 259 KB | `wc -l`, `ls -lh` |
| `AGENTS.md` / `CLAUDE.md` | 21 KB / 10 KB, beide Realdateien | `ls -la` |

## OpenSpec-Korpus

| Maß | Wert | Befehl |
|-----|------|--------|
| Dateien in `openspec/` | 1.418 | Grep-Korpus, Anteil `openspec/` |
| Specs | 131 | `ls openspec/specs \| wc -l` |
| Archivierte Changes | 932 | Reaper-Check (`openspec-half-archive-check`) |
| Aktive Changes | **0** | `ls openspec/changes` → nur `archive/` |
| Dateien mit `openspec`-Referenz (gesamt) | 2.242 | `grep -rln openspec` (ohne `node_modules/`, `.git/`) |
| Davon außerhalb `openspec/` | ~800 (`tests/` 448, `docs/` 140, `scripts/` 86, `.opencode/` 58, `components/` 33, Rest klein) | gleiche Grep-Aufschlüsselung |

## Großkorpora (bleiben, Tangent-Nachweis)

| Maß | Wert |
|-----|------|
| `scripts/`-Dateien (tracked) | 910 |
| `tests/spec/*.bats` | 165 |
| `tests/unit`-Dateien | 291 |
| `docs/`-Dateien (tracked) | 439 in 38 Top-Einträgen |
| `.opencode/` / `.claude/`-Dateien | 424 / 77 |
| Skills (`.agents` / `.claude` / `.opencode`) | 56 / 54 / 56, per Symlink mergt (Shared Source) |
| `components/website/`-Dateien | 1.862 (Phase-1-Move vollständig, Root-`website/` leer) |

## Stale-Einzelbefunde

| Befund | Beleg |
|--------|-------|
| `environments/`-Brand-Assets ohne Live-Referenz | Grep nur generierte Indexe, History, `renovate.json5:54-55` |
| `claude-code/` (3 Dateien) ohne Konsument | `git ls-files` + Grep (nur Doku) |
| `openclaw/` = 1 Datei, 2 Refs | `git ls-files openclaw`; `Taskfile.openclaw.yml:11`, `Taskfile.yml:67` |
| `.openclaw/workspace-state.json` versioniert | `git ls-files .openclaw` |
| `.gitlab-ci.yml` lebt (Mirror) | `mirror-to-gitlab.yml` + 9 Build-Workflows mit Image-Refs |
| `prod-mentolder/`, `prod-korczewski/` verdrahtet | Refs in Taskfile, 8+ Skripten, `environments/` |

## Prior Art (gelesen, bindend wo entschieden)

- `docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md` — Phase-1-Design
  (Konsumenten-Gruppierung, Move-Matrix, atomare Commits, Risiko-Reihenfolge).
  Out-of-scope-Entscheidung vom 2026-08-15 wird für `openspec/` und
  `environments/`-Assets durch diesen Plan revidiert, sonst beibehalten.
- `openspec/specs/harness-workflow-split.md` (AGENTS.md-Routing-Abschnitt),
  `openspec/specs/ticket-system.md` (`stage-plan`-Fluss) — müssen in C7a auf die
  neue Welt umgehängt werden.
