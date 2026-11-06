// Ports facade — admin-policy seam. External callers (scripts/*) import
// website admin policy ONLY through here. Re-export only: no behavior change.
export type { AdminPolicy } from '../auth';
export { DefaultAdminPolicy, isAdmin } from '../auth';
