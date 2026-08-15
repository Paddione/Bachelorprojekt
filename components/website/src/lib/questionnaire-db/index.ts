// website/src/lib/questionnaire-db/index.ts
// Re-export compat layer. Existing imports of `'./questionnaire-db'` resolve
// here (see questionnaire-db.ts shim). Sibling modules: queries, scoring,
// schema, types.

export * from './types';
export * from './schema';
export * from './queries';
export * from './scoring';
