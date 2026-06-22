---
title: "G-RH02: TypeScript @ts-ignore in rechnungen.astro eliminieren"
ticket_id: T001105
domains: [website, frontend]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: ts-suppression-elimination (T001105)

- [ ] Task 0: Failing-Test schreiben — BATS `tests/spec/ts-suppression.bats` (RED)
- [ ] Task 1: Diagnose — Was genau verursacht den @ts-ignore?
- [ ] Task 2: Fix anwenden ($props()-Migration oder Typ-Assertion)
- [ ] Task 3: TypeCheck, Vitest, Browser-Smoke, Commit & Push

---

# G-RH02: TypeScript-Suppressionen eliminieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans

**Goal:** Das letzte `// @ts-ignore` im Codebase (`website/src/pages/admin/rechnungen.astro:350`) durch sauberen TypeScript-Typ-Cast oder `$props()`-Migration ersetzen, G-RH02 auf 0.

**Architecture:** `RecordPaymentModal.svelte` nutzt die Svelte-4-Syntax (`export let`). `rechnungen.astro` mountet diese Komponente via Svelte-5-`mount()`. Der `@ts-ignore` unterdrückt einen Typ-Mismatch zwischen Legacy-Props und neuem `mount()`-API. Fix: Komponente auf Svelte-5-`$props()`-Rune migrieren (empfohlen) ODER korrekte `ComponentType`-Typ-Assertion (minimalinvasiv).

**Tech Stack:** Svelte 5.56+, TypeScript, Astro, `website/`.

## Global Constraints

- Svelte: `^5.56.3`, `@astrojs/svelte: ^8.1.1`, `@sveltejs/vite-plugin-svelte: ^6.2.4` — kein Upgrade
- `RecordPaymentModal.svelte` muss die gleichen Props akzeptieren (`invoiceId`, `invoiceNumber`, `outstanding`, `onClose`, `onSaved`) — kein API-Bruch
- Kein `@ts-ignore`, kein `@ts-expect-error` nach Fix
- Kein `as any` nach Fix (Ziel: saubere Typen)
- `pnpm typecheck` muss Exit 0 nach Fix

---

## File Structure

```
website/src/components/admin/RecordPaymentModal.svelte   ← MODIFY: $props()-Migration (Option A)
website/src/pages/admin/rechnungen.astro                 ← MODIFY: mount()-Aufruf bereinigen
tests/spec/ts-suppression.bats                            ← NEU: BATS-Test (RED → GREEN)
```

---

## Task 0: Failing-Test schreiben (RED)

**Files:**
- Create: `tests/spec/ts-suppression.bats`

**Interfaces:**
- Konsumiert: aktueller Source (mit @ts-ignore)
- Produziert: BATS-Datei, die `@ts-ignore`/`@ts-expect-error` in `website/src` zählt und **scheitern** muss, solange welche existieren

### Step 1: BATS-Datei anlegen

```bash
cat > /tmp/wt-ts-suppression-elimination/tests/spec/ts-suppression.bats <<'BATS'
#!/usr/bin/env bats
# SSOT: openspec/changes/ts-suppression-elimination/proposal.md
# G-RH02: keine TypeScript-Suppressionen in website/src

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH02: keine @ts-ignore in website/src" {
  count=$(grep -rn "@ts-ignore" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}

@test "G-RH02: keine @ts-expect-error in website/src" {
  count=$(grep -rn "@ts-expect-error" "$REPO_ROOT/website/src" \
    --include="*.ts" --include="*.svelte" --include="*.astro" \
    --exclude-dir=node_modules 2>/dev/null | wc -l)
  [ "$count" -eq 0 ]
}
BATS
```

### Step 2: Test laufen lassen — RED erwarten

```bash
cd /tmp/wt-ts-suppression-elimination
bats tests/spec/ts-suppression.bats
```

**Expected fail:** Beide Tests scheitern, weil in `rechnungen.astro` aktuell ein `@ts-ignore` steht. Erst nach Task 2 (Fix) werden sie grün.

---

## Task 1: Diagnose — Was genau verursacht den @ts-ignore?

**Files:**
- Read: `website/src/pages/admin/rechnungen.astro:342-365`
- Read: `website/src/components/admin/RecordPaymentModal.svelte:1-10`

### Step 1: Aktuelle Fehlermeldung ohne @ts-ignore sehen

```bash
cd website
grep -n "ts-ignore\|as any" src/pages/admin/rechnungen.astro
```

Dann temporär beide Zeilen auskommentieren:

```bash
pnpm run check 2>&1 | grep -A 5 "rechnungen"
```

Notiere die konkrete TypeScript-Fehlermeldung.

### Step 2: Svelte 5 mount() TypeScript-Signatur prüfen

```bash
cat website/node_modules/svelte/types/index.d.ts | grep -A 10 "^export declare function mount"
```

Notiere die genaue Signatur von `mount<Props, Exports>`.

---

## Task 2: Fix anwenden

**Empfehlung:** Option A (saubere Typen via `$props()`-Rune). Option B nur wenn Diagnose Task 1 zeigt, dass Cast reicht.

### Option A — `$props()` Migration (empfohlen)

**Files:**
- Modify: `website/src/components/admin/RecordPaymentModal.svelte`
- Modify: `website/src/pages/admin/rechnungen.astro`

#### Step 1: RecordPaymentModal.svelte auf $props() migrieren

Ersetze in `website/src/components/admin/RecordPaymentModal.svelte` die ersten Zeilen:

**Vorher:**
```svelte
<script lang="ts">
  export let invoiceId: string;
  export let invoiceNumber: string;
  export let outstanding: number;
  export let onClose: () => void;
  export let onSaved: () => void;
```

**Nachher:**
```svelte
<script lang="ts">
  const { invoiceId, invoiceNumber, outstanding, onClose, onSaved } = $props<{
    invoiceId: string;
    invoiceNumber: string;
    outstanding: number;
    onClose: () => void;
    onSaved: () => void;
  }>();
```

#### Step 2: rechnungen.astro mount()-Aufruf bereinigen

Ersetze in `website/src/pages/admin/rechnungen.astro` (Zeilen ca. 342–362):

**Vorher:**
```typescript
  const Component = RecordPaymentModal as any;
  // @ts-ignore
  const app = mount(Component, {
    target: targetEl,
    props: {
      invoiceId: btn.dataset.invoiceId!,
      invoiceNumber: btn.dataset.invoiceNumber!,
      outstanding: Number(btn.dataset.outstanding!),
      onClose: () => unmount(app),
      onSaved: () => { unmount(app); window.location.reload(); },
    },
  });
```

**Nachher:**
```typescript
  const app = mount(RecordPaymentModal, {
    target: targetEl,
    props: {
      invoiceId: btn.dataset.invoiceId!,
      invoiceNumber: btn.dataset.invoiceNumber!,
      outstanding: Number(btn.dataset.outstanding!),
      onClose: () => unmount(app),
      onSaved: () => { unmount(app); window.location.reload(); },
    },
  });
```

#### Step 3: TypeCheck

```bash
cd website
pnpm run check 2>&1 | grep -c "error" || echo "no errors"
```

Erwartung: 0 Fehler in `rechnungen.astro` und `RecordPaymentModal.svelte`.

### Option B — Minimalinvasiver Typ-Cast (Fallback)

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro`

#### Step 1: Cast einfügen

**Vorher:**
```typescript
  const Component = RecordPaymentModal as any;
  // @ts-ignore
  const app = mount(Component, {
```

**Nachher:**
```typescript
  import type { Component } from 'svelte';
  // ...
  const app = mount(RecordPaymentModal as unknown as Component, {
```

Falls `Component` nicht passt, `SvelteComponent` versuchen:
```typescript
  import type { SvelteComponent } from 'svelte';
  const app = mount(RecordPaymentModal as unknown as typeof SvelteComponent, {
```

#### Step 2: TypeCheck

```bash
cd website
pnpm run check 2>&1 | grep -c "error TS" || echo "no errors"
```

Erwartung: 0 Fehler.

---

## Task 3: Verifizieren und committen

**Files:**
- Modified: `website/src/components/admin/RecordPaymentModal.svelte` (Option A) oder nur `rechnungen.astro` (Option B)

### Step 1: Sicherstellen dass kein @ts-ignore mehr vorhanden

```bash
grep -rn "@ts-ignore\|@ts-expect-error" website/src \
  --include="*.ts" --include="*.svelte" --include="*.astro" \
  --exclude-dir=node_modules
```

Erwartung: Keine Ausgabe (0 Treffer).

### Step 2: Funktionstest im Browser (optional, empfohlen)

1. `cd website && pnpm dev`
2. `http://localhost:4321/admin/rechnungen` öffnen
3. Den "Zahlung erfassen"-Button bei einer offenen Rechnung klicken
4. Modal muss erscheinen und funktionieren

### Step 3: Vitest-Tests prüfen

```bash
cd website && pnpm test run 2>&1 | tail -20
```

Erwartung: keine neuen Fehler.

### Step 4: Commit und Push

```bash
cd /tmp/wt-ts-suppression-elimination
git add website/src/pages/admin/rechnungen.astro
# Wenn Option A:
git add website/src/components/admin/RecordPaymentModal.svelte

git commit -m "fix(website): entferne @ts-ignore in rechnungen.astro — Svelte-5-kompatible Typ-Assertion [T001105]"

git push -u origin fix/ts-suppression-elimination
```

### Step 5: PR erstellen & Auto-Merge

```bash
gh pr create \
  --title "fix(website): entferne letztes @ts-ignore in rechnungen.astro [T001105]" \
  --base main \
  --body "Behebt die letzte TypeScript-Suppression. G-RH02: 1→0."
gh pr merge --auto --squash --delete-branch
```

### Step 6: Ticket abschließen

```bash
cd /tmp/wt-ts-suppression-elimination
./scripts/ticket.sh add-pr-link --id T001105 --pr <PR-NUMMER>
./scripts/vda.sh ticket update-status --id T001105 --status qa_review
./scripts/ticket.sh add-comment --id T001105 --body "PR #<N> merged. G-RH02 = 0."
```

---

## Final Verification (CI-Äquivalent)

```bash
cd /tmp/wt-ts-suppression-elimination
task workspace:validate        # Kustomize dry-run
task test:changed              # smart test selection
task freshness:regenerate      # updated generated artifacts
task freshness:check           # CI-Äquivalent inkl. S1–S4-Ratchet
```
