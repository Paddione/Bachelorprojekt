---
title: "plan-commit-scope-guard — Implementation Plan"
ticket_id: T004896
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-commit-scope-guard — Implementation Plan

_Ticket: T004896_

Plan-Anweisungen: Pläne dürfen nur gültige Commit-Scopes vorschreiben (Mishap T004896: T004829s
Plan schrieb fix mit Scope `openspec-embed` vor, der commit-msg-Hook lehnte zur Commit-Zeit ab). Dieser
Plan selbst ist P2-konform formuliert — der ungültige Scope-Name `openspec-embed` erscheint hier
nur ohne Conventional-Commit-Präfix; das Test-Fixture mit der vollen Form entsteht erst im
BATS-Test (keine Plan-Datei).

## File Structure

| Datei | Aktion |
|---|---|
| `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats` | neu — BATS-Guard (RED-Test, Task 1) |
| `scripts/plan-lint.sh` | ändern — Hard Rule P2 (Task 2) |
| `openspec/specs/dev-flow-plan.md` | ändern — Requirement wird beim Archive aus dem Delta-Spec gemergt (Task 3) |
| `website/src/data/test-inventory.json` | regenerieren via `task test:inventory` (Task 3) |

## Task 1 — RED: BATS-Guard anlegen

Neue Datei `tests/spec/dev-flow-plan/plan-commit-scope-guard.bats`. Muster und
Fixture-Technik: `tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats` — die Fixture-Pläne
werden im Test in `$BATS_TEST_TMPDIR` generiert, `scripts/plan-lint.sh` wird auf sie
ausgeführt, geprüft werden `$status` und `$output` (Prüfmodus: command output verification,
T002448-M4 — kein Source-Grep). Jeder Fixture-Plan erfüllt alle übrigen plan-lint Hard Rules
(Frontmatter, H1, File Structure, Task 1 mit echtem bats-Runner-Aufruf und `expected: FAIL`,
GREEN-Task, Verify-Task mit den drei `task test:*`-Kommandos), damit ein Fehlschlag nur aus der
fehlenden P2-Regel stammen kann.

Tests in der Datei:

1. **Kern (heute rot):** Fixture-Plan, dessen Task einen Commit mit dem ungültigen Scope
   `openspec-embed` vorschreibt (Subjektform `git commit -m "fix(…): …"`, wie in
   T004829s tasks.md:95). Erwartung: `plan-lint.sh` Exit 1, Ausgabe nennt den Scope.
   Heute liefert plan-lint Exit 0 — der Test ist rot, weil die P2-Regel fehlt.
2. **Positiv-Anker (T002356-M1):** Fixture-Plan mit gültigem Scope `scripts`
   (`git commit -m "fix(scripts): …"`) → Exit 0.
3. **Positiv-Anker:** Fixture-Plan mit Ticket-Scope `T004896` und Health-Goal-Scope
   `G-AGENTIC01` (immer erlaubt, commitlint.config.cjs:66–67) → Exit 0.
4. **Fixture-Ausnahme (kein Fehlalarm):** Fixture-Plan mit einer Zeile, die eine
   Hook-Test-Eingabe per Redirection erzeugt (`printf 'chore(openspec): …\n' > /tmp/msg.txt` —
   Muster aus `openspec/changes/commit-scope-openspec/tasks.md:78`) → Exit 0. Solche Zeilen
   sind bewusste Negativ-Eingaben für Hook-Tests, keine Commit-Vorschreibungen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-commit-scope-guard.bats
# expected: FAIL — Kern-Test 1 schlägt fehl, weil plan-lint P2 noch nicht kennt
```

## Task 2 — GREEN: P2-Hard-Rule in scripts/plan-lint.sh

1. Regel-Konstanten in der Konstanten-Sektion (bei Zeile 101–107): `P2_TYPES_RE` (die
   Conventional-Commit-Typen), `P2_TICKET_SCOPE_RE='^T[0-9]{6}$'` und
   `P2_HEALTH_SCOPE_RE='^G-[A-Z][A-Z0-9]+$'` mit Kommentar, dass sie zu
   `commitlint.config.cjs:66–67` passen müssen (dort: `^T\d{6}$`, `^G-[A-Z][A-Z0-9]+$`).
2. Helper `_plan_scope_violations <plan-file>`: extrahiert zeilenweise alle
   `type(scope):`-Vorkommen aus der GESAMTEN Datei (auch Code-Fences — der T004829-Fall
   stand in einem Fence). Ein Vorkommen ist gültig, wenn der Scope in der Ausgabe von
   `bash scripts/validate-commit-msg.sh scopes` steht (SSOT-Aufruf — die Liste wird NICHT
   dupliziert) oder Ticket-RE oder Health-RE matcht. Ausnahme: Zeile enthält eine
   Datei-Redirection `>` (Fixture-Erzeugung, z. B. `printf '…' > /tmp/msg.txt`) — dann
   überspringen.
3. Check-Block direkt nach dem P1-Block (bei Zeile ~370): für jeden Verstoß
   `hard "P2: Commit-Scope-Vorschreibung '<type>(<scope>):' in Zeile N — ungültiger Scope; gültige Scopes: bash scripts/validate-commit-msg.sh scopes"`.
4. `_print_rules()` (bei Zeile 109–126) um die P2-Zeile ergänzen, damit `plan-lint.sh --rules`
   die neue Hard Rule auflistet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan/plan-commit-scope-guard.bats
# expected: PASS — alle vier Tests grün (Kern jetzt durch P2, Anker unverändert)
bash scripts/plan-lint.sh openspec/changes/plan-commit-scope-guard/tasks.md
# expected: PASS — der eigene Plan ist P2-konform formuliert (Self-Check)
```

## Task 3 — SSOT-Spec und Test-Inventar

- Das Delta-Spec `openspec/changes/plan-commit-scope-guard/specs/dev-flow-plan.md` existiert
  bereits (Phase A). Beim `openspec.sh archive` wird das Requirement in die SSOT
  `openspec/specs/dev-flow-plan.md` gemergt — kein separates Edit nötig; der Merge-Vorgang
  wird im Verify-Task geprüft.
- Test-Inventar regenerieren und committen (CI-Gate: Abweichung von
  `website/src/data/test-inventory.json` failt `task test:inventory`):

```bash
task test:inventory
# erwartet: website/src/data/test-inventory.json enthält den neuen Eintrag
# für tests/spec/dev-flow-plan/plan-commit-scope-guard.bats
```

## Task 4 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Abschluss: `openspec.sh archive` mergt das Delta-Spec in die SSOT; die BATS-Guard-Datei und
das Requirement sind damit dauerhaft verankert.
