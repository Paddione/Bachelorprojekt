// Livestream-viewer seed: same as auth-only — the test creates a Keycloak
// user and lands them on the questionnaire page. Joining the livestream
// room is performed ad-hoc by the tester; no extra DB rows are needed.

import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const livestreamViewer: SeedFn = async (ctx) => {
  const base = await authOnly(ctx);
  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} (livestream room joined ad-hoc by tester)`,
  };
};

export default livestreamViewer;
