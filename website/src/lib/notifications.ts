// website/src/lib/notifications.ts
import { getSiteSetting } from './website-db';
import { sendEmail } from './email';

type NotificationType = 'registration' | 'booking' | 'contact' | 'bug' | 'message' | 'followup';

const TYPE_DEFAULTS: Record<NotificationType, string> = {
  registration: 'true',
  booking:      'true',
  contact:      'true',
  bug:          'true',
  message:      'true',
  followup:     'false',
};

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
    fromName && fromAddress ? `"${fromName}" <${fromAddress}>` : undefined;

  await sendEmail({ to, subject: params.subject, text: params.text, html: params.html, replyTo: params.replyTo, from });
}
