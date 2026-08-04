// Coaching-project seed: extends auth-only with a `tickets.tickets` row of
// type='project', status='in_progress', is_test_data=true. Also inserts the
// linked `customers` row (FK target of tickets.customer_id).
//
// Adaptations:
//   - The plan SQL used `current_setting('app.brand_id', true)` for the
//     brand column. That GUC isn't set anywhere in this codebase; we read
//     `process.env.BRAND` (the same source the rest of the app uses, see
//     `pages/api/admin/bugs/list.ts`) with a 'mentolder' default.

import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const coachingProject: SeedFn = async (ctx) => {
  const base = await authOnly(ctx);

  const cust = await ctx.db.query(
    `INSERT INTO customers (name, email, keycloak_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET keycloak_user_id = EXCLUDED.keycloak_user_id
     RETURNING id`,
    [`[TEST] ${base.testUser.email}`, base.testUser.email, base.testUser.id],
  );
  const customerId = cust.rows[0].id;
  await ctx.track('customers', customerId);

  const brand = process.env.BRAND || 'mentolder';
  const t = await ctx.db.query(
    `INSERT INTO tickets.tickets
       (type, status, title, customer_id, brand, is_test_data)
     VALUES ('project', 'in_progress', '[TEST] Systemtest project', $1, $2, true)
     RETURNING id`,
    [customerId, brand],
  );
  await ctx.track('tickets.tickets', t.rows[0].id);

  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} + 1 customer + 1 in-progress project ticket`,
  };
};

export default coachingProject;
