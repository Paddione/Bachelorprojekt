---
title: "G-RH02: TypeScript @ts-ignore in rechnungen.astro eliminieren"
ticket_id: T001105
domains: [website, frontend]
status: archived
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: ts-suppression-elimination (G-RH02)

## Why

Das Codebase-Health-Ziel **G-RH02** verlangt: 0 TypeScript-Suppressionen (`@ts-ignore`, `@ts-expect-error`, `as any`). Aktuell verbleibt **eine** Suppression in `website/src/pages/admin/rechnungen.astro:350`. Sie entstand durch eine Svelte-4→Svelte-5-Migration der Mount-API (`mount()`), bei der die Legacy-`RecordPaymentModal.svelte`-Komponente (`export let`-Syntax) nicht zum neuen `$props()`-Rune migriert wurde.

Suppressionen verbergen Typ-Mismatches, die bei zukünftigen Svelte-/TypeScript-Upgrades wieder auftauchen — ein technisches Schulden-Gate, das regelmäßig trippelt.

## What

- `website/src/components/admin/RecordPaymentModal.svelte` auf Svelte-5-`$props()`-Rune migrieren (empfohlen, saubere Typen)
- Fallback: minimalinvasiver `Component`-Typ-Cast in `rechnungen.astro` (nur wenn Diagnose Task 1 zeigt, dass `$props()`-Migration Overkill ist)
- `@ts-ignore` und `as any` aus dem mount()-Block entfernen
- `pnpm typecheck` Exit 0
- `grep -rn "@ts-ignore\|@ts-expect-error" website/src` → 0 Treffer

_Ticket: T001105_
