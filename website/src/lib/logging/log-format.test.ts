import { describe, it, expect } from 'vitest';
import {
  pinoLevelToLevel,
  textToLevel,
  levelClass,
  levelClassFromText,
  levelLabel,
  parsePinoLine,
  parsePodLine,
} from './log-format';

describe('pinoLevelToLevel', () => {
  it('maps numeric pino levels to buckets', () => {
    expect(pinoLevelToLevel(10)).toBe('debug'); // trace
    expect(pinoLevelToLevel(20)).toBe('debug');
    expect(pinoLevelToLevel(30)).toBe('info');
    expect(pinoLevelToLevel(40)).toBe('warn');
    expect(pinoLevelToLevel(50)).toBe('error');
    expect(pinoLevelToLevel(60)).toBe('error'); // fatal folds into error
  });
});

describe('textToLevel (legacy-preserving heuristic)', () => {
  it('detects error / warn / info from raw text', () => {
    expect(textToLevel('Something went ERROR here')).toBe('error');
    expect(textToLevel('fatal crash')).toBe('error');
    expect(textToLevel('err  boom')).toBe('error');
    expect(textToLevel('a warning appeared')).toBe('warn');
    expect(textToLevel('just info')).toBe('info');
  });
});

describe('level classes', () => {
  it('levelClass returns the css class', () => {
    expect(levelClass('error')).toBe('log-error');
    expect(levelClass('debug')).toBe('log-debug');
  });
  it('levelClassFromText bridges raw lines', () => {
    expect(levelClassFromText('ERROR: nope')).toBe('log-error');
    expect(levelClassFromText('hello')).toBe('log-info');
  });
  it('levelLabel uppercases', () => {
    expect(levelLabel('warn')).toBe('WARN');
  });
});

describe('parsePinoLine', () => {
  it('parses a structured pino line into a server entry', () => {
    const raw = JSON.stringify({ level: 50, time: 1_700_000_000_000, msg: 'request.end', requestId: 'r1', statusCode: 500 });
    const e = parsePinoLine(raw);
    expect(e).toMatchObject({ level: 'error', source: 'server', message: 'request.end', ts: 1_700_000_000_000 });
    expect(e.meta).toMatchObject({ requestId: 'r1', statusCode: 500 });
    expect(e.meta).not.toHaveProperty('msg');
  });

  it('honours an explicit source and string levels', () => {
    const raw = JSON.stringify({ level: 'warn', time: 1, msg: 'careful' });
    expect(parsePinoLine(raw, 'pod')).toMatchObject({ level: 'warn', source: 'pod' });
  });

  it('falls back to text heuristic for non-JSON', () => {
    const e = parsePinoLine('plain ERROR line');
    expect(e).toMatchObject({ level: 'error', source: 'server', message: 'plain ERROR line' });
  });
});

describe('parsePodLine', () => {
  it('parses pino JSON pod stdout with real level', () => {
    const raw = JSON.stringify({ level: 40, time: 2, msg: 'pod warn' });
    expect(parsePodLine(raw)).toMatchObject({ level: 'warn', source: 'pod', message: 'pod warn' });
  });
  it('uses heuristic for plain pod stdout', () => {
    expect(parsePodLine('container started, no errors')).toMatchObject({ level: 'error', source: 'pod' });
    expect(parsePodLine('all good')).toMatchObject({ level: 'info', source: 'pod' });
  });
});
