---
title: "embed-local-retry — Implementation Plan"
ticket_id: T004608
domains: [openspec]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# embed-local-retry — Implementation Plan

_Ticket: T004608_

## Why

`openspec-embed-local.sh` (expliziter C.4-Pfad) ruft `openspec-embed.mjs` genau einmal auf
und bricht bei „best-effort failure (exit 0)" sofort fail-visible ab. Zwei Läufe am
2026-08-14 endeten an einem transienten Backend-Timeout — der Change T004295-Batch blieb
unindiziert (T004608). Der post-commit-Hook hat Retries (T002916), der Wrapper nicht.

Fix: Retry-Schleife im Wrapper (`OPENSPEC_EMBED_RETRIES`/`OPENSPEC_EMBED_RETRY_DELAY`,
analog Hook), Probe bleibt fail-fast.

## File Structure

```
scripts/openspec-embed-local.sh                          — Retry-Schleife um den mjs-Aufruf
tests/spec/openspec-embedding/embed-local-retry-T004608.bats — BATS (RED, liegt bereits vor)
openspec/changes/embed-local-retry/                      — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`tests/spec/openspec-embedding/embed-local-retry-T004608.bats` liegt vor (3 Tests,
offline über PATH-Fake-curl/-node + SESSIONS_DATABASE_URL). Rot bestätigen:

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/embed-local-retry-T004608.bats`
2. Verify test fails — "transienter Backend-Timeout wird retried" ergibt Exit 1 statt 0
   (kein Retry im Wrapper).
3. Verify test fails — "alle Retries erschoepft" zählt 1 node-Aufruf statt initial+Retries.
4. Positiv-Anker grün: "Erfolg im ersten node-Lauf bleibt Exit 0".

### Task 2: Retry-Schleife in openspec-embed-local.sh einbauen

`scripts/openspec-embed-local.sh`, Schritt 3 (Zeile 162–176):

1. Env-Variablen lesen: `OPENSPEC_EMBED_RETRIES` (Default 2), `OPENSPEC_EMBED_RETRY_DELAY`
   (Default 5) — Namensgebung analog `OPENSPEC_EMBED_HOOK_RETRIES*` im post-commit-Hook.
2. Den `node openspec-embed.mjs --slug`-Aufruf in eine Schleife fassen:
   - Lauf → `OUT` auswerten: enthält `indexed slug=` → Erfolg, Schleife verlassen.
   - Fehlt der Marker und sind Versuche übrig → stderr-Meldung
     `[openspec-embed-local] retry N/<max> in <delay>s…`, `sleep`, nächster Versuch.
   - Kein Erfolg nach allen Versuchen → bestehende fail-visible-Meldung + Exit 1
     (kein stiller Exit 0 — das ist der Kern des T004608-Defekts).
3. Erfolgs-Pfad unverändert: `--count-skipped`-Folgelauf + Exit 0.
4. Probe (Schritt 1) NICHT in die Retry-Schleife aufnehmen — fail-fast gewollt.

### Task 3: Grün-Phase — eigenen Testlauf bestehen

1. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/embed-local-retry-T004608.bats`
2. Erwartung: ALLE 3 Tests grün.
3. Regression:
   - `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats`
   - `task test:changed` — kein neuer Rot-Zustand.

### Task 4: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/embed-local-retry/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434).
5. Push `fix/openspec-embed-local-timeout-T004608`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/embed-local-retry/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/embed-local-retry-T004608.bats` — 3/3 grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad).
7. Kein PR aus dem Plan-Stand (T002816).
