// components/website/src/lib/inbox-actions/approve-registration.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { createUser, sendPasswordResetEmail } from '../identity';
import { sendRegistrationApproved } from '../email';
import { upsertCustomer } from '../website-db';
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

export const approveRegistration: InboxActionHandler = async (ctx, item, id) => {
  const { session, request, requestLogger } = ctx;
  const p = item.payload as { email: string; firstName: string; lastName: string; phone?: string; company?: string };
  const fullName = `${p.firstName} ${p.lastName}`;

  const result = await createUser({ email: p.email, firstName: p.firstName, lastName: p.lastName, phone: p.phone, company: p.company });

  let userId = result.userId;

  // If user already exists (e.g. partial failure on prior attempt), look up the existing user
  // so we can still send the password reset and complete the approval.
  if (!result.success && result.error?.includes('bereits')) {
    const { listUsers } = await import('../identity');
    const allUsers = await listUsers();
    const existing = allUsers.find(u => u.email?.toLowerCase() === p.email.toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), { status: 500 });
    }
  } else if (!result.success || !userId) {
    return new Response(JSON.stringify({ error: `Keycloak-Fehler: ${result.error}` }), { status: 500 });
  }

  await sendPasswordResetEmail(userId);
  // Emails are best-effort — upsertCustomer and inbox update must still succeed
  sendRegistrationApproved(p.email, fullName, request).catch(err =>
    requestLogger.error({ err }, '[approve_registration] Failed to send approval email:')
  );
  await upsertCustomer({ name: fullName, email: p.email, phone: p.phone, company: p.company, keycloakUserId: userId });
  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true, message: `${fullName} freigeschaltet` }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
