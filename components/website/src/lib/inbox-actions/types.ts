// components/website/src/lib/inbox-actions/types.ts
// Shared context for inbox action handlers (F3/A4: ADR-013-Muster — Router dünn,
// ein Handler pro Aktion). Reine Verschiebung, keine Logikänderung.
import type { UserSession } from '../auth';
import type { InboxItem } from '../messaging-db';

export interface InboxActionContext {
  session: UserSession;
  request: Request;
  requestLogger: import('pino').Logger;
  note?: string;
}

export type InboxActionHandler = (
  ctx: InboxActionContext,
  item: InboxItem,
  id: number,
) => Promise<Response>;
