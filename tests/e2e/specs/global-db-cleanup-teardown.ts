// tests/e2e/specs/global-db-cleanup-teardown.ts
//
// Tiny shim so Playwright's `globalTeardown` config option can point at a
// file whose default export IS the teardown function. The actual logic lives
// in `./global-db-cleanup.ts`'s `teardown` named export — we import + re-
// expose it as default here to satisfy Playwright's "default export = the
// hook" contract for globalTeardown.

import { teardown } from './global-db-cleanup';

export default teardown;
