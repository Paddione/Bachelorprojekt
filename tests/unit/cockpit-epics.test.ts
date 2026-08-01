// tests/unit/cockpit-epics.test.ts
// Ticket: T002464 — K5 Epic-Canvas, Daemon-Route /api/cockpit/epics
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
// rufen die Funktionen wirklich auf und pruefen, WAS herauskommt — kein grep
// nach Flag-Namen im Quelltext.
//
// Hintergrund: die erste Fassung dieser Route wurde gegen eine exec()-Signatur
// geschrieben, die T002505 danach ersetzt hat. Sie rief
//     exec('bash scripts/vda/ticket.sh list --type project,feat --json', 10000)
// auf — also die alte Shell-String-Form. Nach T002505 nimmt exec() `bin` und ein
// argv-ARRAY; der ganze Kommandostring landete damit als Programmname und die
// 10000 dort, wo argv erwartet wird. Zusaetzlich existierte `--json` als Flag
// gar nicht, `--brand` ist Pflicht, und `--type` vergleicht auf Gleichheit statt
// eine Kommaliste zu akzeptieren. Die Route konnte also auf keinem der vier
// Wege funktionieren.
//
// Bewusst KEIN Import von server.ts oder routes/epics.ts als Modul-Ganzes mit
// Handlern: der Daemon zieht `hono`, das in keiner package.json deklariert ist
// (siehe cockpit-daemon-injection.test.ts). Geprueft werden deshalb die reinen
// Bau- und Parse-Funktionen; die Route-Ebene deckt
// tests/spec/sdlc-cockpit/k5-epic-canvas.bats ab.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildEpicsArgs,
  parseEpics,
  buildChangesSinceArgs,
  isValidIsoTimestamp,
  countChangedCommits,
} from '../../.lavish/kit/daemon/sources/epics';

const REPO = resolve(__dirname, '../..');

describe('buildEpicsArgs — argv statt Shell-String', () => {
  it('liefert ein argv-Array, dessen Programmpfad wirklich existiert', () => {
    // POSITIV-ANKER: ohne ihn waere jede Negativ-Aussage unten trivial erfuellt,
    // falls die Funktion z.B. ein leeres Array zurueckgaebe.
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    expect(Array.isArray(args)).toBe(true);
    expect(args.length).toBeGreaterThan(1);

    // args[0] ist der Skriptpfad, den `bash` ausfuehrt. Er muss existieren —
    // die alte Fassung nannte scripts/vda/ticket.sh mit einem `list`, das dort
    // nur als Pass-Through existiert.
    expect(existsSync(resolve(REPO, args[0]))).toBe(true);
  });

  it('setzt das von list.sh geforderte --brand', () => {
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    const i = args.indexOf('--brand');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('mentolder');
  });

  it('verwendet kein --json (das Flag existiert in list.sh nicht)', () => {
    // list.sh gibt bereits json_agg aus; ein --json bricht mit
    // "Unknown list option: --json" ab, Exit 2.
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    expect(args).not.toContain('--json');
  });

  it('uebergibt genau EINEN Typ, keine Kommaliste', () => {
    // list.sh baut `AND type = :'type'` — eine Gleichheit. 'project,feat'
    // matcht damit nichts und liefert stumm eine leere Liste.
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    const i = args.indexOf('--type');
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe('project');
    expect(args[i + 1]).not.toContain(',');
  });

  it('reicht keine Shell-Syntax durch', () => {
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    const joined = args.join(' ');
    expect(joined).not.toContain('2>/dev/null');
    expect(joined).not.toContain('||');
    expect(joined).not.toContain('|');
  });

  it('weist eine Brand mit Shell-Metazeichen ab, statt sie durchzureichen', () => {
    expect(() => buildEpicsArgs({ brand: 'mentolder; id', type: 'project' })).toThrow();
    expect(() => buildEpicsArgs({ brand: '$(id)', type: 'project' })).toThrow();
  });
});

describe('parseEpics — D13: kein stilles leeres Ergebnis', () => {
  const sample = JSON.stringify([
    {
      external_id: 'T002458',
      title: 'EPIC: SDLC Cockpit',
      status: 'in_progress',
      type: 'project',
      priority: 'hoch',
    },
  ]);

  it('POSITIV-ANKER: parst die echte list.sh-Ausgabeform', () => {
    const epics = parseEpics(sample);
    expect(epics).toHaveLength(1);
    expect(epics[0].id).toBe('T002458');
    expect(epics[0].title).toBe('EPIC: SDLC Cockpit');
    expect(epics[0].status).toBe('in_progress');
  });

  it('wirft bei kaputtem JSON, statt [] zurueckzugeben', () => {
    // Die alte Fassung hatte `catch { return [] }`. Ein Datenbankausfall sah
    // damit exakt aus wie "es gibt keine Epics" — genau der stille Fallback,
    // den D13 verbietet (tests/spec/sdlc-cockpit/no-silent-fallback.bats).
    expect(() => parseEpics('not json at all')).toThrow();
  });

  it('wirft, wenn die Antwort kein Array ist', () => {
    expect(() => parseEpics('{"error":"db down"}')).toThrow();
  });

  it('liefert fuer eine echte leere Liste ein leeres Array ohne zu werfen', () => {
    // Abgrenzung zum vorigen Test: "keine Treffer" ist ein gueltiges Ergebnis,
    // "Abfrage kaputt" nicht. Beides muss unterscheidbar bleiben.
    expect(parseEpics('[]')).toEqual([]);
  });
});

describe('isValidIsoTimestamp — Eingabe der changes-since-Route', () => {
  it('POSITIV-ANKER: akzeptiert die Zeitstempel, die canvas-store.js erzeugt', () => {
    // canvas-store.js schreibt new Date().toISOString().
    expect(isValidIsoTimestamp(new Date('2026-08-01T12:00:00.000Z').toISOString())).toBe(true);
    expect(isValidIsoTimestamp('2026-07-28T14:08:30.601441+00:00')).toBe(true);
  });

  it('lehnt Shell-Metazeichen und Freitext ab', () => {
    for (const bad of ['$(id)', '2026-08-01; id', 'yesterday', '', '--since=x', 'a'.repeat(200)]) {
      expect(isValidIsoTimestamp(bad), bad).toBe(false);
    }
  });
});

describe('buildChangesSinceArgs — git ohne Shell-Pipe', () => {
  it('POSITIV-ANKER: baut ein git-log-argv fuer openspec/changes/', () => {
    const args = buildChangesSinceArgs('2026-08-01T12:00:00.000Z');
    expect(args[0]).toBe('log');
    expect(args).toContain('openspec/changes/');
  });

  it('enthaelt kein `wc -l` — ohne Shell gibt es keine Pipe', () => {
    // Die alte Fassung haengte `| wc -l` an den Kommandostring. Ohne Shell ist
    // das keine Pipe, sondern waeren drei weitere Argumente an git.
    const args = buildChangesSinceArgs('2026-08-01T12:00:00.000Z');
    expect(args).not.toContain('wc');
    expect(args.join(' ')).not.toContain('|');
  });

  it('wirft bei ungueltigem Zeitstempel, statt ihn an git zu reichen', () => {
    expect(() => buildChangesSinceArgs('$(id)')).toThrow();
  });
});

describe('countChangedCommits — zaehlt in JS statt per wc', () => {
  it('POSITIV-ANKER: zaehlt echte git-log-Zeilen', () => {
    expect(countChangedCommits('abc123 erste\ndef456 zweite\n')).toBe(2);
  });

  it('zaehlt leere Ausgabe als 0', () => {
    expect(countChangedCommits('')).toBe(0);
    expect(countChangedCommits('\n')).toBe(0);
  });
});
