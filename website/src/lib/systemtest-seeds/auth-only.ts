// Auth-only seed: creates a Keycloak test user with a deterministic password,
// tracks the user in `questionnaire_test_fixtures` (table_name='keycloak.users'
// — Keycloak owns user accounts in this codebase, there is no `auth.users`
// SQL table), and mints a homegrown magic-link to the questionnaire URL.
//
// Tracked under `keycloak.users` rather than `auth.users` because the
// cleanup CronJob (Task 8) will dispatch on `table_name` and call
// `keycloak.deleteUser()` for these rows.

import type { SeedFn } from '../systemtest/seed-context';
import { setUserPassword } from '../keycloak';
import { mintMagicLink } from '../auth/magic-link';

const authOnly: SeedFn = async (ctx) => {
  const localPart = `test-${ctx.assignmentId.slice(0, 8)}-${ctx.attempt}`;
  const email = `${localPart}@systemtest.local`;
  // Deterministic password: stable across the same assignment so the admin
  // can fall back to interactive password login if the magic-link is broken.
  const password = `T3st!${ctx.assignmentId.slice(0, 8)}_${ctx.attempt}`;

  const created = await ctx.keycloak.createUser({
    email,
    firstName: 'Systemtest',
    lastName: localPart,
  });
  if (!created.success || !created.userId) {
    throw new Error(`Keycloak createUser failed: ${created.error ?? 'unknown error'}`);
  }
  const userId = created.userId;

  // Set the deterministic password and skip the "change on next login" prompt
  // so the test loop can sign in non-interactively.
  const passwordOk = await setUserPassword(userId, password, false);
  if (!passwordOk) {
    // Best-effort cleanup so we don't leak Keycloak users on partial failure.
    await ctx.keycloak.deleteUser(userId).catch(() => {});
    throw new Error('Keycloak setUserPassword failed');
  }

  await ctx.track('keycloak.users', userId);

  const magicLink = await mintMagicLink({
    keycloakUserId: userId,
    sessionUser: {
      sub: userId,
      email,
      name: `Systemtest ${localPart}`,
      preferred_username: email.toLowerCase(),
    },
    redirectUri: `/admin/fragebogen/${ctx.assignmentId}`,
  });

  return {
    testUser: { id: userId, email, password },
    magicLink,
    fixturesSummary: `1 test user created (role=${ctx.role})`,
  };
};

export default authOnly;
