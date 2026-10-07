---
title: p2-owner-calendar — services-calendar
ticket_id: T901023
domains: [website, booking]
status: draft
---

# p2-owner-calendar — Inhaber-Kalender

Partial-ID `p2`, Rolle `impl`, `depends_on: []` (keine Vorgänger).
Kein finaler Verify-Task in diesem Partial (gehört dem Orchestrator-Index).

Scope: neue Owner-Kalenderseite mit Monatsraster, vier Owner-Endpoints
(Zeit blocken, Telefon-Buchung, Umbuchen, Storno) und der statische
Massage-Leistungskatalog. CalDAV bleibt Source of Truth: alle Mutationen
laufen über die bestehenden CalDAV-Helfer, kein neues Schema, keine neue
Lib-Datei. Jeder Endpoint prüft `requireOwner` und antwortet 401 ohne
Owner-Session. Tests liegen in p4.

<!-- vitest: kein neuer Test in diesem Partial, weil alle Endpoint- und Seiten-Tests im Tests-Partial p4 liegen -->

## File Structure

Alle sechs Dateien sind neu (am 2026-10-08 als abwesend plus
nicht-baselined verifiziert); wirksame Schwelle ist jeweils das statische
Extension-Limit aus `docs/code-quality/gates.yaml`, Abschnitt `s1.limits`:

- `components/website/src/pages/owner/kalender.astro` Ist 0 · Schwelle 1000 (gates.yaml s1.limits `.astro: 1000`, nicht-baselined) → Budget 1000
- `components/website/src/pages/api/owner/calendar/block.ts` Ist 0 · Schwelle 900 (gates.yaml s1.limits `.ts: 900`, nicht-baselined) → Budget 900
- `components/website/src/pages/api/owner/bookings/phone.ts` Ist 0 · Schwelle 900 (gates.yaml s1.limits `.ts: 900`, nicht-baselined) → Budget 900
- `components/website/src/pages/api/owner/bookings/[uid]/reschedule.ts` Ist 0 · Schwelle 900 (gates.yaml s1.limits `.ts: 900`, nicht-baselined) → Budget 900
- `components/website/src/pages/api/owner/bookings/[uid]/cancel.ts` Ist 0 · Schwelle 900 (gates.yaml s1.limits `.ts: 900`, nicht-baselined) → Budget 900
- `content/massage/leistungen.json` Ist 0 · Schwelle no-limit (`.json` steht nicht in gates.yaml s1.limits, nicht-baselined) → Budget n/a

## Task 1: Massage-Leistungskatalog anlegen

Lege `content/massage/leistungen.json` neu an (Verzeichnis vorher per
`mkdir -p` erzeugen). Form folgt exakt dem bestehenden
Mentolder-Marken-Katalog (vorher lesen, nicht ändern): Array aus
`{ id, title, icon, description, services[] }`, Services mit
`{ key, name, price, unit, desc, highlight? }`, plus `durationMin` je
Service (der Leistungen-Endpunkt flacht `durationMin ?? null` ab).
Preise sind Platzhalter:

1. Kategorie `ruecken`, Titel "Rücken": `ruecken-30` ("Rückenmassage
   30 Min.", durationMin 30, Preis "Platzhalter"); Unit "/ Einheit", je
   eine einzeilige `desc`. Vorlage aus T901018 (Business-Brief).
2. Kategorie `ganzkoerper`, Titel "Ganzkörper": `ganzkoerper-60`
   ("Ganzkörpermassage 60 Min.", durationMin 60, Preis "Platzhalter",
   hervorgehoben), `ganzkoerper-90` ("Ganzkörpermassage 90 Min.",
   durationMin 90, Preis "Platzhalter"); gleiche Unit- und
   desc-Konvention. Echte Preise erst nach Owner-Abstimmung.
3. Prüfung: JSON parst, alle Schlüssel eindeutig, jeder Service trägt
   eine positive ganzzahlige `durationMin`:
   ```bash
   jq -e . content/massage/leistungen.json
   node -e "const c=require('./content/massage/leistungen.json');const k=c.flatMap(x=>x.services);if(!k.every(s=>s.key&&s.name&&s.price&&Number.isInteger(s.durationMin)&&s.durationMin>0))throw new Error('shape');if(new Set(k.map(s=>s.key)).size!==k.length)throw new Error('dup key');console.log('catalogue OK:',k.length,'services')"
   ```
4. Auflösung prüfen: der neue Markenkatalog muss über den
   Brand-Bundle-Export plus den Effektiv-Katalog-Leser ladbar sein
   (derselbe Lesepfad, den der Leistungen-Endpunkt verwendet);
   erst bei positivem Laden ist der Task fertig.

## Task 2: Block-Endpunkt für Zeiträume

Lege `components/website/src/pages/api/owner/calendar/block.ts` neu an
(POST, Verzeichnis vorher per `mkdir -p` erzeugen). Fehler-Shape
überall `{ error }` als JSON plus Request-Logger mit Tag
`[owner/calendar/block]`, analog zu den bestehenden Routen.

1. Guard: `requireOwner` über den Cookie-Header; bei null 401 mit
   `{ error: 'Unauthorized' }`. Marke aus der Owner-Session
   (`ownerBusiness`), Fallback auf die BRAND-Env.
2. Body `{ start, end, reason? }` parsen: nicht-leere ISO-Datumszeiten,
   naive Wandzeit wird als Europe/Berlin interpretiert (Inline-Parser
   per `Intl.DateTimeFormat` mit `Europe/Berlin`, gleiche Technik wie
   der Verfügbarkeitskern, aber ohne Import aus fremden Partial-Dateien,
   damit dieses Partial vorgängerfrei bleibt). `start < end` sonst 400;
   Zeitraum über 31 Tage ebenfalls 400; optionale `reason` als String
   mit höchstens 200 Zeichen sonst 400.
3. Überlappungsschutz: Zeitraum gegen alle nicht-stornierten
   `getAllBookings`-Einträge prüfen, bei Schnittmenge 409.
4. Block per `createCalendarEvent` schreiben (Summary `Blockiert` plus
   Reason-Suffix, Beschreibung mit Owner-Vermerk); null-Ergebnis
   bedeutet 502. Antwort 200 `{ uid }`.
5. Voll typisiert, kein `any` (CQ02); nur One-Way-Imports bestehender
   Lib-Module (S2); keine Hostnamen-Literale (S3).

## Task 3: Telefon-Buchung durch die Inhaberin

Lege `components/website/src/pages/api/owner/bookings/phone.ts` neu an
(POST). Offline-/Telefon-Buchungen werden damit serverseitig wie
Online-Buchungen validiert.

1. Guard wie Task 2 (401 ohne Owner-Session), Marke aus der
   Owner-Session mit BRAND-Fallback.
2. Body `{ name, phone?, attendeeEmail?, serviceKey, start,
   durationMin? }`: `name` nicht-leer sonst 400; `serviceKey` muss im
   Massage-Katalog aus Task 1 existieren sonst 400; `durationMin`
   defaultet auf den Katalogwert und muss positiv-ganzzahlig sein
   sonst 400; `start` als Europe/Berlin-Wandzeit (Inline-Parser wie
   Task 2).
3. Vorlauf: Berlin-Datum des Starts muss strikt nach dem Berlin-Datum
   der Anfrage liegen (gleiche Tagesmathematik wie der Buchungspfad),
   sonst 409. Gleich-Tages-Anfragen scheitern damit immer.
4. Verfügbarkeit: `isSlotInAnyWindow` für den aus Start plus Dauer
   berechneten Zeitraum (409), Überlappungs-Scan gegen
   nicht-stornierte `getAllBookings`-Einträge (409), dann atomar
   `claimSlot(brand, start)` (bei false 409).
5. Anlegen per `createCalendarEvent` mit Attendee-Feldern und
   Beschreibung mit eingefrorenem Service-Snapshot (Schlüssel, Name,
   Preis, Dauer-Minuten aus dem Katalog zum Anfragezeitpunkt;
   unbekannter Schlüssel war schon 400); null-Ergebnis bedeutet 502.
   Antwort 200 `{ uid }`.
6. Typisierung, Importrichtung und Fehler-Shape wie Task 2.

## Task 4: Umbuchen mit Re-Validierung

Lege `components/website/src/pages/api/owner/bookings/[uid]/reschedule.ts`
neu an (POST, Verzeichnis vorher per `mkdir -p` erzeugen).

1. Guard wie Task 2 (401 ohne Owner-Session); fehlende `params.uid`
   bedeutet 400.
2. Body `{ newStart, newEnd }` als Europe/Berlin-Wandzeit parsen
   (Inline-Parser wie Task 2); `newStart < newEnd` sonst 400.
3. Vorlauf-Re-Check wie Task 3 (Berlin-Datum strikt nach Anfragedatum),
   sonst 409.
4. Bestand prüfen: `uid` gegen `getAllBookings` auflösen, unbekannte
   `uid` bedeutet 404.
5. Verfügbarkeits-Re-Check: `isSlotInAnyWindow` für den neuen Zeitraum
   plus Überlappungs-Scan, der den umzuziehenden Termin selbst
   ausnimmt, sonst 409. Bewusst kein `claimSlot`: die umzuziehende
   Buchung hält ihren Slot bereits, ein zweiter atomarer Claim würde
   doppelt verbrauchen.
6. `updateCalendarEventTime(uid, newStart, newEnd)` anwenden; false
   nach bestandenem Vorab-Check bedeutet 502. Antwort 200
   `{ uid, newStart, newEnd }` als ISO-Strings.
7. Typisierung, Importrichtung und Fehler-Shape wie Task 2.

## Task 5: Storno mit Notiz-Durchreichung

Lege `components/website/src/pages/api/owner/bookings/[uid]/cancel.ts`
neu an (POST).

1. Guard wie Task 2 (401 ohne Owner-Session); fehlende `params.uid`
   bedeutet 400.
2. Body `{ note? }`: optionale Notiz (etwa der
   Hausbesuch-Ausnahmegrund) muss bei Anwesenheit ein String mit
   höchstens 500 Zeichen sein sonst 400. Die Notiz wird
   uninterpretiert durchgereicht: Echo in der 200-Antwort plus
   strukturierter Log-Eintrag; sie blockiert den Storno nie.
3. Bestand prüfen: `uid` gegen `getAllBookings` auflösen, unbekannte
   `uid` bedeutet 404.
4. `updateCalendarEventStatus(uid, 'CANCELLED')` anwenden; false nach
   bestandenem Vorab-Check bedeutet 502. Antwort 200
   `{ uid, cancelled: true, note }` mit Default null.
5. Typisierung, Importrichtung und Fehler-Shape wie Task 2.

## Task 6: Owner-Kalenderseite mit Monatsraster

Lege `components/website/src/pages/owner/kalender.astro` neu an
(server-gerendert, ohne Client-Skript, Mobile-first, deutlich unter
1000 Zeilen halten).

1. Guard: `requireOwner` plus Login-Redirect, gespiegelt am
   bestehenden Owner-Index-Guard (nur lesen, nicht ändern).
2. Rastermuster der bestehenden Admin-Kalenderseite übernehmen (nur
   lesen, nicht ändern): `year`/`month`-Query-Params mit
   NaN-Absicherung, montagsverankerte Gittermathematik, deutsche
   Monats-/Tagesnamen, Vor-/Heute-/Zurück-Navigation, Tageszellen mit
   denselben Test-Hooks (`kalender-cell`, `data-day`).
3. Daten: `getAllBookings` laden, `CANCELLED` verwerfen, per
   Tagesschlüssel einsortieren; Marke aus `ownerBusiness` anzeigen.
4. Mobile-first: Monatsraster nur ab mittlerer Breite (`hidden
   md:grid`), darunter eine Agenda-Liste (`md:hidden`) mit denselben
   Buchungen gruppiert nach Tag.
5. Aktionen als Server-Formulare je Buchung: Umbuchen-Formular
   (datetime-local für den neuen Zeitraum, POST auf die
   Reschedule-Route mit der `uid`), Storno-Formular (optionales
   Notizfeld, POST auf die Cancel-Route); dazu ein Block-Formular
   (Start/Ende plus Grund, POST auf die Block-Route) und ein
   Telefon-Buchungs-Formular (Name, Kontakt, Service-Auswahl aus dem
   Task-1-Katalog, Start, Dauer, POST auf die Phone-Route).

Gates: keine neuen `any`-Typen (CQ02), nur One-Way-Imports bestehender
Module ohne neue Zyklen (S2), keine Domain-Literale (S3, Marke und
CalDAV-Basis bleiben Env-/Session-getrieben), keine neuen Manifeste
oder Skripte (S4), keine Baseline-Änderung.
