// scripts/llm-proxy/fixups.mjs
// Benannte Request-Fixups. WICHTIG: Vor dem Abschalten des nicht-versionierten Alt-Proxys auf
// :18235 muss das exakte Umschreibe-Verhalten von bonsai-system-role-fixup gegen dessen laufende
// Instanz abgeglichen werden (Memo reference_ternary-bonsai-27b-test-server) — dieser Nachbau
// ist die zu verifizierende Referenz-Implementierung, nicht die bestätigte Quelle der Wahrheit.
const SYSTEM_MARKER = '[system]';

function bonsaiSystemRoleFixup(body) {
  if (!Array.isArray(body?.messages)) return body;
  const messages = body.messages.map((msg, i) => {
    if (i > 0 && msg.role === 'system') {
      return { ...msg, role: 'user', content: `${SYSTEM_MARKER} ${msg.content}` };
    }
    return msg;
  });
  return { ...body, messages };
}

export const FIXUPS = {
  'bonsai-system-role-fixup': bonsaiSystemRoleFixup,
};

/** @param {string[]} names @param {any} body */
export function applyFixups(names, body) {
  let out = body;
  for (const name of names || []) {
    const fn = FIXUPS[name];
    if (!fn) { console.warn(`[fixups] unknown fixup "${name}" — skipped`); continue; }
    out = fn(out);
  }
  return out;
}
