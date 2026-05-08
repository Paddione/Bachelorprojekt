import type { AssistantProfile, Nudge } from './types';

export interface TriggerEvalContext {
  userSub: string;
  currentRoute: string;
}

export interface TriggerDescriptor {
  id: string;
  profile: AssistantProfile;
  evaluate: (ctx: TriggerEvalContext) => Promise<Nudge | null>;
}

const registry = new Map<string, TriggerDescriptor>();

export function registerTrigger(descriptor: TriggerDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

export async function evaluateTriggers(
  profile: AssistantProfile,
  ctx: TriggerEvalContext,
): Promise<Nudge[]> {
  const out: Nudge[] = [];
  for (const t of registry.values()) {
    if (t.profile !== profile) continue;
    try {
      const n = await t.evaluate(ctx);
      if (n) out.push(n);
    } catch (err) {
      console.error(`[assistant.triggers] evaluator ${t.id} threw:`, err);
    }
  }
  return out;
}

// Test-only — DO NOT call from production code.
export function _resetTriggersForTest(): void {
  registry.clear();
}
