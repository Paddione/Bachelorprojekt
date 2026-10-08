---
title: p3-settings — services-calendar
ticket_id: T901023
domains: [website, calendar]
status: draft
---

# p3-settings — services-calendar Settings-Modell

Partial-ID `p3`, Rolle `impl`, `depends_on: []` (keine Vorgänger).
Kein finaler Verify-Task in diesem Partial (gehört dem Orchestrator-Index).

## File Structure

- (NEU) `components/website/src/lib/business-settings.ts`: reines, typisiertes Modul für Öffnungszeiten je Marke, Vor-/Nachlauf-Puffer und Feiertage — striktes Lesen, Prüfen und Normalisieren über dem `site_settings`-JSON-Muster. `components/website/src/lib/business-settings.ts` Ist 0 · Schwelle 900 (statisches `.ts`-Limit, nicht-baselined) → Budget 900
- (ÄNDERUNG, additiv) `components/website/src/lib/website-core-db.ts`: neue Accessoren für die Settings-Schlüssel nach dem bestehenden `vacation_periods`-Muster, ohne Verhaltensänderung für heutige Aufrufer. `components/website/src/lib/website-core-db.ts` Ist 543 · Schwelle 900 (statisches `.ts`-Limit, nicht-baselined) → Budget 357

Beide Dateien sind nicht in der Baseline eingefroren, daher gilt jeweils das statische `.ts`-Limit als wirksame Schwelle. Die neue Datei wird mit deutlicher Reserve unter dem Limit geschnitten; die Ergänzung im DB-Modul bleibt in der Größenordnung einiger Dutzend Zeilen und damit weit unter der Schwelle. Kein Split und keine Verkleinerung nötig.

<!-- vitest: kein neuer Test in diesem Partial, weil die Vitest-Abdeckung für das Settings-Modell im Test-Partial p4 liegt -->

## Task 1: Reines Settings-Modul anlegen

Lege `components/website/src/lib/business-settings.ts` neu an: Typen, Defaults und strikte Parser für die drei Settings-Blöcke. Das Modul bleibt rein: keine Projekt-Importe, kein Pool-, kein Env-, kein Uhr-Zugriff; alle Eingaben kommen als Parameter herein, alle Ausgaben sind deterministisch aus der Eingabe abgeleitet.

1. Typen und Konstanten anlegen: `Weekday` (`mon` bis `sun`), `DayWindow` mit `open`/`close` im Format `HH:MM`, `OpeningHours` als Abbildung je Wochentag auf eine Intervall-Liste (leere Liste bedeutet geschlossen, mehrere Intervalle pro Tag sind zulässig), `BookingBuffers` mit `preMin`/`postMin` in Minuten, `Holidays` als Liste von ISO-Datumsstrings (`YYYY-MM-DD`). Dazu ein `WEEKDAYS`-Tupel als kanonische Reihenfolge, Defaults (alle Tage geschlossen, beide Puffer 0, Feiertagsliste leer) und die Puffer-Obergrenze als benannte Konstante (`MAX_BUFFER_MIN`, 240 Minuten).

```ts
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface DayWindow { open: string; close: string; }
export type OpeningHours = Record<Weekday, DayWindow[]>;
export interface BookingBuffers { preMin: number; postMin: number; }
export type Holidays = string[];
```

2. Strikte Parser implementieren: `parseOpeningHours`, `parseBookingBuffers`, `parseHolidays`, jeweils von `unknown` auf den Zieltyp. Prüfen und Normalisieren fallen in einer Funktion zusammen: Jede Parser-Funktion prüft strikt und wirft bei Verstoß einen `RangeError`. Unbekannte Schlüssel (falsche Wochentage, fremde Objektfelder) werden abgewiesen; Zeitwerte müssen dem 24-Stunden-Muster mit führender Null entsprechen und `open` muss vor `close` liegen; leere oder unvollständige Intervalle fallen durch; Puffer müssen ganzzahlig zwischen 0 und der Obergrenze liegen; Feiertagseinträge müssen echte Kalendertage im ISO-Format sein und doppelte Einträge werden abgewiesen. Gültige Eingaben kommen in kanonischer Form zurück (Intervalle je Tag nach Beginn sortiert, Feiertage aufsteigend sortiert).

3. Reinheit und Typisierung sichern: keine `any`-Typen in Exporten oder Helfern, keine Seiteneffekte, keine Umgebungszugriffe.

Akzeptanz: Die Datei exportiert die Typen, Defaults und drei Parser; ungültige Blobs (unbekannte Schlüssel, Ende vor Beginn, negative oder absurde Puffer, ungültige Daten, Duplikate) werfen `RangeError`, gültige Blobs (darunter mehrere Intervalle pro Tag) werden akzeptiert und kanonisch zurückgegeben.

## Task 2: Additive Accessoren im DB-Modul

Ergänze in `components/website/src/lib/website-core-db.ts` sechs Accessoren nach dem `vacation_periods`-Muster (`getSiteSetting`/`setSiteSetting` mit JSON-Schlüssel). Die Importrichtung läuft ausschließlich vom DB-Modul in das reine Modul; das reine Modul importiert nichts zurück (S2, keine neuen Zyklen).

1. Typen, Parser und Defaults aus `./business-settings` importieren (eine Importzeile, keine weiteren Abhängigkeiten).
2. Je Settings-Block ein Getter/Setter-Paar ergänzen: `getOpeningHours`/`saveOpeningHours` (Schlüssel `opening_hours`), `getBookingBuffers`/`saveBookingBuffers` (Schlüssel `booking_buffers`), `getHolidays`/`saveHolidays` (Schlüssel `holidays`). Getter lesen den Rohwert, fallen bei fehlendem Wert auf den Default zurück und fallen bei defektem JSON oder verletzter Validierung ebenfalls auf den Default zurück (sie werfen bei Datenfehlern nie, analog zu `getVacationPeriods`). Setter prüfen strikt über den reinen Parser (ungültige Eingabe wirft `RangeError`) und schreiben erst danach den kanonischen Wert als JSON-Zeichenkette.

```ts
import { parseOpeningHours, DEFAULT_OPENING_HOURS } from './business-settings';
import type { OpeningHours } from './business-settings';

export async function getOpeningHours(brand: string): Promise<OpeningHours> {
  const raw = await getSiteSetting(brand, 'opening_hours');
  if (!raw) return DEFAULT_OPENING_HOURS;
  try { return parseOpeningHours(JSON.parse(raw)); } catch { return DEFAULT_OPENING_HOURS; }
}

export async function saveOpeningHours(brand: string, hours: OpeningHours): Promise<void> {
  await setSiteSetting(brand, 'opening_hours', JSON.stringify(parseOpeningHours(hours)));
}
```

3. Bestehende Exporte unangetastet lassen: keine Signatur- und keine Verhaltensänderung für heutige Aufrufer; der Diff enthält nur die neue Importzeile und die sechs Accessoren.
4. Zeilenstand nach der Änderung messen:

```bash
wc -l components/website/src/lib/business-settings.ts components/website/src/lib/website-core-db.ts
```

Akzeptanz: Beide Dateien liegen unter ihrer wirksamen Schwelle 900; alle bisherigen Exporte des DB-Moduls verhalten sich unverändert; die Marke läuft weiterhin als `brand`-Parameter, ohne Domain-Literale im Code (S3).
