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
// argv-ARRAY. #6688 (Ticket-Retirement) entfernte ticket.sh endgueltig; seit
// #6796 kommen die Epics aus GitHub Issues mit Label `epic` via `gh issue list`.
// Die Bau-Tests pruefen deshalb die gh-argv-Form, nicht mehr einen Skriptpfad.
//
// Bewusst KEIN Import von server.ts oder routes/epics.ts als Modul-Ganzes mit
// Handlern: der Daemon zieht `hono`, das in keiner package.json deklariert ist
// (siehe cockpit-daemon-injection.test.ts). Geprueft werden deshalb die reinen
// Bau- und Parse-Funktionen; die Route-Ebene deckt
// tests/py/spec/native_ported/spec/sdlc-cockpit/test_k5_epic_canvas.py ab.
import { describe, it, expect } from 'vitest';
import {
  buildEpicsArgs,
  parseEpics,
  buildChangesSinceArgs,
  isValidIsoTimestamp,
  countChangedCommits,
} from '../../.lavish/kit/daemon/sources/epics';

describe('buildEpicsArgs — argv statt Shell-String', () => {
  it('liefert ein gh-issue-list-argv mit Label, State, Limit und JSON-Feldern', () => {
    // POSITIV-ANKER: ohne ihn waere jede Negativ-Aussage unten trivial erfuellt,
    // falls die Funktion z.B. ein leeres Array zurueckgaebe.
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    expect(Array.isArray(args)).toBe(true);
    expect(args.slice(0, 2)).toEqual(['issue', 'list']);
    expect(args).toContain('--label');
    expect(args[args.indexOf('--label') + 1]).toBe('epic');
    expect(args).toContain('--state');
    expect(args[args.indexOf('--state') + 1]).toBe('open');
    expect(args).toContain('--limit');
    expect(args[args.indexOf('--limit') + 1]).toBe('50');
    expect(args).toContain('--json');
  });

  it('listet mit status closed nur geschlossene Issues', () => {
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project', status: 'closed' });
    expect(args[args.indexOf('--state') + 1]).toBe('closed');
  });

  it('fordert per --json genau die Felder an, die parseEpics liest', () => {
    // Ohne --json liefert gh eine Tabelle, kein JSON — parseEpics wuerfe.
    const args = buildEpicsArgs({ brand: 'mentolder', type: 'project' });
    const fields = args[args.indexOf('--json') + 1].split(',');
    expect(fields).toContain('number');
    expect(fields).toContain('title');
    expect(fields).toContain('state');
  });

  it('weist einen Typ mit Kommaliste ab (Ticket-Relikt, kein gh-Filter)', () => {
    // `type` ist ein Ticket-DB-Konzept und wird gh-seitig nicht gefiltert —
    // nur validiert. 'project,feat' scheiterte frueher stumm (Gleichheit
    // matcht nichts); heute wirft der Guard sofort.
    expect(() => buildEpicsArgs({ brand: 'mentolder', type: 'project,feat' })).toThrow();
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
  const ghSample = JSON.stringify([
    {
      number: 6796,
      title: 'K5 Epic-Canvas: sources/epics.ts referenziert retired scripts/ticket.sh',
      state: 'OPEN',
      labels: [{ name: 'bug' }, { name: 'epic' }],
      createdAt: '2026-10-22T04:00:00Z',
      updatedAt: '2026-10-22T05:00:00Z',
    },
  ]);

  it('POSITIV-ANKER: parst die echte gh-issue-list-Ausgabeform', () => {
    const epics = parseEpics(ghSample);
    expect(epics).toHaveLength(1);
    expect(epics[0].id).toBe('6796');
    expect(epics[0].title).toContain('K5 Epic-Canvas');
    expect(epics[0].status).toBe('open');
  });

  it('bleibt rueckwaertskompatibel zur alten Ticket-Form', () => {
    const epics = parseEpics(JSON.stringify([
      { external_id: 'T002458', title: 'EPIC: SDLC Cockpit', status: 'in_progress', priority: 'hoch' },
    ]));
    expect(epics[0].id).toBe('T002458');
    expect(epics[0].status).toBe('in_progress');
  });

  it('wirft bei kaputtem JSON, statt [] zurueckzugeben', () => {
    // Die alte Fassung hatte `catch { return [] }`. Ein Datenbankausfall sah
    // damit exakt aus wie "es gibt keine Epics" — genau der stille Fallback,
    // den D13 verbietet (tests/py/spec/native_ported/spec/sdlc-cockpit/test_no_silent_fallback.py).
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
  it('POSITIV-ANKER: baut ein git-log-argv fuer .agents/plans/', () => {
    const args = buildChangesSinceArgs('2026-08-01T12:00:00.000Z');
    expect(args[0]).toBe('log');
    expect(args).toContain('.agents/plans/');
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
