// tests/unit/cockpit-daemon-cache.test.ts
// Ticket: T002508 — Lauf-Kontrakt des Cockpit-Daemons
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
// rufen setCache/getCached/isFresh wirklich auf und pruefen die zurueckgegebenen
// Eintraege — kein grep im Quelltext.
//
// Diese Datei bestand bis T002508 aus drei tautologischen Platzhalter-Assertions
// mit auskommentiertem Import. Das Muster wird hier bewusst nicht woertlich
// zitiert: ein Guard, der danach greppt, wuerde sonst diese Datei selbst treffen.
// Auskommentiert war der Import ohne Not — lib/cache.ts zieht
// weder hono noch sonst eine undeklarierte Abhaengigkeit und war die ganze Zeit
// direkt ladbar.
//
// Der Store des Moduls ist eine modulglobale Map. Jeder Test benutzt deshalb
// einen eigenen Schluessel, statt sich auf eine Zuruecksetzung zu verlassen.

import { describe, it, expect } from 'vitest';
import { setCache, getCached, isFresh } from '../../.lavish/kit/daemon/lib/cache';

describe('Daemon Cache — setCache/getCached', () => {
  it('speichert Daten mit ISO-8601-Zeitstempel und gibt sie unveraendert zurueck', () => {
    const entry = setCache('t-store', { foo: 'bar' }, 30_000);

    expect(entry.data).toEqual({ foo: 'bar' });
    expect(entry.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(entry.fetchedAt))).toBe(false);

    // getCached muss denselben Eintrag liefern, nicht einen aelteren Stand.
    expect(getCached('t-store')).toBe(entry);
  });

  it('gibt undefined fuer einen unbekannten Schluessel zurueck', () => {
    expect(getCached('t-nie-geschrieben')).toBeUndefined();
  });
});

describe('Daemon Cache — stale-on-error (D13)', () => {
  it('behaelt die alten Daten, wenn der naechste Abruf fehlschlaegt', () => {
    setCache('t-stale', { value: 'gut' }, 30_000);
    const afterError = setCache('t-stale', { value: 'kaputt' }, 30_000, 'HTTP 500');

    // Der Kern von D13: kein null, kein leeres Objekt, kein Beispielwert —
    // der letzte gute Stand bleibt stehen und wird als fehlerhaft markiert.
    expect(afterError.data).toEqual({ value: 'gut' });
    expect(afterError.error).toBe('HTTP 500');
    expect(afterError.staleSince).toBeDefined();
  });

  it('haelt staleSince auf dem ERSTEN Fehler fest, nicht auf dem letzten', () => {
    setCache('t-since', { value: 'gut' }, 30_000);
    const first = setCache('t-since', null, 30_000, 'Fehler 1');
    const second = setCache('t-since', null, 30_000, 'Fehler 2');

    // Sonst liesse sich nicht ablesen, wie lange die Anzeige schon veraltet ist:
    // bei jedem Folgefehler spraenge der Zeitstempel wieder nach vorn.
    expect(second.staleSince).toBe(first.staleSince);
    expect(second.error).toBe('Fehler 2');
  });

  it('loescht error und staleSince, sobald ein Abruf wieder gelingt', () => {
    setCache('t-recover', { value: 'gut' }, 30_000);
    setCache('t-recover', null, 30_000, 'HTTP 500');
    const recovered = setCache('t-recover', { value: 'neu' }, 30_000);

    expect(recovered.data).toEqual({ value: 'neu' });
    expect(recovered.error).toBeUndefined();
    expect(recovered.staleSince).toBeUndefined();
  });
});

describe('Daemon Cache — TTL', () => {
  it('meldet einen Eintrag innerhalb seiner TTL als frisch', () => {
    // POSITIV-ANKER: waere isFresh generell falsch, bestuende der Ablauftest
    // unten aus dem falschen Grund.
    const entry = setCache('t-ttl-frisch', { v: 1 }, 60_000);
    expect(isFresh(entry)).toBe(true);
  });

  it('meldet einen Eintrag nach Ablauf der TTL als nicht mehr frisch', () => {
    // TTL 0 laeuft in derselben Millisekunde ab — deterministisch und ohne
    // Fake-Timer, weil isFresh nur Date.now() gegen expiresAt vergleicht.
    const entry = setCache('t-ttl-ab', { v: 1 }, 0);
    expect(isFresh(entry)).toBe(false);
  });
});
