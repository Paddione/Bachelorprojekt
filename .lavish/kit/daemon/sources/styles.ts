// sources/styles.ts — Stil-Datenbank lesen (K9, T002468)
//
// Getrennt von routes/styles.ts, damit Tests die Logik importieren koennen:
// der Daemon zieht `hono`, das in keiner package.json des Repos deklariert ist
// (er wird ad hoc per `npx tsx` gestartet). Gleiches Muster wie sources/epics.ts.
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StyleEntry {
  id: string;
  name: string;
  zweck: string;
  herkunft: { projekt: string; datei: string; zeile?: number };
  tags?: string[];
}

export interface StyleEntryFull extends StyleEntry {
  beleg_ausschnitt: string;
  token_bezuege: string[];
}

/**
 * Wo die Stil-Datenbank liegt.
 *
 * Bewusst NICHT ueber process.cwd(): der Daemon wird aus verschiedenen
 * Verzeichnissen gestartet, und ein falsches cwd liefert dann stumm eine leere
 * Sammlung statt eines Fehlers. Der Pfad relativ zur Moduldatei zeigt immer auf
 * den Checkout, aus dem dieser Code stammt — auch im Worktree.
 *
 * STYLES_DIR bleibt als Override fuer Tests und abweichende Layouts.
 */
export function stylesDir(): string {
  if (process.env.STYLES_DIR) return resolve(process.env.STYLES_DIR);
  // .lavish/kit/daemon/sources/ -> .lavish/styles/
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'styles');
}

/**
 * Liest das Verzeichnis. Wirft bei fehlender oder kaputter Quelle — der
 * Handler macht daraus ein `error`-Feld (D13). Eine leere Sammlung waere hier
 * die falsche Antwort: sie ist von "Datei nicht lesbar" nicht zu unterscheiden.
 */
export async function readIndex(dir = stylesDir()): Promise<StyleEntry[]> {
  const raw = await readFile(join(dir, 'index.json'), 'utf8');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('index.json ist kein gueltiges JSON');
  }
  if (!Array.isArray(parsed?.entries)) {
    throw new Error('index.json hat kein entries-Array');
  }
  return parsed.entries as StyleEntry[];
}

/** Dateinamen aller Eintraege — alles ausser Schema und Index. */
export async function listEntryFiles(dir = stylesDir()): Promise<string[]> {
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith('.json') && f !== 'schema.json' && f !== 'index.json')
    .sort();
}

/**
 * Liest die vollstaendigen Eintraege inklusive Beleg-Ausschnitt und
 * Token-Bezuegen. Das ist, was ein Modell braucht: der Index allein nennt nur
 * Zweck und Herkunft.
 */
export async function readEntries(dir = stylesDir()): Promise<StyleEntryFull[]> {
  const files = await listEntryFiles(dir);
  const entries: StyleEntryFull[] = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8');
    try {
      entries.push(JSON.parse(raw) as StyleEntryFull);
    } catch {
      throw new Error(`${file} ist kein gueltiges JSON`);
    }
  }
  return entries;
}

/**
 * Meldet Eintraege, die im Verzeichnis fehlen, und Verzeichniseintraege ohne
 * Datei. D14 Regel 3 verlangt den Verzeichniseintrag — ein Eintrag, der nur als
 * Datei existiert, ist fuer die Modelle unsichtbar, und einer, der nur im Index
 * steht, laesst sich nicht laden.
 */
export function indexDrift(
  index: StyleEntry[],
  entries: StyleEntryFull[],
): { missingInIndex: string[]; missingAsFile: string[] } {
  const indexIds = new Set(index.map((e) => e.id));
  const fileIds = new Set(entries.map((e) => e.id));
  return {
    missingInIndex: [...fileIds].filter((id) => !indexIds.has(id)),
    missingAsFile: [...indexIds].filter((id) => !fileIds.has(id)),
  };
}
