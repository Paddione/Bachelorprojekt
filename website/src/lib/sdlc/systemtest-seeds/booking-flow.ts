// Booking-flow seed: extends auth-only with a draft booking (a `meetings`
// row) one week out, owned by a freshly-created `customers` row that is
// linked back to the Keycloak user.
//
// Adaptations:
//   - The plan referenced `bookings.bookings`. That table does NOT exist in
//     this codebase — bookings live as CalDAV entries plus `meetings` rows
//     for the talk-room/recording side. We use `meetings` here because it is
//     the closest real table that represents a scheduled appointment.
//   - `meetings.customer_id REFERENCES customers(id)` — we insert a
//     `customers` row first and track both fixtures.

import type { SeedFn } from '../systemtest/seed-context';
import authOnly from './auth-only';

const bookingFlow: SeedFn = async (ctx) => {
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

  const m = await ctx.db.query(
    `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, status)
     VALUES ($1, '[TEST] systemtest-booking', now() + interval '7 days', 'scheduled')
     RETURNING id`,
    [customerId],
  );
  await ctx.track('meetings', m.rows[0].id);

  return {
    ...base,
    fixturesSummary: `${base.fixturesSummary} + 1 customer + 1 scheduled meeting 1 week out`,
  };
};

export default bookingFlow;
