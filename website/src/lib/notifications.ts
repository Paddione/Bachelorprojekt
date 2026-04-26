// website/src/lib/notifications.ts
import { getSiteSetting } from './website-db';
import { sendEmail } from './email';

export type NotificationType = 'registration' | 'booking' | 'contact' | 'bug' | 'message' | 'followup' | 'staleness';

const TYPE_DEFAULTS: Record<NotificationType, string> = {
  registration: 'true',
  booking:      'true',
  contact:      'true',
  bug:          'true',
  message:      'true',
  followup:     'false',
  staleness:    'true',
};

const SITE_URL = process.env.SITE_URL ?? '';

function withInboxLink(html: string | undefined): string | undefined {
  if (!html || !SITE_URL) return html;
  const inboxUrl = `${SITE_URL}/admin/inbox`;
  return `${html}<p style="margin-top:20px"><a href="${inboxUrl}" style="display:inline-block;background:#7c6ff7;color:#fff;padding:10px 22px;border-radius:25px;text-decoration:none;font-weight:bold">Zur Inbox</a></p>`;
}

export async function sendAdminNotification(params: {
  type: NotificationType;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<void> {
  const brand = process.env.BRAND || 'mentolder';

  const [notifEmail, enabled, fromName, fromAddress] = await Promise.all([
    getSiteSetting(brand, 'notification_email'),
    getSiteSetting(brand, `notify_${params.type}`),
    getSiteSetting(brand, 'email_from_name'),
    getSiteSetting(brand, 'email_from_address'),
  ]);

  const to = notifEmail ?? process.env.CONTACT_EMAIL ?? '';
  if (!to) return;

  if ((enabled ?? TYPE_DEFAULTS[params.type]) === 'false') return;

  const from =
    fromName && fromAddress ? `"${fromName.replace(/"/g, "'")}" <${fromAddress}>` : undefined;

  const ok = await sendEmail({ to, subject: params.subject, text: params.text, html: withInboxLink(params.html), replyTo: params.replyTo, from });
  if (!ok) console.warn(`[notifications] sendEmail failed for type="${params.type}" to="${to}"`);
}
