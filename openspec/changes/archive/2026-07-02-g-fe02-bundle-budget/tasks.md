---
title: "G-FE02: Client-JS-Bundle messen + Budget (kein Netto-Zuwachs/Release)"
ticket_id: T001207
domains: [fe, perf, bundle, website, ci]
status: plan_staged
file_locks: []
shared_changes: false
---

# Tasks: g-fe02-bundle-budget (T001207)

- [ ] Task 0: BATS Failing-Test `tests/spec/g-fe02-bundle-budget.bats` anlegen (RED — prüft ob `website/bundle-baseline.json` existiert; vor Task 2 rot)
- [ ] Task 1: Mess-Skript `scripts/check-bundle-size.mjs` anlegen (< 150 Zeilen)
- [ ] Task 2: Baseline messen + `website/bundle-baseline.json` committen → BATS grün
- [ ] Task 3: CI-Budget-Gate in `.github/workflows/ci.yml` eintragen (+ `Taskfile.yml`-Task für S4)
- [ ] Task 4: `task test:changed` + `task freshness:regenerate` + `task freshness:check` (Exit 0)
- [ ] Task 5: Commit + Push

---

# G-FE02 — Client-JS-Bundle Budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Die Gesamt-Größe des Client-JS-Bundles der Website (`website/dist/client/**/*.js`,
gzip) deterministisch messen, als committete Baseline (`website/bundle-baseline.json`) festhalten
und eine CI-Policy erzwingen: Zuwachs ≤ 5 % gegenüber Baseline → Warnung (exit 0), Zuwachs > 5 %
→ Fail (exit 1). Kein Bundle-Shrinking in diesem Ticket — nur Messung + Guardrail.

**Architecture:** Ein einzelnes Node-Skript (`scripts/check-bundle-size.mjs`, ESM, nur Node-Builtins
`fs`/`path`/`zlib`) misst die gzip-Summe aller `*.js` unter `website/dist/client/`. Zwei Modi:
`--update-baseline` schreibt die JSON-Baseline; der Check-Modus vergleicht die aktuelle Messung
mit der Baseline und entscheidet anhand des Schwellwerts (`--threshold=<pct>` / `BUNDLE_BUDGET_PCT`,
Default 5). Astro baut SSR (`output: 'server'`, `@astrojs/node`) — der relevante Client-Anteil
landet in `website/dist/client/`. Das CI-Gate baut die Website (pnpm-Workspace) und ruft das Skript
im Check-Modus auf. S4 wird durch die Referenz aus `ci.yml` **und** einem `Taskfile.yml`-Task erfüllt.

**Tech Stack:** Node 22 (ESM, `zlib.gzipSync`), Astro/Vite-Build der Website (pnpm), BATS
(bats-core via `tests/unit/lib`-Submodul), GitHub Actions.

## File Structure

```
scripts/check-bundle-size.mjs                       ← NEW: Mess-/Check-Skript (< 150 Zeilen, .mjs-Limit 500)
website/bundle-baseline.json                        ← NEW: committete gzip-Baseline (totalGzipBytes, fileCount, generatedAt)
tests/spec/g-fe02-bundle-budget.bats                ← NEW: Failing-Test (RED → GREEN)
.github/workflows/ci.yml                            ← MODIFY: neues Budget-Gate-Job/Step (.yml nicht S1-gated)
Taskfile.yml                                         ← MODIFY: Task `website:bundle:check` (S4-Referenz)
openspec/changes/g-fe02-bundle-budget/              ← NEW: proposal.md + tasks.md + specs/
```

## Task 0 — BATS Failing-Test (RED → GREEN)

Lege `tests/spec/g-fe02-bundle-budget.bats` mit drei `@test`-Cases an:

```bash
#!/usr/bin/env bats
# SSOT: openspec/changes/g-fe02-bundle-budget/ (planned)
setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-FE02: bundle baseline file exists" {
  [ -f "$REPO_ROOT/website/bundle-baseline.json" ]
}

@test "G-FE02: baseline JSON has a positive totalGzipBytes field" {
  run node -e 'const b=require(process.argv[1]); process.exit(Number(b.totalGzipBytes)>0?0:1)' \
    "$REPO_ROOT/website/bundle-baseline.json"
  [ "$status" -eq 0 ]
}

@test "G-FE02: check-bundle-size script is present and parses" {
  run node --check "$REPO_ROOT/scripts/check-bundle-size.mjs"
  [ "$status" -eq 0 ]
}
```

**RED-Step:** Vor Task 1+2 das Spec ausführen:
`./tests/unit/lib/bats-core/bin/bats tests/spec/g-fe02-bundle-budget.bats`.
Da weder Skript noch Baseline existieren, sind die Tests **Expected: FAIL** (3× `not ok`). Damit
ist der Test-Bestand verifiziert rot; nach Task 1+2 müssen alle drei grün werden.

## Task 1 — Mess-/Check-Skript `scripts/check-bundle-size.mjs`

Neues ESM-Skript, Ziel **< 150 Zeilen** (`.mjs`-S1-Limit ist 500 — komfortabler Abstand). Nur
Node-Builtins (`node:fs`, `node:path`, `node:zlib`), keine Dependencies. Verhalten:

- **Messen:** rekursiv alle `*.js` unter `website/dist/client/` einsammeln, jede Datei lesen,
  `zlib.gzipSync(buf).length` summieren → `totalGzipBytes`, dazu `fileCount`.
- **Build-Fallback:** fehlt `website/dist/client/`, mit klarer Fehlermeldung abbrechen und auf
  den vorgelagerten Build-Schritt verweisen (der Build wird im CI-Gate bzw. lokal vor dem Skript
  ausgeführt — das Skript baut nicht selbst, um den Single-Responsibility-Schnitt zu halten).
- **Baseline schreiben** (`--update-baseline`): `website/bundle-baseline.json` mit
  `{ totalGzipBytes, fileCount, generatedAt }` (stabil sortiert, 2-Space-Indent, trailing newline).
- **Check-Modus** (Default): Baseline laden, aktuelle Messung gegenrechnen, Delta absolut + in
  Prozent berechnen. Schwellwert aus `--threshold=<pct>` / `BUNDLE_BUDGET_PCT`, Default 5.
  - Zuwachs ≤ Schwellwert → Zeile ausgeben (Warnung bei Zuwachs > 0), **exit 0**.
  - Zuwachs > Schwellwert → Fehlerzeile mit absolutem + prozentualem Zuwachs, **exit 1** (nur wenn
    `--fail` gesetzt ist; ohne `--fail` reine Warnung/exit 0, damit der Modus konfigurierbar bleibt).
- **Flags:** `--update-baseline`, `--check` (Default), `--fail`, `--threshold=<pct>`,
  `--dir=<pfad>` (Default `website/dist/client`), `--baseline=<pfad>` (Default
  `website/bundle-baseline.json`).

**Budget-Check:** Datei ist neu (kein `wc -l` auf Platte vor Anlage); Ziel < 150 Zeilen liegt klar
unter dem `.mjs`-Limit 500. Kein S1-Risiko.

## Task 2 — Baseline messen + committen

Website bauen und Baseline erzeugen:

```bash
cd website && pnpm install --frozen-lockfile && pnpm build && cd ..
node scripts/check-bundle-size.mjs --update-baseline
```

Ergebnis: `website/bundle-baseline.json` mit dem aktuellen gzip-Gesamtwert. Anschließend
`./tests/unit/lib/bats-core/bin/bats tests/spec/g-fe02-bundle-budget.bats` erneut ausführen —
jetzt **3× `ok`** (GREEN). Die Baseline-JSON wird mitcommittet; sie ist der Bezugspunkt der Policy.

## Task 3 — CI-Budget-Gate + Taskfile-Task (S4)

**`.github/workflows/ci.yml`:** Neuer Job `bundle-budget` (parallel zu `offline-tests`), der die
Website baut und das Skript im Check-Modus aufruft. Skizze:

```yaml
  bundle-budget:
    name: Client-JS Bundle Budget
    if: github.event.action != 'edited'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5
      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444  # v5
        with: { node-version: '22' }
      - name: Build website
        run: |
          corepack enable
          cd website && pnpm install --frozen-lockfile && pnpm build
      - name: Check client-JS bundle budget
        run: node scripts/check-bundle-size.mjs --check --fail --threshold=5
```

Policy: Zuwachs ≤ 5 % → Skript exit 0 (grün, mit Warnzeile bei Zuwachs > 0); Zuwachs > 5 % → exit 1
(Job rot, sichtbar im PR). Der neue Job wird **nicht** als required Branch-Protection-Check
eingetragen (Follow-up nach einem Release-Zyklus) — er ist zunächst advisory/sichtbar.

**`Taskfile.yml`:** zusätzlich Task `website:bundle:check` (ruft `node scripts/check-bundle-size.mjs
--check`) und `website:bundle:baseline` (ruft `--update-baseline`). Dies erfüllt S4 doppelt
(CI-Workflow + Taskfile referenzieren `scripts/check-bundle-size.mjs`) und gibt lokale Nutzbarkeit.

## Task 4 — Gates (test:changed + freshness)

Pflicht-Verifikation am Ende:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:changed` triggert das neue `tests/spec/g-fe02-bundle-budget.bats` (geänderter Pfad)
sowie die S1/S4-Checks (`scripts/check-bundle-size.mjs` muss S4-referenziert sein → grün).
`task freshness:regenerate` aktualisiert `website/src/data/openspec-status.json` (neuer
`plan_staged`-Eintrag); `task freshness:check` muss Exit 0 liefern.

## Task 5 — Commit + Push

```bash
git add scripts/check-bundle-size.mjs \
        website/bundle-baseline.json \
        tests/spec/g-fe02-bundle-budget.bats \
        .github/workflows/ci.yml \
        Taskfile.yml \
        website/src/data/openspec-status.json
git commit -m "feat(website): measure client-JS bundle + no-net-growth budget [T001207]"
git push -u origin feature/bundle-budget
```

PR-Titel (gleiche Wording): `feat(website): measure client-JS bundle + no-net-growth budget [T001207]`
