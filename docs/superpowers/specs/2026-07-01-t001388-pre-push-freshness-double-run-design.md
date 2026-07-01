---
spec_id: 2026-07-01-t001388-pre-push-freshness-double-run
title: Pre-push-Hook erfordert doppelten freshness:regenerate-Lauf
ticket_id: T001388
status: brainstorming
date: 2026-07-01
author: ticket-ops
---

# Pre-push-Hook erfordert doppelten freshness:regenerate-Lauf

## Problem (Root Cause)

Der `.githooks/pre-commit`-Hook ruft `task freshness:regenerate` und versucht
anschließend, die veränderten Dateien automatisch zu `git add`en. Die Liste der
zu stagenenden Dateien ist **hartkodiert** in der Variable `_FRESHNESS_FILES`.

Der `task freshness:regenerate`-Task wiederum ist eine **Umbrella-Kette**, die
u. a. folgende Sub-Tasks ausführt (Taskfile.yml, Zeilen 928–936):

```yaml
- task: test:inventory          # website/src/data/test-inventory.json
- task: routes:manifest         # website/src/data/route-manifest.json
- task: assets:learning         # website/src/lib/learning-assets.generated.json
- task: quality:index           # docs/code-quality/repo-index.json
- task: agent-guide:emit        # docs/agent-guide/**, website/src/lib/agent-guide.generated.json
- task: graph:build             # docs/generated/{graph.json,api-map.json,api-surface.md,blast-radius.md}
- task: openspec:status-map     # website/src/data/openspec-status.json
- task: loc:update-baseline     # docs/code-quality/loc-budget.json
```

**Diff zwischen den beiden Listen** (pre-commit `_FRESHNESS_FILES` vs.
`freshness:check` `FILES`):

| Datei | `freshness:check` | `pre-commit _FRESHNESS_FILES` | Verhalten |
|-------|-------------------|-------------------------------|-----------|
| `website/src/data/openspec-status.json` | ✓ | ✗ | wird regeneriert, **nicht gestaged** → stale |
| `docs/code-quality/loc-budget.json` | ✓ | ✗ | wird regeneriert, **nicht gestaged** → stale |
| `docs/generated/{api-map.json,api-surface.md,blast-radius.md,graph.json}` | ✗ | ✓ | wird gestaged, ist nicht im CI-Manifest (false positive) |
| `k3d/docs-content-built/` | ✗ | ✓ | wird gestaged, ist nicht im CI-Manifest (false positive) |

**Konsequenz:** Wenn der User eine Datei ändert, die `openspec:status-map` oder
`loc:update-baseline` triggert (z. B. ein neuer BATS-Test, der `test:inventory`
aktualisiert UND den `openspec-status-map`-Eintrag verschiebt), dann:

1. Pre-commit regeneriert **alle** Dateien (Umbrella-Task).
2. Auto-Stage erfasst nur die hartkodierte Liste — `openspec-status.json` und
   `loc-budget.json` werden übersehen.
3. Der Commit übernimmt die **alten** Versionen dieser beiden Dateien.
4. Pre-push `task quality:check` (nur Ratchet, kein Regen) blockt nicht.
5. CI `task freshness:check` ruft erneut `freshness:regenerate` auf,
   schreibt die zwei Dateien neu in die Working Tree und findet via
   `git diff --exit-code` einen Drift → **FAIL**, der User muss amend + re-push.

Der `measured_at`-Timestamp in `loc-budget.json` (ISO-String, von
`new Date().toISOString()`) verschärft das Problem: selbst wenn der Inhalt
ansonsten stabil ist, schlägt der Diff wegen der Zeitdifferenz zwischen
Pre-Commit- und CI-Lauf fehl. (Im `countChanged = false`-Pfad wird die Datei
allerdings nicht neu geschrieben — siehe `scripts/check-loc-budget.mjs:222–238`.)

## Konsequenz

- Jeder Commit, der `openspec:status-map` oder `loc:update-baseline` triggert,
  erfordert `task freshness:regenerate && git commit --amend --no-edit &&
  git push --force-with-lease`.
- Mishap-Bundle-Workflow (T001367 M1) ist regelmäßig betroffen, weil er
  mehrere BATS-Dateien auf einmal anlegt.

## Zwei Design-Optionen

### Option (a) — Pre-Commit-Hook erweitern (Empfohlen, Hybrid)

**Ansatz:** `_FRESHNESS_FILES` im pre-commit-Hook um die zwei fehlenden Dateien
ergänzen. Liste aus `Taskfile.yml freshness:check` ableiten, um Drift zu
verhindern.

**Vorteile:**
- Eine Zeile + ein Refactor.
- Kein neuer Hook, keine zusätzlichen Commits.
- Lokale Korrektur — keine CI-Änderung nötig.
- Vollständig rückwärtskompatibel.

**Nachteile:**
- Behebt nicht den `measured_at`-Drift, falls die Datei zwischen Pre-Commit und
  CI wirklich neu geschrieben wird (kann passieren, wenn der LOC-Count
  schwankt). Aktuell durch `countChanged = false` mitigiert, aber fragil.

### Option (b) — Post-Commit-Hook mit Amend

**Ansatz:** Neuer `.githooks/post-commit`-Hook, der `task freshness:regenerate`
erneut ausführt und bei Drift `git commit --amend --no-edit` triggert. Sentinel
gegen Endlosschleife.

**Vorteile:**
- Deckt **jede** Race-Quelle ab, nicht nur die hartkodierte Liste.
- Post-Commit-State ist per Definition fresh.

**Nachteile:**
- Amend triggert pre-commit erneut → Rekursion, braucht Sentinel.
- Magic für neue Entwickler, schlechter debuggbar.
- Race-Bedingung bleibt nur unvollständig adressiert, wenn der Sentinel
  schlecht gewählt ist.

### Option (c) — Hybrid

Kombination: Option (a) als primärer Fix, Option (b) als Safety-Net für
Edge-Cases (z. B. wenn der Hook skippt, weil `task` nicht installiert ist).

## Empfehlung

**Option (a) + Drift-Guard (BATS).** Begründung:

- Symptom (zwei spezifische Dateien fehlen in der Auto-Stage-Liste) ist
  chirurgisch adressierbar — fünf Zeilen Patch + Refactor.
- Die `measured_at`-Drift-Hypothese ist empirisch nicht reproduziert (siehe
  `check-loc-budget.mjs:222–238`: `countChanged = false` ⇒ kein Rewrite).
- Option (b) ist eine größere semantische Änderung, die einen Amend während
  eines Commits macht — historisch immer wieder Quelle für Edge-Case-Bugs.
- Ein Drift-Guard-BATS-Test, der die beiden Listen auf Parität prüft,
  verhindert künftige Regressionen (gleiche Bug-Klasse kann nicht mehr
  unbemerkt entstehen).

## Konkrete Umsetzung (Plan-Skizze)

### Geänderte Dateien

1. **`.githooks/pre-commit`**: `_FRESHNESS_FILES`-Array erweitern um:
   - `website/src/data/openspec-status.json`
   - `docs/code-quality/loc-budget.json`

   **Refactor:** Die hartkodierte Liste durch einen Wert ersetzen, der aus
   `Taskfile.yml` (`freshness:check` `FILES`-Variable) abgeleitet ist — als
   Drift-Guard. Konkret: ein Helper-Script `scripts/lib/freshness-files.sh`,
   das beide Listen via grep extrahiert, oder ein direkter Source der Liste
   aus `Taskfile.yml` (awk).

   **Trade-off:** Refactor ist groß (zieht grep-Parsing auf shell-Ebene
   nach sich), einfacher Patch ist klein. Empfehlung: **erst Patch, dann
   Refactor als Follow-up**, damit der Hotfix nicht von einer
   Refactor-Einführung blockiert wird.

2. **Neue BATS-Datei `tests/spec/pre-commit-freshness.bats`** mit Tests:
   - **Failing-Test (RED):** pre-commit `_FRESHNESS_FILES` enthält
     `openspec-status.json` und `loc-budget.json` NICHT (RED gegen main).
   - **Drift-Guard:** pre-commit-Liste ist Superset der
     `freshness:check`-Liste.
   - **Auto-Stage-Smoke:** wenn eine Datei aus `freshness:check` in der
     Working Tree aktualisiert wird, fängt pre-commit sie ein (smoke
     mit `git update-index --assume-unchanged` plus manuellem Touch).

## Acceptance Criteria

- [ ] `tests/spec/pre-commit-freshness.bats` ist rot gegen main
      (verifiziert das aktuelle Bug-Verhalten).
- [ ] Patch in `.githooks/pre-commit` bringt den Test auf grün.
- [ ] Drift-Guard-Test verhindert, dass die Auto-Stage-Liste je wieder
      driftet.
- [ ] Kein neuer CI-Schritt, keine neuen Hooks.
- [ ] `task test:changed`, `task freshness:regenerate`, `task freshness:check`
      bleiben grün.

## Non-Goals

- Den `measured_at`-Drift in `loc-budget.json` aktiv fixen (er ist aktuell
  nicht reproduzierbar; `countChanged = false` ⇒ kein Rewrite).
- Option (b) Post-Commit-Hook mit Amend (größere semantische Änderung,
  separates Ticket falls jemals nötig).
- Auto-Stage-Liste auf generische "alle geänderten JSON-Dateien" umstellen —
  zu breit, würde versehentlich User-edited JSONs einsammeln.

## Cross-References

- `AGENTS.md` — Freshness-Gate-Doku: `task freshness:check`,
  `task freshness:regenerate`.
- `Taskfile.yml:923–975` — Freshness-Definition.
- `.githooks/pre-commit` (aktuell, 69 Zeilen) — pre-commit-Hook.
- `openspec/specs/ci-cd.md:15–38` — `PR-Gate — Offline Tests`
  (Scenario: "PR mit veralteten generierten Artefakten schlägt fehl").
- `scripts/check-loc-budget.mjs:222–238` — `countChanged`-Logik.
- T001367 M1 (Mishap-Herkunft).
