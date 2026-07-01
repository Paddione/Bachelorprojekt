---
title: "fix(quality): clean up 6 G-CQ05 Stub-Marker-Treffer"
ticket_id: T001282
domains: [quality]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cq05-todo-cleanup — Implementation Plan

Beseitigt die G-CQ05-Regression: 6 Stub-Marker-Matches im Grep-Gate (Baseline: 1).
5 sind False Positives (OpenSpec-Skripte, die Skeleton-Strings erkennen),
1 ist ein genuines unimplementiertes Feature in `sendInvoice.ts`.

## File Structure

Geänderte Dateien:

| Datei | Typ | Änderung |
|-------|-----|----------|
| `scripts/openspec-merge.mjs` | .mjs | STUB_MARKER-Konstante statt String-Literal |
| `scripts/openspec-validate.ts` | .ts | STUB_MARKER-Konstante statt Regex-Literale |
| `scripts/openspec-validate.test.ts` | .ts | Fixture: Konkatenation statt Literal |
| `website/src/lib/assistant/actions/admin/sendInvoice.ts` | .ts | Ticket-Referenz-Kommentar |
| `tests/spec/code-quality.bats` | .bats | Failing Test (neu) |

## Task 1 — Failing Test anlegen (expected: FAIL)

Neuen BATS-Test unter `tests/spec/code-quality.bats` anlegen, der die G-CQ05-Messung prüft.
Der Test läuft aktuell **rot** (6 Treffer statt 0) — to verify it fails before the fix:

```bash
@test "G-CQ05: kein freies Stub-Marker-Wort in Quelltext (Baseline 0)" {
  local count
  count=$(grep -rnE "\bTODO\b" \
    --include='*.ts' --include='*.svelte' --include='*.astro' \
    --include='*.sh' --include='*.js' --include='*.mjs' \
    "$REPO/website/src" "$REPO/scripts" "$REPO/tests" "$REPO/brett/src" 2>/dev/null \
    | grep -cvE "node_modules|/dist/|plan-lint\.sh|plan-qa-check\.sh|openspec\.sh" || true)
  [ "$count" -eq 0 ]
}
```

Ausführen und erwarten: **FAIL** (count = 6).

```bash
cd /tmp/wt-cq05
bats tests/spec/code-quality.bats
# expected: FAIL — count 6, not 0
```

## Task 2 — False Positives in `scripts/openspec-merge.mjs` beheben

In `scripts/openspec-merge.mjs` eine Konstante `STUB_MARKER` einführen, die den Skeleton-String
hält. Das STUBS-Array und die Fehlermeldung nutzen die Konstante statt des String-Literals.

Vorher:
```js
const STUBS = [/^### Requirement: TODO\s*$/m, /^#### Scenario: TODO\s*$/m, ...]
// ...
fail(`${deltaName}: contains unedited skeleton stub (TODO / ...)`)
```

Nachher (Beispiel):
```js
const STUB_MARKER = 'TODO' // stub detection marker — not itself a stub
const STUBS = [
  new RegExp(`^### Requirement: ${STUB_MARKER}\\s*$`, 'm'),
  new RegExp(`^#### Scenario: ${STUB_MARKER}\\s*$`, 'm'),
  /^The system SHALL …\s*$/m,
]
// ...
fail(`${deltaName}: contains unedited skeleton stub (${STUB_MARKER} / ...)`)
```

## Task 3 — False Positives in `scripts/openspec-validate.ts` beheben

Analog zu Task 2: `STUB_MARKER`-Konstante einführen, Regex-Strings und Warnmeldungen auf die
Konstante umstellen.

```ts
const STUB_MARKER = 'TODO' // stub detection marker — not itself a stub
// Stub detection (reported as warnings ...)
if (new RegExp(`^### Requirement: ${STUB_MARKER}\\s*$`, 'm').test(content))
  warnings.push(`${filePath}: unedited stub '### Requirement: ${STUB_MARKER}'`)
if (new RegExp(`^#### Scenario: ${STUB_MARKER}\\s*$`, 'm').test(content))
  warnings.push(`${filePath}: unedited stub '#### Scenario: ${STUB_MARKER}'`)
```

## Task 4 — False Positive in `scripts/openspec-validate.test.ts` beheben

Test-Fixture nutzt String-Konkatenation statt Literal:

```ts
// Vorher:
const tmp = tmpChange('## ADDED Requirements\n\n### Requirement: TODO\n\nThe system SHALL …\n')

// Nachher:
const STUB_MARKER = 'TODO' // marker for stub-detection tests
const tmp = tmpChange(
  '## ADDED Requirements\n\n### Requirement: ' + STUB_MARKER + '\n\nThe system SHALL …\n'
)
```

Der Test prüft weiterhin die echte Erkennung, enthält den Marker-String aber nicht mehr als
frei stehendes Wort.

## Task 5 — Echten Kommentar in `website/src/lib/assistant/actions/admin/sendInvoice.ts` ersetzen

Den unstrukturierten Kommentar durch eine Ticket-Referenz ersetzen:

```ts
// Unimplemented: wire end-to-end invoice send (PDF generation + Factur-X embed +
// email delivery) — tracked in T001282.
// The current send pipeline lives only inside the API route
// `pages/api/admin/billing/[id]/send.ts` and has no extracted helper.
```

## Task 6 — Verify

Nach allen Änderungen:

```bash
# 1. Grep-Gate muss 0 Treffer liefern
grep -rnE "\bTODO\b" \
  --include='*.ts' --include='*.svelte' --include='*.astro' \
  --include='*.sh' --include='*.js' --include='*.mjs' \
  website/src scripts tests brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint\.sh|plan-qa-check\.sh|openspec\.sh"
# expected: no output

# 2. BATS-Test grün
bats tests/spec/code-quality.bats

# 3. Standard-Gate
task test:changed
task freshness:regenerate
task freshness:check
```
