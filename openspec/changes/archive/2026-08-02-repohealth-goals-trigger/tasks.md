---
title: "repohealth-goals-trigger — Implementation Plan"
ticket_id: T002158
domains: [ci-cd, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# repohealth-goals-trigger — Implementation Plan

_Ticket: T002158 · Design: `openspec/changes/repohealth-goals-trigger/design.md`_

Zwei Trigger-Brüche verhindern, dass Health-Goal-Änderungen `/admin/repohealth` erreichen.
Root-Cause, Blast-Radius-Analyse und verworfene Alternativen stehen im `design.md`; dieser Plan
setzt die dort gewählte Variante um (bedingtes `[skip ci]`, kein imperativer Dispatch).

## File Structure

```
.github/workflows/build-website.yml        (geändert) +1 paths-Eintrag
.github/workflows/freshness-regen.yml      (geändert) Commit-Step: bedingtes [skip ci]
tests/spec/ci-cd.bats                      (geändert) +3 @test (T002158-A, T002158-B ×2)
.claude/lib/goals.md                       (geändert) G-E2E Root-Cause-Notiz (Freitext)
k3d/monitoring/health-goals-cronjob.yaml   (geändert) Image-Pin + Digest
```

**S1-Zeilenlimits:** keine der fünf Dateien liegt im S1-Scope — `docs/code-quality/gates.yaml`
→ `s1.limits` deckt nur `.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java
.php` ab. `.yml`, `.yaml`, `.bats` und `.md` sind ungated, alle fünf Dateien sind
`nicht-baselined`. Kein Zeilenbudget-Risiko, kein Split nötig.

<!-- vitest: kein neuer Test nötig, weil keine .ts/.svelte-Datei berührt wird — die Änderung
     betrifft ausschließlich GitHub-Actions-Trigger und wird per BATS abgedeckt. -->

## Task 1 — RED: Regressionstests für beide Trigger-Brüche

Die drei Tests liegen bereits auf dem Branch (Commit „add failing test"). Dieser Task ist der
dokumentierte RED-Beweis; der Implementer verifiziert ihn erneut, bevor er den Fix baut.

`tests/spec/ci-cd.bats` — SSOT `openspec/specs/ci-cd.md`, angehängt hinter den
T002157-Tests (gleiche Fehlerklasse, deshalb bewusst benachbart):

- `T002158-A: build-website triggert auf die Repohealth-Datenquelle goals.md`
  → `grep -q "\.claude/lib/goals\.md" "$BUILD_WF"`
- `T002158-B: freshness-regen setzt [skip ci] nicht unbedingt im Bot-Commit`
  → `! grep -qE 'git commit -m "[^"]*\[skip ci\]"' "$wf"`
- `T002158-B: freshness-regen prueft den Regen-Diff auf website/-Pfade`
  → `grep -q '\^website/' "$wf"`

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002158"
# expected: FAIL — 3 von 3 rot, solange beide Trigger-Brüche bestehen
```

**Akzeptanz:** genau drei `not ok`-Zeilen, jede mit der erklärenden FAIL-Diagnose.

## Task 2 — GREEN A: `.claude/lib/goals.md` in die build-website-Trigger aufnehmen

`.github/workflows/build-website.yml`, `on.push.paths` (aktuell Zeilen 4–7):

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      # T002158: SSOT von website/src/lib/goals-data.generated.json. Der JSON wird per
      # statischem ESM-Import (website/src/lib/goals-data.ts) ins Bundle gebacken —
      # ohne diesen Trigger baut eine goals-only-Änderung kein Image und
      # /admin/repohealth bleibt stale (gleiche Klasse wie T002157).
      - '.claude/lib/goals.md'
      - '.github/workflows/build-website.yml'
  workflow_dispatch:
```

Rein additiv. Der bestehende Step `Regenerate freshness artifacts before build`
(`build-website.yml:38`) erledigt die Transformation `goals.md` → JSON bereits — es braucht
**keinen** zusätzlichen `health:goals:emit`-Aufruf.

**Akzeptanz:** `T002158-A` ist grün.

## Task 3 — GREEN B: `[skip ci]` im Bot-Commit bedingt setzen

`.github/workflows/freshness-regen.yml`, Step `Commit and push if changed` (Zeilen 56–65).
Der Check gehört **zwischen** `git add -A` und `git commit`, weil `--cached` den Index liest:

```yaml
      - name: Commit and push if changed
        if: steps.diff.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ secrets.GH_PAT }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          # T002158: [skip ci] nur wenn KEIN website/**-Artefakt betroffen ist. Dieser
          # Bot-Commit ist der einzige Ort, an dem website/src/lib/goals-data.generated.json
          # außerhalb eines PRs fortgeschrieben wird — also der einzige Pfad, der
          # build-website.yml auslösen würde. Ein unbedingtes [skip ci] fror den
          # ausgelieferten /admin/repohealth-Stand ein.
          # Der ^-Anker verhindert Fehlmatches wie docs/website-notes.md.
          if git diff --cached --name-only | grep -q '^website/'; then
            SKIP=""
          else
            SKIP=" [skip ci]"
          fi
          git commit -m "chore: auto-regenerate freshness artifacts${SKIP}"
          git push
```

Zwei Invarianten, die nicht brechen dürfen:

1. **`G-CI01-E` bleibt grün** (`tests/spec/ci-cd.bats:183` prüft `grep -c "\[skip ci\]"` ≥ 1).
   Das Literal bleibt im `else`-Zweig erhalten — deshalb ist diese Variante gewählt und nicht
   „`[skip ci]` entfernen".
2. **Keine Endlosschleife.** Lauf 2 ruft `task freshness:regenerate` (idempotent),
   `git diff --quiet` wird wahr, `changed=false` → kein Commit → Kette endet. Maximal ein
   zusätzlicher Lauf; `concurrency.cancel-in-progress: true` dämpft zusätzlich.

**Akzeptanz:** beide `T002158-B`-Tests sind grün.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002158|G-CI01-E"
```

## Task 4 — Mitgenommene Änderungen aus dem Working Tree

Beide sind bereits als eigener `chore(monitoring)`-Commit auf dem Branch abgelegt (sie lagen
als Working-Tree-Änderungen vor und gehören thematisch hierher). Der Implementer verifiziert
sie nur noch, statt sie neu zu schreiben.

**`.claude/lib/goals.md`** — Root-Cause-Notiz an der G-E2E-Prio-A-Zeile: DNS-Auflösung
`EAI_AGAIN web.korczewski.de` in den CI-Runnern (`globalSetup`/`globalTeardown`-`fetch`
schlägt fehl), zweitens 401 auf dem Ingest-Endpoint (`INGEST_TOKEN`-Secret prüfen). Reiner
Freitext in einer Prio-A-Sektion — `scripts/gen-goals-data.mjs` liest dort keine
strukturierten Felder, der generierte JSON ändert sich also nicht.

**`k3d/monitoring/health-goals-cronjob.yaml`** — Image-Pin:
`alpine/k8s:1.28.2` → `alpine/k8s:1.36.2@sha256:44ef4942e171939b9c665a4a84beb80e2dcdb9a24330d4651cfdfd2e9deecc47`.
Erfüllt den Image-Pin-Advisory des CI-Security-Scans. Der CronJob selbst ist weiterhin ein
Stub (`command: ["/bin/sh","-c","echo 'Running health goals check cron'"]`) — ihn mit echter
Mess-Logik zu füllen ist Follow-up C, ausdrücklich nicht Teil dieses Changes.

**Akzeptanz:** `kustomize build k3d/monitoring` läuft durch; der generierte JSON bleibt
unverändert (`git diff --exit-code website/src/lib/goals-data.generated.json` nach
`task health:goals:emit`).

## Task 5 — Final Verification

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats -f "T002158"
task test:changed
task freshness:regenerate
task freshness:check
```

**Erwartung:** die drei `T002158`-Tests grün; `G-CI01-E` weiterhin grün.

**Vorbestehende rote Tests, NICHT von diesem Change verursacht:** `tests/spec/ci-cd.bats`
enthält auf `main` bereits drei rote `T001994`-Tests (`website:deploy`-Allowlist für
`prod-fleet/website-mentolder`, `prod-fleet/website-korczewski`, `k3d/website.yaml`). Sie
bleiben rot und gehören in ein eigenes Ticket — dieser Change darf sie nicht stillschweigend
mitreparieren, sonst vermischt sich der Diff.

**Post-Merge-Beleg für Bruch A:** Dieser PR fasst `.claude/lib/goals.md` an. Nach dem Merge
muss also ein Build-Run auf dem Merge-Commit existieren:

```bash
gh run list --workflow build-website.yml --limit 3
```

Erscheint dort kein Run für den Merge-Commit, greift Task 2 nicht und der Fix ist unwirksam.
