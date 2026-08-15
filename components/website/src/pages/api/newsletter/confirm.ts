import type { APIRoute } from 'astro';
import { getSubscriberByConfirmToken, confirmSubscriber } from '../../../lib/newsletter-db';

export const GET: APIRoute = async ({ url, redirect }) => {
  const token = url.searchParams.get('token') ?? '';
  if (!token) return redirect('/newsletter/token-ungueltig');

  const subscriber = await getSubscriberByConfirmToken(token);
  if (!subscriber) return redirect('/newsletter/token-ungueltig');

  if (subscriber.status === 'confirmed') return redirect('/newsletter/bestaetigt');

  if (subscriber.token_expires_at && subscriber.token_expires_at < new Date()) {
    return redirect('/newsletter/token-ungueltig');
  }

  await confirmSubscriber(subscriber.id);
  return redirect('/newsletter/bestaetigt');
};
