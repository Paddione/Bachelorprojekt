# Proposal: plan-commit-scope-guard

## Why

**Mishap-Fakt (Symptom, belegt):** tasks.md für T004829 schrieb dem Implementer einen Commit mit
ungültigem Scope vor — `git commit -m "fix(openspec-embed): slug literal in embed_output_is_success match [T004829]"`
(`openspec/changes/archive/2026-08-14-openspec-embed-slug-pcre/tasks.md:90,95`). Der commit-msg-Hook
lehnte zur Commit-Zeit ab; der Fix musste als `fix(scripts): ...` committet werden.

**Ursache (Hypothese, verifiziert):** Es gibt kein frühes Gate, das Commit-Scope-Angaben in
Plan-Dateien gegen die gültige Scope-Liste prüft. Der früheste Validierungspunkt ist der
commit-msg-Hook — ZUR Commit-Zeit, also nachdem der Plan bereits befolgt wurde. Verifikation:

- `scripts/plan-lint.sh` (das Plan-Gate, C.3 im dev-flow) hat KEINE Regel für Commit-Scope-
  Vorschreibungen — Regel-Inventar: F1/F2/STRUCT1–3/P1/B1a/B1b/D1/D2/I1/T002453-C.
- Kein BATS-Guard in `tests/spec/` prüft Scope-Angaben in Plan-Dateien.

**Prior-Art-Suche (Schritt 0.7, T002829):**

- SSOT der Scope-Liste liegt zentral: `commitlint.config.cjs` → `NAMED_SCOPES` (14 Einträge),
  gelesen über `scripts/validate-commit-msg.sh scopes`. Ticket-Scopes (`^T\d{6}$`, Zeile 66) und
  Health-Goal-Scopes (`^G-[A-Z][A-Z0-9]+$`, Zeile 67) sind immer erlaubt
  (commitlint.config.cjs:98–99).
- Bestehende Guards decken ab: Commit-Zeit (`openspec/specs/ci-cd.md:702`), PR-Titel-Scope
  (`openspec/specs/ci-cd.md:2145` — `preflight-pr-scope.sh` validiert gegen dieselbe Liste),
  Hook-Ablehnungsmeldung (T003139 — `tests/spec/ci-cd/unknown-scope-names-source.bats`, prüft nur
  die Meldung des Hooks, nicht Pläne). KEINER deckt die Plan-Ebene ab.
- Die Entscheidung „Liste nicht aufweichen" (T002328 / `commit-scope-consolidation`, 2026-07-27:
  14 Scopes, `openspec` ist ausdrücklich Alias von `plans`) wird **beibehalten** — dieser Fix
  fügt keinen Scope hinzu, er validiert Pläne gegen die bestehende Liste. Der parallele Change
  `commit-scope-openspec` (T003139) verbessert nur die Hook-Meldung; kein Konflikt.

**Realitätsmessung (T002717)** — Vorkommen von `type(scope):` in Plan-Dateien, Stand gegen
`975b3295a` (2026-08-14):

```bash
# Aktive Pläne: 6 Vorkommen — 5 gültig, 1 absichtliches Negativ-Fixture
grep -rEon '\b(fix|feat|chore|docs|refactor|perf|test|ci|build)\s*\([a-z0-9-]+\)\s*:' openspec/changes/ --include='tasks.md' --include='proposal.md' --include='design.md' | grep -v '^openspec/changes/archive/'
#   cross-harness-plan-guardrails/design.md:126 chore(plans):   (gültig)
#   preflight-scope-multi-ticket/tasks.md:127    fix(scripts): (gültig)
#   e2e-hydration-timeout/tasks.md:262           fix(e2e):     (gültig)
#   commit-scope-openspec/tasks.md:78  printf 'chore(openspec): …' > /tmp/msg-t003139.txt  (FIXTURE)
# Archiv-Pläne: ~400 Vorkommen, davon viele historisch ungültige Scopes (openspec 40×,
# cockpit 24×, quality 20×, a11y 11× …) — vor/nach der Konsolidierung T002328
grep -rEho '\b(fix|feat|chore|docs|refactor|perf|test|ci|build)\s*\([a-z0-9-]+\)\s*:' openspec/changes/archive/ --include='tasks.md' | sed -E 's/^[a-z]+\(([^)]+)\):/\1/' | sort | uniq -c | sort -rn
```

## What

**Frühes Gate auf Plan-Ebene:** plan-lint Hard Rule `P2` + BATS-Guard (Rot-Grün) + Requirement
in der SSOT-Spec.

1. `scripts/plan-lint.sh` — neue Hard Rule `P2`: Jede `type(scope):`-Vorkommensform in der
   Plan-Datei (`tasks.md` und, im Partial-Modus, jede `tasks.d/*.md`) muss einen gültigen Scope
   verwenden. Gültig = `NAMED_SCOPES` aus `commitlint.config.cjs` (geladen über
   `scripts/validate-commit-msg.sh scopes`, keine Duplikation der Liste) ∪ Ticket-Scopes
   `^T\d{6}$` ∪ Health-Goal-Scopes `^G-[A-Z][A-Z0-9]+$` (die zwei REs als Konstanten, Verweis auf
   commitlint.config.cjs:66–67). Verstoß = HARD-Fail (Exit 1) mit Nennung des Scopes und der
   Zeile. **Dokumentierte Ausnahme:** Zeilen, die Test-Fixture-Eingaben erzeugen (Redirection in
   eine Datei, `>` — z. B. `printf 'chore(openspec): …' > /tmp/msg.txt`), sind bewusste
   Negativ-Eingaben für Hook-Tests und keine Commit-Vorschreibungen — sie lösen P2 nicht aus
   (belegt am einzigen aktiven Fall: `commit-scope-openspec/tasks.md:78`).
2. `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats` — BATS-Guard (Output-Verifikation
   T002448-M4: ruft `plan-lint.sh` auf Fixture-Pläne in `$BATS_TEST_TMPDIR`, prüft
   `$status`/`$output`). Kern: ungültiger Scope `fix(openspec-embed):` → Exit 1. Positiv-Anker
   (T002356-M1): gültige Scopes (`fix(scripts):`, Ticket-Scope, Health-Goal-Scope) → Exit 0;
   Fixture-Zeile → Exit 0 (kein Fehlalarm).
3. `openspec/specs/dev-flow-plan.md` — neues Requirement (Delta-Spec, Parent-Slug
   `dev-flow-plan`).
4. `website/src/data/test-inventory.json` — Regenerierung via `task test:inventory` (CI-Gate).

_Ticket: T004896_
