---
title: Nightly Repo-Health-Messung + measured_at-Fix
ticket_id: T002162
domains: [infra, website, test]
status: plan_staged
---

# repohealth-nightly — Implementation Plan

Behebt zwei unabhängige Ursachen dafür, dass `/admin/repohealth` eingefrorene Werte zeigt:
die Messung (Glied [1] der Datenkette) lief nirgends automatisch, und `measured_at` wird aus
der falschen Stelle der SSOT gelesen. Root-Cause-Analyse und Edge-Cases: `design.md`.

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/gen-goals-data.mjs` | 263 | 237 |

Weitere berührte Dateien (nicht S1-budgetiert):

- `.github/workflows/health-goals.yml` — neu, nightly Mess-Workflow
- `.claude/lib/goals.md` — frische Prio-C-Werte + redaktioneller Baseline-Update-Block
- `website/src/lib/goals-data.generated.json` — regeneriertes Artefakt (Folge)
- `tests/spec/health-goals.bats` — RED-Tests für beide Ursachen
- `openspec/specs/health-goals.md` — Delta: Requirement für die automatische Messung
- `website/src/data/test-inventory.json` — regeneriertes Artefakt (Folge der Test-Änderung)

## Task 1 — RED-Tests für beide Root Causes

Status: erledigt vor der Plan-Erstellung (Fix-Pfad verlangt den reproduzierenden Test zuerst).

Sechs Tests in `tests/spec/health-goals.bats` angehängt:

1. `measured_at picks the newest Baseline-Update date` — Fixture mit `2026-07-25`-Marker oben
   und `2026-07-22`-Marker unten; erwartet `2026-07-25`.
2. `measured_at falls back to Baseline-Stichtag` — Regressions-Guard für den Pfad ohne Marker.
3. `nightly workflow exists and runs at 01:00 UTC` — prüft zusätzlich, dass `quality-loop.yml`
   weiterhin um 02:00 läuft, damit die Reihenfolge-Annahme nicht still bricht.
4. `measures with --full, never --fast` — `db_scalar` gibt im Fast-Modus für jedes DB-Ziel `-`
   zurück, wodurch alle DB-Gates stumm übersprungen würden.
5. `commits goals.md and generated.json atomically` — verhindert das Inkonsistenz-Fenster auf
   `main`, das die CI fremder PRs rot färben würde (design.md E2).
6. `does not mark its commit [skip ci]` — sonst triggert `build-website.yml` nicht und das
   Dashboard bleibt trotz frischer Daten auf dem alten Image (design.md E3).

Testrunner-Aufruf und Ergebnis — expected: FAIL für 1, 3, 4, 5, 6:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats \
  --filter "measured_at|health-goals.yml"
```

Beobachtet: 5 rot, 1 grün. Test 1 meldet
`measured_at = '2026-07-22', erwartet '2026-07-25'`; Tests 3–6 melden die fehlende
Workflow-Datei.

## Task 2 — `measured_at` per Datums-Maximum statt Dokument-Reihenfolge

Datei: `scripts/gen-goals-data.mjs` (Ist 263 · nicht-baselined · `.mjs`-Limit 500 → Budget 237).

Zeilen 126–130 ersetzen. Bisher gewinnt `updateMatches[updateMatches.length - 1]`, also der
letzte Treffer in Dokument-Reihenfolge. Die Marker in `.claude/lib/goals.md` stehen aber
thematisch sortiert, nicht chronologisch.

Neue Logik: alle Treffer auf das Format `YYYY-MM-DD` filtern und das lexikografische Maximum
nehmen — bei ISO-Daten ist die lexikografische Ordnung identisch zur chronologischen, deshalb
ist kein `Date`-Parsing nötig. Der Fallback auf `Baseline-Stichtag` bleibt unverändert, ebenso
das Verhalten bei komplett fehlenden Markern.

Verifikation:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats --filter "measured_at"
```

Erwartung nach dem Fix: beide Tests grün.

## Task 3 — Nightly Mess-Workflow `.github/workflows/health-goals.yml`

Neue Datei. Bausteine aus zwei bestehenden Workflows, damit keine neuen Muster entstehen:

- kubectl-Installation, `FLEET_KUBECONFIG`-Dekodierung und der `current-context`-Guard nach
  dem Vorbild von `quality-loop.yml` (Schritte "Set up kubectl + fleet kubeconfig" und
  "Guard: kubeconfig context must be fleet").
- Commit-und-Push-Block mit `GH_PAT` nach dem Vorbild von `freshness-regen.yml`.

Eigenschaften, die die Tests aus Task 1 festpinnen:

- `schedule` mit `cron: "0 1 * * *"` plus `workflow_dispatch` mit einem `dry_run`-Input für
  manuelle Läufe ohne Schreibzugriff.
- Messung mit `--full`, niemals `--fast`.
- Läuft `task health:goals:update -- --full` **und** `task health:goals:emit`, committet
  `.claude/lib/goals.md` und `website/src/lib/goals-data.generated.json` in **einem** Commit.
- Kein `[skip ci]` im Commit-Titel.
- Eigene `concurrency`-Gruppe mit `cancel-in-progress: false`, damit ein laufender Mess-Job
  nicht mittendrin abgebrochen wird und keinen Teil-Commit hinterlässt.
- Kein Commit, wenn `git diff` leer ist.
- `permissions: contents: write`, `timeout-minutes: 20`.

Verifikation:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats --filter "health-goals.yml"
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/health-goals.yml'))"
```

## Task 4 — Frische Messung in `goals.md` schreiben

Erst die maschinelle Aktualisierung der Prio-C-Tabelle, dann der redaktionelle Block.

```bash
bash scripts/health-goals-update.sh --dry-run --full
bash scripts/health-goals-update.sh --full
```

Der `--dry-run` zuerst, um die vorgeschlagenen Zellen-Diffs zu sichten; das Skript überspringt
Zellen ohne einfaches Integer-Format fail-safe und listet sie zur manuellen Prüfung auf.

Danach von Hand einen `**Baseline-Update 2026-07-26 (T002162):**`-Block ans Ende des
Prio-C-Abschnitts anfügen, in der Form der bestehenden Einträge: welche Gates gerissen sind,
mit welchem Wert, und der Hinweis, dass die Werte seit dem Vortag erstmals automatisch
fortgeschrieben werden. Die Gates werden hier **sichtbar gemacht**, nicht inhaltlich behoben —
die Behebung ist eigene Arbeit mit eigenen Tickets (design.md, "Nicht im Scope").

Anschließend das Artefakt nachziehen und den Stichtag prüfen:

```bash
task health:goals:emit
jq -r '[.[].measured_at] | unique' website/src/lib/goals-data.generated.json
```

Erwartung: `["2026-07-26"]` — der Beleg dafür, dass Task 2 und Task 4 zusammenwirken.

## Task 5 — OpenSpec-Delta: Requirement für die automatische Messung

Datei: `openspec/specs/health-goals.md`.

Die bestehenden vier Requirements decken SSOT, Generator, Freshness-Gate und Fail-Loud-Parsing
ab — aber keine automatische Messung. Genau deshalb konnte der Zustand entstehen, ohne dass ein
Test anschlägt. Ein Requirement ergänzen, das einen scheduled Workflow fordert, der die
Messwerte fortschreibt und `goals.md` zusammen mit dem generierten Artefakt atomar committet,
mit Szenarien für den Cron-Zeitpunkt und für die Atomarität.

Verifikation:

```bash
task openspec:validate
```

## Task 6 — Verifikation

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Alle sechs Tests aus Task 1 müssen grün sein. `task freshness:regenerate` zieht
`website/src/data/test-inventory.json` nach (Pflicht nach jeder Test-Änderung, sonst failt CI);
`task freshness:check` prüft die Freshness-Invariante samt S1–S4-Ratchet und der
Baseline-Key-Count-Assertion.
