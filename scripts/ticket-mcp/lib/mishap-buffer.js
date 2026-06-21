import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
export const DEFAULT_BUFFER_PATH = path.join(REPO_ROOT, '.git', 'mishap-buffer.json');

export function readBuffer(bufferPath = DEFAULT_BUFFER_PATH) {
  try {
    return JSON.parse(readFileSync(bufferPath, 'utf8'));
  } catch {
    return [];
  }
}

export function writeBuffer(entries, bufferPath = DEFAULT_BUFFER_PATH) {
  writeFileSync(bufferPath, JSON.stringify(entries, null, 2), 'utf8');
}

export function classifyBundle(entries) {
  const hasCritical = entries.some(e => e.type === 'broken' || e.type === 'security');
  const severity = hasCritical ? 'major' : 'minor';
  const priority = hasCritical ? 'hoch' : 'mittel';

  const components = [...new Set(entries.map(e => e.component).filter(Boolean))];
  const areas = components.join(',');

  const title = `Mishap-Bundle: ${components.join(', ')} (${entries.length} Einträge)`;

  const description = entries.map((e, i) =>
    `### Mishap ${i + 1}: ${e.title}\n**Typ:** ${e.type} | **Komponente:** ${e.component}\n\n${e.description}`
  ).join('\n\n---\n\n');

  return { title, description, severity, priority, areas };
}
