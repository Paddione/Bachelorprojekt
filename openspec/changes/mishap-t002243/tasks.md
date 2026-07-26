---
title: "mishap-t002243 — Implementation Plan"
ticket_id: T002243
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002243 — Implementation Plan

_Ticket: T002243_

## Problem

`.claude/skills/references/plan-archive-steps.md` Schritt 3 zeigt nur
`bash scripts/openspec.sh archive "$SLUG"` ohne Erwähnung von `--create-new`.
Mishap-Bundles (per Definition querschnittlich, keine Parent-SSOT-Spec) laufen
damit in den Fail-Closed-Guard von `scripts/openspec-merge.mjs:83`:

```
ERROR: Target 'openspec/specs/mishap-t002240.md' does not exist. Point the delta
at an existing spec, or pass --create-new for a genuinely new component.
```

`--create-new` ist dokumentiert für die generische Delta-Spec-Konvention
(CLAUDE.md, T001304), aber nirgends explizit für den Mishap-Bundle-Fall.
6 Präzedenzfälle in `openspec/specs/archive/*mishap*.md` belegen den Weg,
ohne dass er in der Ausführungs-Referenz steht — jede Session muss ihn neu
per Archiv-Grep herleiten.

## Entscheidung: Fehlermeldung in scripts/openspec-merge.mjs

Die Fehlermeldung selbst liegt **nicht** in `scripts/openspec.sh`, sondern in
`scripts/openspec-merge.mjs:83` (`fail(\`Target '${ssotPath}' does not exist...\`)`).
`scripts/openspec.sh` ruft `openspec-merge.mjs` nur als Subprozess auf
(`_merge_delta()`, Zeile ~163).

Entscheidung: **Ja, Fehlermeldung ergänzen.** Begründung: die Meldung nennt
aktuell nur die generische Alternative (`--create-new` für "a genuinely new
component"), was bei einem Mishap-Bundle-Slug (`mishap-t00XXXX`) semantisch
falsch klingt — es ist keine neue *Komponente*, sondern ein Sammel-Ticket ohne
Domäne. Ein Hinweis direkt in der Meldung spart die Archiv-Recherche auch für
Sessions, die die Referenz-Doku nicht laden. Umsetzung: Meldung um einen
zweiten Satz erweitern, der den Mishap-Bundle-Fall explizit nennt, ohne die
bestehende generische Formulierung zu entfernen (Rückwärtskompatibilität für
den regulären "neue Komponente"-Fall).

## File Structure

```
.claude/skills/references/plan-archive-steps.md   # Schritt 3: --create-new-Hinweis für Mishap-Bundles ergänzen
scripts/openspec-merge.mjs                          # Zeile 83: fail()-Meldung um Mishap-Bundle-Hinweis erweitern
tests/spec/openspec-workflow.bats                   # neuer @test (Doku-Assertion, RED→GREEN)
```

## Tasks

- [ ] **RED — Failing-Test-Step.** In `tests/spec/openspec-workflow.bats` einen
      neuen `@test` ergänzen, der prüft, dass
      `.claude/skills/references/plan-archive-steps.md` sowohl den String
      `--create-new` als auch das Wort `mishap` enthält (aktuell: 0 Treffer
      für `--create-new` in der Datei → Test schlägt fehl).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
# expected: FAIL (red — der neue @test "T002243: plan-archive-steps.md
# documents --create-new for mishap bundles" schlägt fehl, weil die Referenz
# --create-new noch nicht erwähnt)
```

  Testkörper (in `tests/spec/openspec-workflow.bats` einzufügen, z.B. nach dem
  `T001389`-Block):

  ```bash
  @test "T002243: plan-archive-steps.md documents --create-new for mishap bundles" {
    local f="$REPO/.claude/skills/references/plan-archive-steps.md"
    [ -f "$f" ]
    grep -q -- '--create-new' "$f"
    grep -qi 'mishap' "$f"
  }
  ```

- [ ] **Fix-Step 1 (GREEN) — Referenz-Doku.** In
      `.claude/skills/references/plan-archive-steps.md` nach dem Code-Block
      von Schritt 3 (nach der Zeile `bash scripts/openspec.sh archive "$SLUG"`
      / `# Alternativ: task openspec:archive -- "$SLUG"`) einen Hinweisblock
      einfügen:

      ```
      > **Querschnittliche Changes ohne Parent-SSOT-Spec (insbesondere
      > Mishap-Bundles):** archivieren mit
      > `bash scripts/openspec.sh archive "$SLUG" --create-new`. Ohne das Flag
      > bricht `_merge_delta` in `openspec-merge.mjs` mit "Target '...' does
      > not exist" ab, weil ein Mishap-Bundle per Definition keine
      > Parent-SSOT-Spec hat. Die resultierende Spec `openspec/specs/$SLUG.md`
      > wandert bei der nächsten Archivierung durch `mv "$dir" "$dest"` nach
      > `openspec/specs/archive/` (analog zu den bestehenden
      > `openspec/specs/archive/*mishap*.md`-Präzedenzfällen).
      ```

- [ ] **Fix-Step 2 (GREEN) — Fehlermeldung.** In `scripts/openspec-merge.mjs`
      Zeile 83 die `fail(...)`-Meldung erweitern, sodass sie den
      Mishap-Bundle-Fall explizit nennt, z.B.:

      ```js
      fail(`Target '${ssotPath}' does not exist. Point the delta at an existing spec, or pass --create-new for a genuinely new component (e.g. a cross-cutting mishap bundle with no parent SSOT spec).`)
      ```

- [ ] **Re-run RED test (GREEN).** Denselben Testlauf wie im RED-Schritt
      wiederholen; erwartet jetzt PASS, weil `plan-archive-steps.md` sowohl
      `--create-new` als auch `mishap` enthält.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
```

## Verify (RED → GREEN)

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
