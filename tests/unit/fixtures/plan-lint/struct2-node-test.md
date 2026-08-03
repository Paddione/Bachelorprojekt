---
title: Node Test Plan
ticket_id: T002616
domains: [infra]
status: active
---

# Node Test Plan Implementation Plan

**Goal:** RED-Step ueber node:test, das Framework fuer `.mjs` in diesem Repo.

Diese Fixture darf KEINEN anderen Runner-Namen enthalten, auch nicht in der Prosa:
STRUCT2 greppt die ganze Datei, also erfuellt schon die blosse Erwaehnung den Match
und macht den Test vakuos.

## File Structure

- Modify: `scripts/example.mjs`

## Task 1: Do the thing

**Files:**
- Modify: `scripts/example.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('example', () => { assert.equal(doThing(), 1) })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test scripts/example.test.mjs
# expected: FAIL (die Funktion existiert noch nicht)
```

## Task 2: Verify

- [ ] **Step 1: Run the full gate**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
