---
title: "k3-auto-refresh p1-singleflight — Implementation Plan"
ticket_id: T900450
domains: [brain, mcp]
status: active
---

# k3-auto-refresh (p1-singleflight) — Implementation Plan

_Ticket: T900450 · Partial p1 von k3-auto-refresh · Scope: Single-Flight-Wrapper
+ Runbook + Taskfile-Anbindung. Cron-Job + Docs-Refresh (p2) und Guard
(p-tests, inkl. STRUCT2-Failing-Test-Step) sind eigene Partials und werden hier
nicht angefasst. Design-Entscheidungen E2/E5/E6, Risiken R2/R3 aus `design.md`;
Semantik wiederverwendet aus dem archivierten Change
`2026-09-17-cbm-index-single-flight` (kein Re-Design). AGENTS.md bleibt
unberührt — die Konvention lebt in Runbook + Taskfile._

_Messlage: `bash scripts/plan-intel-filter.sh k3-auto-refresh …` meldet
`intel.json not found` — Intel unten stammt aus grep-Fallback (Aufrufe von
`index_repository` in Automation: genau 2, beide in `Taskfile.yml`:1238/:1245)
und ist insoweit unvollständig. `plan-lint.sh residual_budget` liefert für
`Taskfile.yml` leer (ungated + unbaselined) und für den Wrapper leer (Datei
existiert noch nicht)._

## File Structure

| Datei | Ist | Wirksame S1-Schwelle | Geplant |
| `scripts/mcp/cbm-single-flight.sh` | 0 (neu, `scripts/mcp/` existiert noch nicht) | `.sh`-Limit 800 aus `gates.yaml`, nicht-baselined | ca. 60 Zeilen |
| `docs/runbooks/cbm-index-stampede.md` | 0 (neu) | S1 n.a.: kein `.md`-Eintrag in `s1.limits`, nicht-baselined | ca. 120 Zeilen |
| `Taskfile.yml` | 5503 (`wc -l`), `jq` → `nicht-baselined` | S1 n.a.: kein `.yml`-Eintrag in `s1.limits`, `residual_budget` leer | netto +0 (2 Zeilen ersetzt) |

`scripts/mcp/cbm-single-flight.sh` startet bei Ist 0 gegen die Schwelle 800,
also mit Budget 800. `docs/code-quality/baseline.json` hält 5 Keys, keiner
betrifft diese Dateien — es werden keine Baseline-Einträge hinzugefügt.
S4: Der Wrapper ist referenziert von `Taskfile.yml` (dieses Partial),
`scripts/cbm-refresh-cron.sh` (p2) und dem Runbook (dieses Partial).

## Schnittstellenvertrag für p2 (fix, hier gepinnt)

```text
scripts/mcp/cbm-single-flight.sh '<json-args>'
```

- Genau ein Positionsargument: JSON-String, unverändert durchgereicht an
  `codebase-memory-mcp cli index_repository`.
- Serialisierung per `flock` auf
  `$HOME/.cache/codebase-memory-mcp/cbm-index.lock`, blockierend wartend,
  Warteobergrenze 3000 s (per `CBMSF_TIMEOUT` in Sekunden überstimmbar).
- Timeout: Meldung auf stderr, Exit 3. Keine Argumente: Usage auf stderr,
  Exit 2. Sonst: Exit-Code des MCP-Aufrufs unverändert.

## Task 1 — Wrapper `scripts/mcp/cbm-single-flight.sh` anlegen

Neues Skript nach Hausstil (`set -euo pipefail`, Usage-Header mit
Beispielaufruf, Muster nach `scripts/repo-hygiene-cron.sh`):

- `LOCKDIR="$HOME/.cache/codebase-memory-mcp"`,
  `LOCKFILE="$LOCKDIR/cbm-index.lock`; `mkdir -p "$LOCKDIR"`; schlägt das
  fehl, Warnung auf stderr und Fallback-Lock
  `/tmp/cbm-index-$USER.lock` (Fail-safe: nie hart abbrechen).
- Argumentprüfung: genau 1 Argument, sonst Usage + Exit 2.
- Lock über Dateideskriptor, damit Timeout und MCP-Fehler sauber trennbar
  bleiben: `exec 9>"$LOCKFILE"`, dann `flock -w "${CBMSF_TIMEOUT:-3000}" 9`
  — bei Fehlschlag Meldung `[cbm-single-flight] lock timeout after …s` auf
  stderr und Exit 3.
- Danach `exec codebase-memory-mcp cli index_repository "$@"` (Exit-Code
  des MCP-Aufrufs wird dadurch unverändert durchgereicht).

Prüfschritte (alle im Repo-Root des Worktrees):

```bash
bash -n scripts/mcp/cbm-single-flight.sh
echo "bash -n rc=$? (erwartet 0)"

scripts/mcp/cbm-single-flight.sh
echo "ohne-args rc=$? (erwartet 2)"

mkdir -p "$HOME/.cache/codebase-memory-mcp"
flock -n "$HOME/.cache/codebase-memory-mcp/cbm-index.lock" sleep 10 &
HOLDER=$!
sleep 1
CBMSF_TIMEOUT=2 scripts/mcp/cbm-single-flight.sh '{"probe":true}' 2>/tmp/cbmsf-err.txt
echo "timeout-probe rc=$? (erwartet 3)"
grep -c 'timeout' /tmp/cbmsf-err.txt
wait $HOLDER
```

Die Timeout-Probe erreicht den MCP-Aufruf nie (Lock ist belegt), kostet also
keinen Index-Lauf. `grep -c` muss mindestens 1 melden.

## Task 2 — Runbook `docs/runbooks/cbm-index-stampede.md` anlegen

Neues Runbook nach T016447-Spec (Gliederung aus dem archivierten Change,
Stil nach `docs/runbooks/brain-ingest.md`: H1 `Runbook: …`, Soll-Zustand,
Abschnitte). Inhalt:

- Akut-Mitigation: Symptome (Load hoch, mehrere Index-Worker, hängende
  `freshness`-Läufe); zuerst `index_status` (~10 ms) und `detect_changes`
  (~1,4 s) prüfen statt blind zu reindizieren; nur EINE Session indiziert;
  STOP/TERM-Zyklen mit Load-Beobachtung (`uptime`, `ps` auf die Worker);
  Hinweis, dass getötete Worker durch den Parent respawnen und die Schleife
  nur über Serialisierung endet.
- Prävention: alle skriptgesteuerten `index_repository`-Aufrufe laufen über
  `scripts/mcp/cbm-single-flight.sh`; Graph-Lese-Tools sind stale-tolerant
  (lesen geht immer, schreiben nur über den Wrapper); periodischer Refresh
  mit skip-if-fresh übernimmt die Routine (`scripts/cbm-refresh-cron.sh`).
- Betriebliche Grenze: 4-Kern-Box — parallele indexierende Sessions auf eine
  begrenzen, Beobachtung vom 2026-08-24 (Load 54.5, 8 Worker) als Referenz.
- Referenzen: Wrapper-Pfad, `task codebase:index` / `task codebase:refresh`,
  Cron-Skript. Keine Brand-Domain-Literale (S3).

Prüfschritte:

```bash
grep -c 'index_status' docs/runbooks/cbm-index-stampede.md
grep -c 'detect_changes' docs/runbooks/cbm-index-stampede.md
grep -c 'cbm-single-flight.sh' docs/runbooks/cbm-index-stampede.md
grep -c 'codebase:index' docs/runbooks/cbm-index-stampede.md
```

Jeder der vier Befehle meldet mindestens 1.

## Task 3 — `Taskfile.yml`: `codebase:index` + `codebase:refresh` über den Wrapper

Nur diese zwei Targets anfassen (Zeilen 1233–1245), Rest der Datei bleibt
Byte-identisch. Ersetze in beiden Targets die direkte Zeile

```bash
codebase-memory-mcp cli index_repository "{\"repo_path\": \"$ROOT\", \"mode\": \"full\", \"persistence\": true}"
```

durch (Modus je Target unverändert, `full` bzw. `fast`):

```bash
bash scripts/mcp/cbm-single-flight.sh "{\"repo_path\": \"$ROOT\", \"mode\": \"full\", \"persistence\": true}"
```

Die `ROOT=$(git rev-parse --show-toplevel)`-Zeile und die `desc`-Texte bleiben
unverändert — Verhalten identisch plus Serialisierung (E5).

Prüfschritte:

```bash
grep -n 'cbm-single-flight' Taskfile.yml
grep -c 'codebase-memory-mcp cli index_repository' Taskfile.yml || echo "direkte Aufrufe: 0 (erwartet)"
git diff --stat Taskfile.yml
```

Erwartet: genau 2 Treffer für den Wrapper, 0 direkte Aufrufe,
`git diff --stat` meldet 2 geänderte Zeilen (netto +0).

## Task 4 — Verifikation (STRUCT3)

Die drei Pflicht-Gates laufen lassen, alle drei müssen grün sein:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
