// tests/unit/cockpit-styles.test.ts
// Ticket: T002468 — K9 Stil-Datenbank
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
// lesen die echte Stil-Datenbank von der Platte und pruefen, WAS zurueckkommt.
// Fuer die Fehlerpfade wird ein leeres bzw. kaputtes Verzeichnis angelegt und
// das tatsaechliche Verhalten gemessen — kein grep nach try/catch im Quelltext.
//
// Bewusst KEIN Import von server.ts oder routes/styles.ts: der Daemon zieht
// `hono`, das in keiner package.json des Repos deklariert ist (siehe
// cockpit-daemon-injection.test.ts). Geprueft wird die Leseschicht; die
// Route-Ebene deckt tests/spec/sdlc-cockpit/k9-stil-datenbank.bats ab.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  readIndex,
  readEntries,
  listEntryFiles,
  indexDrift,
  stylesDir,
} from '../../.lavish/kit/daemon/sources/styles';

const REAL_DIR = resolve(__dirname, '../../.lavish/styles');

describe('Die echte Stil-Datenbank', () => {
  it('POSITIV-ANKER: liefert mindestens zwei vollstaendige Eintraege', async () => {
    const entries = await readEntries(REAL_DIR);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e.id, 'id').toBeTruthy();
      expect(e.zweck, `zweck von ${e.id}`).toBeTruthy();
      expect(e.beleg_ausschnitt, `beleg von ${e.id}`).toBeTruthy();
      expect(e.token_bezuege.length, `tokens von ${e.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('Verzeichnis und Dateien decken sich (D14 Regel 3)', async () => {
    const [index, entries] = await Promise.all([readIndex(REAL_DIR), readEntries(REAL_DIR)]);
    const drift = indexDrift(index, entries);
    expect(drift.missingInIndex, 'Datei ohne Verzeichniseintrag').toEqual([]);
    expect(drift.missingAsFile, 'Verzeichniseintrag ohne Datei').toEqual([]);
  });

  it('zaehlt schema.json und index.json nicht als Eintraege', async () => {
    const files = await listEntryFiles(REAL_DIR);
    expect(files).not.toContain('schema.json');
    expect(files).not.toContain('index.json');
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('kein Beleg-Ausschnitt enthaelt feste Farb- oder Groessenwerte (E11)', async () => {
    const entries = await readEntries(REAL_DIR);

    // POSITIV-ANKER: die Ausschnitte verwenden tatsaechlich var(--…). Ohne das
    // waere die Negativ-Aussage bei leeren Strings trivial erfuellt.
    expect(entries.every((e) => e.beleg_ausschnitt.includes('var(--'))).toBe(true);

    for (const e of entries) {
      expect(e.beleg_ausschnitt, `Hex-Farbe in ${e.id}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(e.beleg_ausschnitt, `feste Groesse in ${e.id}`).not.toMatch(
        /[0-9]+(\.[0-9]+)?(px|pt|em|rem)\b/,
      );
    }
  });
});

describe('stylesDir()', () => {
  it('zeigt auf den Checkout dieses Moduls, nicht auf process.cwd()', () => {
    // Das ist der Grund fuer die Aufloesung ueber import.meta.url: der Daemon
    // wird aus wechselnden Verzeichnissen gestartet. Mit cwd-basierter
    // Aufloesung faende er im falschen Verzeichnis einfach nichts — und
    // lieferte eine leere Sammlung statt eines Fehlers.
    expect(stylesDir()).toBe(REAL_DIR);
  });

  it('laesst sich per STYLES_DIR ueberschreiben', () => {
    const prev = process.env.STYLES_DIR;
    process.env.STYLES_DIR = '/tmp/irgendwo';
    try {
      expect(stylesDir()).toBe('/tmp/irgendwo');
    } finally {
      if (prev === undefined) delete process.env.STYLES_DIR;
      else process.env.STYLES_DIR = prev;
    }
  });
});

describe('D13 — Fehler werden benannt, nicht als leere Sammlung getarnt', () => {
  let emptyDir: string;
  let brokenDir: string;

  beforeAll(async () => {
    emptyDir = await mkdtemp(join(tmpdir(), 'k9-empty-'));

    brokenDir = await mkdtemp(join(tmpdir(), 'k9-broken-'));
    await writeFile(join(brokenDir, 'index.json'), '{ das ist kein json', 'utf8');
  });

  afterAll(async () => {
    await rm(emptyDir, { recursive: true, force: true });
    await rm(brokenDir, { recursive: true, force: true });
  });

  it('wirft, wenn index.json fehlt — statt [] zu liefern', async () => {
    await expect(readIndex(emptyDir)).rejects.toThrow();
  });

  it('wirft bei kaputtem JSON in index.json', async () => {
    await expect(readIndex(brokenDir)).rejects.toThrow(/kein gueltiges JSON/);
  });

  it('wirft, wenn index.json kein entries-Array hat', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k9-noarr-'));
    try {
      await writeFile(join(dir, 'index.json'), '{"version":1}', 'utf8');
      await expect(readIndex(dir)).rejects.toThrow(/entries/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('wirft, wenn ein Eintrag kaputtes JSON enthaelt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'k9-badentry-'));
    try {
      await writeFile(join(dir, 'index.json'), '{"version":1,"entries":[]}', 'utf8');
      await writeFile(join(dir, 'kaputt.json'), '{ nope', 'utf8');
      await expect(readEntries(dir)).rejects.toThrow(/kaputt\.json/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ein leeres, aber gueltiges Verzeichnis ist KEIN Fehler', async () => {
    // Abgrenzung: "noch keine Beitraege" ist ein gueltiger Zustand,
    // "Quelle nicht lesbar" nicht. Beides muss unterscheidbar bleiben.
    const dir = await mkdtemp(join(tmpdir(), 'k9-valid-empty-'));
    try {
      await writeFile(join(dir, 'index.json'), '{"version":1,"entries":[]}', 'utf8');
      await expect(readIndex(dir)).resolves.toEqual([]);
      await expect(readEntries(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('indexDrift', () => {
  const entry = (id: string) => ({
    id,
    name: id,
    zweck: 'z',
    herkunft: { projekt: 'p', datei: 'd' },
    beleg_ausschnitt: 'var(--color-accent)',
    token_bezuege: ['--color-accent'],
  });

  it('POSITIV-ANKER: meldet bei Deckungsgleichheit keine Drift', () => {
    const d = indexDrift([entry('a'), entry('b')], [entry('a'), entry('b')]);
    expect(d.missingInIndex).toEqual([]);
    expect(d.missingAsFile).toEqual([]);
  });

  it('meldet eine Datei ohne Verzeichniseintrag', () => {
    const d = indexDrift([entry('a')], [entry('a'), entry('b')]);
    expect(d.missingInIndex).toEqual(['b']);
  });

  it('meldet einen Verzeichniseintrag ohne Datei', () => {
    const d = indexDrift([entry('a'), entry('b')], [entry('a')]);
    expect(d.missingAsFile).toEqual(['b']);
  });
});
