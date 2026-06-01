// website/src/lib/prompt-insert.ts
// Shared, browser-side helpers for the "Vorlage einfügen" (insert prompt
// template) dropdown rendered in MessagePanel.svelte and ChatRoomPanel.svelte.
//
// Kept framework-free so the load/insert/usage logic is unit-testable without a
// Svelte component test harness (the repo has no @testing-library/svelte / svelte
// vitest plugin; DB layers and pure helpers are the established test surface).

export interface PromptOption {
  id: number;
  title: string;
  body: string;
}

/**
 * Compute the new compose-box value after inserting a template body. Appends
 * to any existing draft on its own line so the admin can prepend a greeting and
 * then drop in a canned block. A whitespace-only draft is treated as empty.
 */
export function insertPromptBody(draft: string, body: string): string {
  const base = draft.replace(/\s+$/, '');
  return base ? `${base}\n${body}` : body;
}

/**
 * Fetch the active prompts for the current brand. The API scopes by brand
 * server-side via process.env.BRAND, so the client just calls the list
 * endpoint. Fails soft to an empty list — the dropdown simply shows nothing.
 */
export async function loadActivePrompts(): Promise<PromptOption[]> {
  try {
    const res = await fetch('/api/admin/prompt-library');
    if (!res.ok) return [];
    const data = (await res.json()) as { prompts?: PromptOption[] };
    return data.prompts ?? [];
  } catch {
    return [];
  }
}

/**
 * Best-effort usage tracking — bumps usage_count so popular templates can
 * surface first. Never throws: a failed POST must not block sending a message.
 */
export async function recordPromptUse(id: number): Promise<void> {
  try {
    await fetch(`/api/admin/prompt-library/${id}/use`, { method: 'POST' });
  } catch {
    /* best-effort: ignore */
  }
}
