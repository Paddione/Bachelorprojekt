---
title: "embed-completeness-slug-scope — Implementation Plan"
ticket_id: T004598
domains: [openspec]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# embed-completeness-slug-scope — Implementation Plan

_Ticket: T004598_

## Why

Der post-commit-embed-Hook behandelte jede completeness-gate-WARN als harten Fehler, auch
wenn die WARN nur fremde Worktree-Pläne als missing nennt und der konkret gecommittete Slug
erfolgreich indiziert wurde. Beobachtet 2026-08-14: `20/31 fehlende aktive Plans` → pro
Commit 3×5s Retry + Fehlrauschen, obwohl der eigene Slug 10 Chunks indizierte (T004598,
Grenzfall des T003491-Fixes).

Fix: `embed_output_is_success` um optionalen Slug-Parameter erweitern — WARN negiert den
Erfolg nur, wenn der eigene Slug in der missing-Liste steht. Ohne Slug: Verhalten unverändert.

## File Structure

```
scripts/openspec-embed-lib.sh                        — embed_output_is_success($out, [$slug])
scripts/openspec-embed-local.sh                      — Slug an die Funktion durchreichen
.githooks/post-commit-embed                          — Slug an die Funktion durchreichen
tests/spec/openspec-embedding/port-forward-identity-T002870.bats — BATS (RED, erweitert)
openspec/changes/embed-completeness-slug-scope/      — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`tests/spec/openspec-embedding/port-forward-identity-T002870.bats` wurde um 3 T004598-Tests
erweitert. Rot bestätigen:

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats`
2. Verify test fails — Test "T004598: WARN mit fremden missing-Slugs negiert den Erfolg
   des eigenen Slugs NICHT" ergibt Exit 1 statt 0 (der Defekt ist damit reproduziert).
3. Positiv-Anker grün: "WARN mit dem eigenen Slug in der missing-Liste failt weiterhin",
   "Aufruf ohne Slug-Parameter behaelt das bisherige Verhalten bei", bestehende T002870-Tests.

### Task 2: `embed_output_is_success` um Slug-Parameter erweitern

`scripts/openspec-embed-lib.sh`, Funktion `embed_output_is_success` (Zeile 22–27):

1. Signatur: `embed_output_is_success() { local out="$1"; local slug="${2:-}"; ... }`
2. Ohne `slug` (leer): exakt bisheriges Verhalten — `grep -q "WARN: completeness gate" && return 1`.
3. Mit `slug`: die WARN-Zeile extrahieren und prüfen, ob der Slug in der missing-Liste steht:
   - WARN-Zeile: `grep -oP 'WARN: completeness gate.*' <<< "$out"`
   - missing-Teil nach `missing` (bzw. vor `>` wenn Toleranz genannt): prüfen ob
     `(^|, )<slug>(,|$)` matcht (Slug als Wortgrenzen-Grenze, kein Prefix-Match —
     `demo` darf nicht `demo2` matchen)
   - Slug in missing-Liste → `return 1` (echter Defekt)
   - Slug NICHT in missing-Liste → `return 0` (Erfolg bleibt Erfolg)
4. Positiv-Anker bleibt: kein `indexed slug=` → `return 1`.

### Task 3: Slug in openspec-embed-local.sh und post-commit-embed durchreichen

1. `scripts/openspec-embed-local.sh`: den Embed-Aufruf suchen, der `embed_output_is_success`
   aufruft, und den Slug-Parameter ergänzen (der Slug ist im Skript bereits als Argument
   bekannt — Variable prüfen und durchreichen).
2. `.githooks/post-commit-embed`: in der Embed-Schleife (`for slug in $SLUGS`) den
   Wrapper-Aufruf so ändern, dass der aktuelle `slug` an die Erfolgsprüfung übergeben wird.
3. Kein Verhalten ohne Slug-Angabe ändern (Fallback-Pfade, z.B. dry-run, unangetastet).

### Task 4: Grün-Phase — eigenen Testlauf bestehen

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats`
2. Erwartung: ALLE Tests grün (inkl. der 3 neuen T004598-Tests).
3. Regression verwandter Suites:
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/batch-openspec-embed-fixes.bats`
   - `task test:changed` — kein neuer Rot-Zustand.

### Task 5: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/embed-completeness-slug-scope/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434).
5. Push `fix/openspec-embed-completeness-gate-T004598`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/embed-completeness-slug-scope/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats` — alle grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad).
7. Kein PR aus dem Plan-Stand (T002816).
