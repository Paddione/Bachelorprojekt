import type { AssistantProfile, ActionResult } from './types';
import { getCustomerByKeycloakId } from '../website-db';

export interface ActionContext {
  profile: AssistantProfile;
  userSub: string;
  preferredUsername?: string;
  email?: string;
  payload: Record<string, unknown>;
}

export interface ActionDescriptor {
  id: string;
  allowedProfiles: AssistantProfile[];
  describe: (payload: Record<string, unknown>) => { targetLabel: string; summary: string };
  handler: (ctx: ActionContext) => Promise<ActionResult>;
}

const registry = new Map<string, ActionDescriptor>();

export function registerAction(descriptor: ActionDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export function listActionsFor(profile: AssistantProfile): ActionDescriptor[] {
  return [...registry.values()].filter((a) => a.allowedProfiles.includes(profile));
}

export async function executeAction(
  actionId: string,
  ctx: ActionContext,
): Promise<ActionResult> {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  if (!descriptor.allowedProfiles.includes(ctx.profile)) {
    throw new Error(`action ${actionId} not allowed for profile ${ctx.profile}`);
  }

  // Fill ctx.email via DB lookup when not already provided (portal profile only)
  if (ctx.profile === 'portal' && !ctx.email && ctx.userSub) {
    try {
      const customer = await getCustomerByKeycloakId(ctx.userSub);
      if (customer) ctx = { ...ctx, email: customer.email };
    } catch {
      // Non-fatal: action runs without email (handler must guard)
    }
  }

  return descriptor.handler(ctx);
}

export function describeAction(actionId: string, payload: Record<string, unknown>) {
  const descriptor = registry.get(actionId);
  if (!descriptor) throw new Error(`unknown action: ${actionId}`);
  return { id: actionId, ...descriptor.describe(payload) };
}
