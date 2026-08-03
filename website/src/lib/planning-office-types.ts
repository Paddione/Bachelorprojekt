// website/src/lib/planning-office-types.ts
// Type-only re-exports from planning-office.ts. The runtime module pulls in
// `pg` + `dns` via website-db (server-only Node built-ins); a Svelte/Astro
// file that only needs the *types* must import them from here to keep the
// Vite client-side resolver from walking planning-office.ts and emitting
// "externalized for browser" warnings (and worse, from accidentally bundling
// server code into the client if a future refactor swaps `import type` for a
// runtime import).
//
// Runtime functions (officeCount, listOffice, createIdea, …) stay in
// planning-office.ts — this file intentionally has zero runtime code.

export interface TriageSuggestion {
  type: string;
  priority: string;
  severity: string;
  areas: string[];
  component: string | null;
  assignee_suggested: string;
  rationale: string;
  model: string;
  at: string;
}

// DOR_KEYS is a client-safe constant — it's used by Svelte components to render
// the readiness checklist. The runtime planning-office.ts file imports it
// from here to stay in sync.
export const DOR_KEYS = [
  'spec_skizziert', 'offene_fragen_geklaert', 'abhaengigkeiten_klar', 'aufwand_geschaetzt',
] as const;
export type DorKey = (typeof DOR_KEYS)[number];
export type Readiness = Partial<Record<DorKey, boolean>>;
