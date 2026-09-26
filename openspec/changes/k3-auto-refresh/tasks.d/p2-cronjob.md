---
title: "k3-auto-refresh p2-cronjob — Implementation Plan"
ticket_id: T900450
domains: [brain, mcp]
status: active
---

# k3-auto-refresh (p2-cronjob) — Implementation Plan

_Ticket: T900450 · Partial p2 von k3-auto-refresh · Scope: Cron-Job +
Docs-Refresh. Hängt von p1 ab (Single-Flight-Wrapper-Vertrag aus dessen
Schnittstellenvertrag-Sektion — wird hier konsumiert, nicht geändert).
Wrapper + Runbook + Taskfile (p1) und Guard (p-tests, inkl.
STRUCT2-Failing-Test-Step) sind eigene Partials und werden hier nicht
angefasst. Design-Entscheidungen E1/E3/E4/E7, Risiken R1–R3 aus
`design.md`._

_Messlage: `bash scripts/plan-intel-filter.sh k3-auto-refresh …` meldet
`intel.json not found` — Intel unten stammt aus grep-Fallback (kein
`index_status`/`detect_changes`-Aufruf in Automation vorhanden) und aus
direkter CLI-Inspektion (`codebase-memory-mcp cli index_status --help`
bzw. `detect_changes --help`: beide nehmen `--project` als Pflicht-Flag).
`plan-lint.sh residual_budget` liefert für beide Zieldateien leer._

## File Structure

| Datei | Ist | Wirksame S1-Schwelle | Geplant |
| `scripts/cbm-refresh-cron.sh` | 0 (neu) | `.sh`-Limit 800 aus `gates.yaml`, nicht-baselined | ca. 120 Zeilen inkl. Header |
| `docs/brain/k3-code-graph.md` | 191 (`wc -l`), `jq` → `nicht-baselined` | S1 n.a.: kein `.md`-Eintrag in `s1.limits`, `residual_budget` leer | Fakten-Update, Diagramm unverändert |

`scripts/cbm-refresh-cron.sh` startet bei Ist 0 gegen die Schwelle 800,
also mit Budget 800 — ca. 120 Zeilen geplant, Restreserve bleibt groß.
`docs/code-quality/baseline.json` hält 5 Keys, keiner betrifft diese
Dateien — es werden keine Baseline-Einträge hinzugefügt. S4: Das neue
Skript ist referenziert von `design.md`, dem Runbook
`docs/runbooks/cbm-index-stampede.md` (p1) und diesem Plan; der
Cron-Eintrag steht dokumentiert im Skript-Header.

## Task 1 — Vermessungs-Gate: fast-refresh-Dauer auf dieser Box (E3/R1)

Läuft als Erstes zur Implementierungszeit, NACH p1 (der Wrapper muss
existieren — gemessen wird der echte Serialisierungs-Pfad, kein direkter
MCP-Aufruf). Drei Läufe über das p1-verdrahtete Target, p50 ist der
Median (mittlerer Wert nach Sortierung):

```bash
for i in 1 2 3; do start=$(date +%s); task codebase:refresh; rc=$?; end=$(date +%s); echo "run-$i rc=$rc duration_s=$((end-start)) (erwartet rc=0)"; done
```

Jeder Lauf meldet `rc=0`. Die drei `duration_s`-Werte sortieren, p50
ablesen und im Implementierungs-Protokoll festhalten:

```bash
echo "p50=<median> (Akzeptanz: < 900)"
[ "$p50" -lt 900 ] && echo "GATE-PASS: hourly bleibt" || echo "GATE-FAIL: Fallback greift"
```

Akzeptanz (E3): p50 < 25 % des Hourly-Intervalls, also < 900 s.
Fail-closed-Fallback bei GATE-FAIL (wird dann ausgeführt, kein stilles
Akzeptieren): die Cron-Zeile im Skript-Header (Task 2) wird auf
`0 */4 * * *` (alle 4 Stunden) gesetzt, der gemessene p50 als Kommentar
in den Header geschrieben, und die Abweichung wird als Ticket-Kommentar
festgehalten, damit die Runbook-Referenz (p1-Datei) nachgezogen wird.

## Task 2 — Cron-Skript `scripts/cbm-refresh-cron.sh` anlegen

Neues Skript nach Hausstil (`set -euo pipefail`, Usage-Header mit
Cron-Eintrag, Muster nach `scripts/repo-hygiene-cron.sh`):

- Header dokumentiert den Cron-Eintrag (hourly Default per E3):
  `0 * * * * bash /home/patrick/Bachelorprojekt/scripts/cbm-refresh-cron.sh >> /tmp/cbm-refresh-cron.log 2>&1`
- `log()` schreibt `[cbm-refresh-cron] <UTC-ISO8601> …` auf stderr;
  stdout trägt ausschließlich die eine JSON-Metrik-Zeile.
- Konstanten: `PROJECT="${CBM_PROJECT:-home-patrick-Bachelorprojekt}"`,
  `ROOT` aus `git rev-parse --show-toplevel`,
  `HERE` aus dem Skript-Verzeichnis (Wrapper-Pfad relativ dazu).
- Pre-Gate skip-if-fresh (E4): `codebase-memory-mcp cli index_status
  --project "$PROJECT"` (~10 ms) liefert das Index-Alter als
  `last_refresh_age_s`; `codebase-memory-mcp cli detect_changes
  --project "$PROJECT"` (~1,4 s) meldet Drift. Ohne Drift: JSON
  `{"status":"fresh-skip","last_refresh_age_s":N,…}` auf stdout, Exit 0,
  kein Job-Start.
- Bei Drift: Refresh ausschließlich über den p1-Wrapper (eine
  JSON-Zeichenkette als einziges Argument, gleiche Form wie das
  Target `codebase:refresh`):
  `bash "$HERE/mcp/cbm-single-flight.sh" "{\"repo_path\": \"$ROOT\", \"mode\": \"fast\", \"persistence\": true}"`.
  Wrapper-Exit unverändert durchreichen (Exit 3 = Lock-Timeout per
  p1-Vertrag). Bei Erfolg JSON
  `{"status":"refreshed","duration_s":N,…}` auf stdout.
- Flag `--dry-run`: läuft nur das Pre-Gate und meldet auf stdout, was
  geschehen würde (`fresh-skip` oder `would-refresh`, mit
  `last_refresh_age_s`), ohne den Index zu verändern. Exit 0.

Prüfschritte (alle im Repo-Root des Worktrees):

```bash
bash -n scripts/cbm-refresh-cron.sh
echo "bash -n rc=$? (erwartet 0)"

bash scripts/cbm-refresh-cron.sh --dry-run | jq -e .status
echo "dry-run rc=$? (erwartet 0, Status fresh-skip oder would-refresh)"

grep -c 'cbm-single-flight.sh' scripts/cbm-refresh-cron.sh
grep -c 'fresh-skip' scripts/cbm-refresh-cron.sh
grep -c '0 \* \* \* \*' scripts/cbm-refresh-cron.sh
grep -v '^#' scripts/cbm-refresh-cron.sh | grep -c 'index_repository' || echo "direkte Aufrufe: 0 (erwartet)"

wc -l scripts/cbm-refresh-cron.sh
```

Die drei `grep -c`-Befehle melden je mindestens 1; der Direktaufruf-Check
meldet 0 (alles läuft über den Wrapper); `wc -l` bleibt deutlich unter
der Schwelle 800.

## Task 3 — `docs/brain/k3-code-graph.md` auf neuen Stand bringen

Fakten-Update des Stands von August 2026, Abschnitt `## Diagramm`
(Zeilen 1–51) bleibt Byte-identisch:

- `Speicher und Index`: Persistenz ist SQLite unter
  `~/.cache/codebase-memory-mcp/` (kein In-Memory-Verlust bei
  Neustart); Projekt `home-patrick-Bachelorprojekt` mit Stand aus
  `design.md` (97.506 Nodes / 228.997 Edges); Worktree-Projekt-Tabelle
  und Haupt-Repo-Warnung entfallen bzw. werden ersetzt.
- `Index-Triggert`: primärer Trigger ist der periodische Cron-Job
  `scripts/cbm-refresh-cron.sh` (hourly, skip-if-fresh); `index_status`
  (~10 ms, liefert Index-Alter) und `detect_changes` (~1,4 s, Drift)
  als Pre-Gate-Semantik; die `fehlt`-Zeilen für CI/Hook entfallen.
- `K1/K3-Verhältnis` und `Ist/Soll-Abgrenzung`: Trigger-Zeilen auf
  periodisch aktualisieren (K3-Spalte: Cron statt manuell).
- Kopf-Stand auf September 2026 setzen; `Änderungshistorie` um eine
  T900450-Zeile ergänzen. Keine Brand-Domain-Literale (S3).

Prüfschritte:

```bash
grep -c 'cbm-refresh-cron.sh' docs/brain/k3-code-graph.md
grep -c 'SQLite' docs/brain/k3-code-graph.md
grep -c 'home-patrick-Bachelorprojekt' docs/brain/k3-code-graph.md
grep -c 'in-memory' docs/brain/k3-code-graph.md
git diff -U0 docs/brain/k3-code-graph.md | grep '^@@' | sed 's/^@@ -\([0-9]*\).*/\1/' | awk '$1 < 52 {bad++} END {print (bad+0)" Diagramm-Hunks (erwartet 0)"}'
```

Die ersten drei Befehle melden je mindestens 1; `in-memory` meldet
genau 1 (nur noch im unveränderten Diagramm); kein Diff-Hunk beginnt
bei einer Zeile unter 52.

## Task 4 — Verifikation (STRUCT3) + Cron-Installation

Die drei Pflicht-Gates laufen lassen, alle drei müssen grün sein:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Cron-Installation: Das Eintragen in die Crontab ist ein manueller
Ops-Schritt zur Implementierungszeit (kein Skript schreibt die
Crontab selbst). Danach verifizieren:

```bash
crontab -l | grep -c 'cbm-refresh-cron'
echo "crontab rc=$? (erwartet 0, Zähler mindestens 1)"
```

Erwartet: `crontab -l` enthält die Header-Zeile aus Task 2 (hourly, oder
die 4h-Variante falls das Task-1-Gate den Fallback ausgelöst hat).
