// Types shared by the system-test seed modules and the seed endpoint.
//
// Each seed module receives a SeedContext bound to a single PG transaction
// (`db`) and returns a SeedResult containing the test user, magic-link, and
// a human-readable fixtures summary. Seed modules MUST call `ctx.track()`
// for every persistent fixture they create so the cleanup CronJob (Task 8)
// can purge them later.
//
// Adaptations from the original plan:
//   - The plan's KeycloakAdminClient included `mintActionToken`, which does
//     not exist in `lib/keycloak.ts`. We drop that abstraction here — seed
//     modules import directly from `../keycloak` (createUser/deleteUser) and
//     mint magic-links via the homegrown `auth/magic-link` table-based flow.
//   - role enum is widened to match the existing `test_role` column values
//     (`admin` | `user`) plus the broader plan vocabulary; modules may treat
//     anything other than `admin` as a customer-shaped role.
import type { PoolClient } from 'pg';
import type { CreateUserParams } from '../keycloak';

export type SeedRole = 'admin' | 'coach' | 'customer' | 'guest' | 'user';

/** Subset of `lib/keycloak` re-exposed via SeedContext so seed modules can
 *  call into the same admin API the rest of the website uses. We keep the
 *  shape minimal — anything else seed modules need they import directly. */
export interface SeedKeycloakClient {
  createUser(params: CreateUserParams): Promise<{ success: boolean; userId?: string; error?: string }>;
  deleteUser(userId: string): Promise<boolean>;
}

export interface SeedContext {
  assignmentId: string;
  questionId: string;
  attempt: number;
  role: SeedRole;
  /** Open PG transaction. All inserts go through this client so they roll
   *  back on failure. */
  db: PoolClient;
  keycloak: SeedKeycloakClient;
  /** Records a row in `questionnaire_test_fixtures` so the cleanup CronJob
   *  can purge it later. The seed module is responsible for inserting the
   *  fixture row itself with whatever marker columns exist on the target
   *  table (e.g. `is_test_data=true` if the column was added in Task 2). */
  track(table: string, rowId: string): Promise<void>;
}

export interface SeedResult {
  testUser: { id: string; email: string; password: string };
  magicLink: string;
  fixturesSummary: string;
}

export type SeedFn = (ctx: SeedContext) => Promise<SeedResult>;
