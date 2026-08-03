// Synthetic cockpit bucket ids — shared by the server (cockpit-db) and the
// client Svelte components. Kept in their own module so the components can
// reference them WITHOUT importing cockpit-db (which pulls in `pg` and would
// break the browser bundle).
//
// - ALL_TICKETS: flat view over every task/bug leaf of a brand, regardless of
//   feature linkage. The PM's "see all my tickets" entry point.
// - NO_FEATURE:  parentless task/bug leaves only (T000848). A subset of
//   ALL_TICKETS — only surfaced when it is a genuine subset.
// - NO_PRODUCT:  parentless features (containers without a project).
export const ALL_TICKETS_ID = '__all_tickets__';
export const NO_FEATURE_ID = '__no_feature__';
export const NO_PRODUCT_ID = '__no_product__';
