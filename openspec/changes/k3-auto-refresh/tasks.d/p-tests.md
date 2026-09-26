---
title: "k3-auto-refresh p-tests — Implementation Plan"
ticket_id: T900450
domains: [brain, tests]
status: active
---

# k3-auto-refresh (p-tests) — Implementation Plan

_Ticket: T900450 · Partial p-tests von k3-auto-refresh · Scope: Guard-BATS
allein. Trägt den STRUCT2-Failing-Test-Step für den Change. Wrapper +
Runbook + Taskfile (p1) und Cron-Job + Docs-Refresh (p2) sind eigene
Partials und werden hier nicht angefasst — die Tests assertieren deren
vertraglich gepinnte Lieferungen (p1-Schnittstellenvertrag: genau ein
JSON-Positionsargument, flock auf
`$HOME/.cache/codebase-memory-mcp/cbm-index.lock`, `CBMSF_TIMEOUT`
Default 3000, Exit 2 ohne Args, Exit 3 bei Timeout, sonst MCP-Exit
unverändert; p2-Lieferung: Cron-Skript mit Header-Cron-Eintrag,
skip-if-fresh-Pre-Gate, `--dry-run`, stdout trägt ausschließlich die eine
JSON-Metrik-Zeile). Alle Checks brauchen keine Index-Mutation, keinen
Cron-Daemon und kein MCP-Backend über das Vorhandene hinaus._

_Messlage: `bash scripts/plan-intel-filter.sh k3-auto-refresh …` meldet
`intel.json not found` — Intel unten stammt aus grep-Fallback und direkter
Verifikation. `grep -rn 'codebase-memory-mcp' .github/workflows/` liefert
0 Treffer: CI kennt das Binary nicht → die zwei Live-Lauf-Tests tragen
Verfügbarkeits-Guards per `command -v … || skip` (Repo-Regel T002820),
alle übrigen Tests sind reine grep-Checks ohne Binary-Bedarf.
`plan-lint.sh residual_budget` für die Zieldatei liefert leer (Datei ist
neu). `tests/spec/cbm-stampede-guard.bats` existiert noch nicht (Ist 0,
per `ls` verifiziert)._

## File Structure

| Datei | Ist | Wirksame S1-Schwelle | Geplant |
| `tests/spec/cbm-stampede-guard.bats` | 0 (neu, verifiziert fehlend) | S1 n.a.: kein `.bats`-Eintrag in `s1.limits`, nicht-baselined | ca. 150 Zeilen, Obergrenze 170 |

`docs/code-quality/baseline.json` hält 5 Keys, keiner betrifft diese Datei
— es werden keine Baseline-Einträge hinzugefügt. Die Guard-Datei wird von
der BATS-Selektion in `task test:changed` automatisch erfasst; zusätzlich
erfordert die neue Testdatei den `task test:inventory`-Regen-Schritt in
Task 1 (CI-Inventar-Check).

## Task 1 — Guard-BATS `tests/spec/cbm-stampede-guard.bats` anlegen (inkl. STRUCT2 red-step)

Neue Datei nach Hausstil (`setup()` mit `REPO_ROOT`-Ableitung wie in
`tests/spec/pre-commit-freshness.bats`, Header-Kommentar mit SSOT- und
Ticket-Zeile, `@test`-Namen mit `T900450`-Präfix — das ist die
Ticket-Guard-Zeile im Stil von `pre-commit-freshness.bats`). Inhalt:
genau die 6 Testblöcke unten, keine weiteren.

```bats
#!/usr/bin/env bats
# tests/spec/cbm-stampede-guard.bats
# SSOT: openspec/changes/k3-auto-refresh/design.md (E2/E4/E6), p1-Schnittstellenvertrag
# Ticket: T900450

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WRAPPER="$REPO_ROOT/scripts/mcp/cbm-single-flight.sh"
  CRON="$REPO_ROOT/scripts/cbm-refresh-cron.sh"
  RUNBOOK="$REPO_ROOT/docs/runbooks/cbm-index-stampede.md"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
}

@test "T900450-W1: Wrapper existiert, ist ausfuehrbar, enthaelt flock + Lockpfad + Timeout 3000 + Exit-3-Zweig" {
  [ -f "$WRAPPER" ] || { echo "MISSING wrapper: $WRAPPER"; return 1; }
  [ -x "$WRAPPER" ] || { echo "NOT-EXECUTABLE: $WRAPPER"; return 1; }
  grep -q 'flock' "$WRAPPER"
  grep -qF '.cache/codebase-memory-mcp/cbm-index.lock' "$WRAPPER"
  grep -q '3000' "$WRAPPER"
  grep -q 'exit 3' "$WRAPPER"
}

@test "T900450-W2: Wrapper ohne Argumente beendet sich mit Exit 2 (kein MCP-Aufruf erreicht)" {
  command -v codebase-memory-mcp >/dev/null || skip 'codebase-memory-mcp fehlt auf CI (T002820)'
  run bash "$WRAPPER"
  [ "$status" -eq 2 ]
}

@test "T900450-C1: Cron-Skript referenziert den Wrapper, traegt fresh-skip-Zweig und dokumentierten Cron-Eintrag" {
  [ -f "$CRON" ] || { echo "MISSING cron: $CRON"; return 1; }
  grep -q 'cbm-single-flight.sh' "$CRON"
  grep -q 'fresh-skip' "$CRON"
  grep -qE '0 (\*/4)? \* \* \*' "$CRON"
}

@test "T900450-C2: Cron --dry-run stdout ist genau eine JSON-Zeile mit .status" {
  command -v codebase-memory-mcp >/dev/null || skip 'codebase-memory-mcp fehlt auf CI (T002820)'
  run bash "$CRON" --dry-run
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | wc -l)" -le 1 ]
  printf '%s' "$output" | jq -e .status >/dev/null
}

@test "T900450-A1: Kein direktes index_repository in Automation (nur Wrapper-Passthrough)" {
  [ "$(grep -c 'index_repository' "$WRAPPER")" -eq 1 ]
  ! grep -v '^#' "$CRON" | grep -q 'index_repository'
  ! grep -q 'codebase-memory-mcp cli index_repository' "$TASKFILE"
  [ "$(grep -c 'cbm-single-flight' "$TASKFILE")" -eq 2 ]
}

@test "T900450-R1: Runbook enthaelt index_status + detect_changes + Wrapper + Task-Referenz" {
  [ -f "$RUNBOOK" ] || { echo "MISSING runbook: $RUNBOOK"; return 1; }
  [ "$(grep -c 'index_status' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'detect_changes' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'cbm-single-flight.sh' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'codebase:index' "$RUNBOOK")" -ge 1 ]
}
```

Hinweise zum Zuschnitt: W1 prüft den p1-Vertrag statisch (flock,
Lockpfad, Default 3000, Exit-3-Zweig) und läuft ohne Binary. W2 ist der
einzige Wrapper-Live-Lauf und erreicht den MCP-Aufruf nie (Arg-Guard
greift zuerst), trägt aber trotzdem den Verfügbarkeits-Guard, weil
`bash "$WRAPPER"` das Skript lädt. C2 ruft `--dry-run` auf, das
`index_status` anspricht → gleicher Guard. C1/A1/R1 sind reine
grep-Checks und laufen auf CI ohne Binary grün. Der Cron-Eintrags-Regex
akzeptiert beide E3-Varianten (`0 * * * *` hourly und `0 */4 * * *`
Fallback). A1 erlaubt im Wrapper genau die eine Passthrough-`exec`-Zeile
aus dem p1-Vertrag.

STRUCT2-Failing-Test-Step (Rot-Nachweis VOR der Implementierung von
p1/p2 — der Implementierer führt ihn aus, sobald diese Guard-Datei
angelegt, p1/p2 aber noch nicht umgesetzt sind; alle drei p1/p2-Dateien
sind neu, daher ist der Rot-Zustand der Datei-fehlend-Zustand):

```bash
bats tests/spec/cbm-stampede-guard.bats
echo "red rc=$? (expected: FAIL — erwartet 1, Wrapper/Cron/Runbook fehlen noch)"
```

Danach Inventar regenerieren (neue Testdatei erfordert das, CI-Inventar-Check):

```bash
task test:inventory
git status --porcelain components/website/src/data/test-inventory.json
```

Erwartet: `bats`-Exit 1 im Rot-Zustand; `test:inventory` läuft grün
durch und das Inventar ist aktualisiert.

## Task 2 — Rot→Grün-Nachweis (exakte Befehle, bats-exit 1→0)

Nach Umsetzung von p1/p2 den Umschlag belegen: zuerst die p1/p2-Dateien
kurzzeitig beiseite schieben (Rot-Zustand wie in Task 1), dann
zurücklegen (Grün-Zustand). Der Implementierer führt beide Läufe aus:

```bash
mkdir -p /tmp/k3-red-mcp /tmp/k3-red-rest
mv scripts/mcp/cbm-single-flight.sh /tmp/k3-red-mcp/
mv scripts/cbm-refresh-cron.sh /tmp/k3-red-rest/
mv docs/runbooks/cbm-index-stampede.md /tmp/k3-red-rest/
bats tests/spec/cbm-stampede-guard.bats
echo "red rc=$? (erwartet 1)"
mv /tmp/k3-red-mcp/cbm-single-flight.sh scripts/mcp/
mv /tmp/k3-red-rest/cbm-refresh-cron.sh scripts/
mv /tmp/k3-red-rest/cbm-index-stampede.md docs/runbooks/
bats tests/spec/cbm-stampede-guard.bats
echo "green rc=$? (erwartet 0)"
```

Erwartet: erster Lauf Exit 1 (mindestens W1, C1, R1, A1 fallen weg —
`[ -f … ]`-Guards melden MISSING), zweiter Lauf Exit 0. Falls
`codebase-memory-mcp` auf der Maschine fehlt, zeigen W2/C2 `skip` statt
`ok` — das ist der dokumentierte T002820-Pfad und bricht den
Grün-Nachweis nicht (Exit bleibt 0).

## Task 3 — Verifikation (STRUCT3)

Die drei Pflicht-Gates laufen lassen, alle drei müssen grün sein:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
