// events.mjs — Ereignisstrom des plan-runners (walkie-dispatch-flow p6): eine JSONL-Zeile je Ereignis,
// damit die Bridge (agent-board) Fortschritt, Eskalation, Budget- und Owner-Pausen ansagen kann.
// Zeile: { ts, type, partial, tier, harness, costUsd, spentUsd, detail } (fehlende Felder = null).
// Schreibfehler stoppen den Lauf nicht (einmalige Warnung auf stderr): der Strom ist Beobachtung,
// der Zustand liegt in state.json.
// Aufrufer: scripts/llm/plan-runner.mjs. Runbook: docs/runbooks/plan-runner.md.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const EVENT_TYPES = [
  'partial_started', 'partial_done', 'partial_failed', 'escalated', 'budget_paused', 'owner_paused', 'run_done',
];

// Liefert emit(event); hängt eine JSON-Zeile an `file` an (Verzeichnis wird angelegt).
export function makeEmitter(file) {
  let warned = false;
  return function emit(e) {
    if (!EVENT_TYPES.includes(e?.type)) throw new Error(`events: unknown event type ${e?.type}`);
    const line = {
      ts: new Date().toISOString(),
      type: e.type,
      partial: e.partial ?? null,
      tier: e.tier ?? null,
      harness: e.harness ?? null,
      costUsd: e.costUsd ?? null,
      spentUsd: e.spentUsd ?? null,
      detail: e.detail ?? null,
    };
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${JSON.stringify(line)}\n`);
    } catch (err) {
      if (!warned) {
        warned = true;
        process.stderr.write(`[plan-runner] events: cannot write ${file}: ${err.message}\n`);
      }
    }
    return line;
  };
}
