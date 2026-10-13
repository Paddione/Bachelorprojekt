// Slot-Vorschlag für den plan-runner aus der Planform.
// TS-Mirror von scripts/llm/plan-runner/plan.mjs (maxFrontierWidth/autoSlots):
// gleiche Caps, gleiche Aufteilung (4B-Track füllt zuerst, vLLM nur für den
// Rest über der 4B-Kapazität). Bei Änderung dort hier spiegeln — der Runner
// bleibt die Single Source für das Live-Dispatch, dieses Modul versorgt nur
// die Leitstand-Anzeige.
export const MAX_4B_SLOTS = 3;
export const MAX_VLLM_SLOTS = 10;

export interface PlanPartial {
  id: string;
  dependsOn: string[];
}

// Minimales Manifest-Subset: Tabelle unter "## Partials"
// (id | plan | role | target_files | depends_on). Gleiche Zeilenregeln wie
// parseManifest im Runner (Header/Trennzeile überspringen).
export function parseManifestPartials(tasksMd: string): PlanPartial[] {
  const lines = String(tasksMd).split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Partials\s*$/.test(l.trim()));
  if (start < 0) throw new Error('manifest: section "## Partials" not found');
  const rows: PlanPartial[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2}\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    if (/^-+$/.test(cells[0].replace(/:/g, '')) || cells[0].toLowerCase() === 'id') continue;
    const [id, , , , deps = ''] = cells;
    if (!id) continue;
    rows.push({
      id,
      dependsOn: deps
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  if (!rows.length) throw new Error('manifest: "## Partials" has no rows');
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    for (const d of r.dependsOn) {
      if (!ids.has(d)) throw new Error(`manifest: partial ${r.id} depends on unknown partial ${d}`);
      if (d === r.id) throw new Error(`manifest: partial ${r.id} depends on itself`);
    }
  }
  return rows;
}

// Maximale Frontbreite des Abhängigkeits-DAGs (siehe plan.mjs).
export function maxFrontierWidth(partials: PlanPartial[]): number {
  const byId = Object.fromEntries(partials.map((p) => [p.id, p]));
  const done = new Set<string>();
  const remaining = new Set(partials.map((p) => p.id));
  let width = 0;
  while (remaining.size) {
    const ready = [...remaining].filter((id) => byId[id].dependsOn.every((d) => done.has(d)));
    if (!ready.length) throw new Error('auto-slots: dependency cycle detected');
    width = Math.max(width, ready.length);
    for (const id of ready) {
      remaining.delete(id);
      done.add(id);
    }
  }
  return width;
}

export interface SlotSuggestion {
  width: number;
  slots4b: number;
  slotsVllm: number;
}

export function autoSlots(partials: PlanPartial[]): SlotSuggestion {
  const width = maxFrontierWidth(partials);
  const slots4b = Math.min(Math.max(width, 1), MAX_4B_SLOTS);
  const slotsVllm = Math.min(Math.max(width - slots4b, 0), MAX_VLLM_SLOTS);
  return { width, slots4b, slotsVllm };
}
