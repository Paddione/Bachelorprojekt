---
title: p2-visitor-token — Besucher-Statusseite und Token-APIs
ticket_id: T901024
slug: appointment-requests
status: partial
---

# p2-visitor-token — Partial-Plan (T901024)

Scope: NUR die drei neuen Dateien unten. Keine anderen Dateien anlegen oder ändern.
Abhängigkeit: setzt die DB-Helfer aus p1 (`appointment-requests.ts`, Migration
`20261008_appointment_requests.sql`) als vorhanden voraus; falls sie fehlen, ist
dieser Partial-Plan nicht ausführbar und der Execute-Agent meldet das als Blocker.

## File Structure

| Datei | Typ | S1-Schwelle |
| `components/website/src/pages/anfrage/[token].astro` | neu (.astro) | Limit 1000, nicht-baselined → Budget 1000 |
| `components/website/src/pages/api/anfrage/[token]/storno.ts` | neu (.ts) | Limit 900, nicht-baselined → Budget 900 |
| `components/website/src/pages/api/anfrage/[token]/umbuchung.ts` | neu (.ts) | Limit 900, nicht-baselined → Budget 900 |

S1-Budget-Notizen: alle drei Dateien sind neu, daher gilt jeweils das statische
Extension-Limit aus `docs/code-quality/gates.yaml` als wirksame Schwelle.
Zielgröße: Statusseite unter 250 Zeilen, jede API-Route unter 150 Zeilen —
deutlich unter 80 % der Schwelle, kein Split nötig.
CQ02: keine `any`-Typen einführen; alle Handler und Helferaufrufe strikt typisieren.
S3: keine Brand-Domains als String-Literale; Anzeige über Env/Config (`BRAND_NAME`).

## Task 1 — SSR-Statusseite `anfrage/[token].astro`

Ziel: öffentliche Statusseite, per geheimem Token erreichbar, rendert den Stand
der Anfrage (angefragt / bestätigt / abgelehnt / storniert) plus Service-Snapshot.

Steps:

1. Datei `components/website/src/pages/anfrage/[token].astro` anlegen mit
   `export const prerender = false` (SSR, kein statischer Build pro Token).
2. Token aus `Astro.params.token` lesen; bei leerem/fehlendem Token sofort
   generische 404-Antwort (`new Response(null, { status: 404 })` bzw.
   `Astro.redirect('/404', 404)` nach Projektkonvention) — kein DB-Lookup,
   keine unterschiedlichen Fehlerseiten pro Fehlerart.
3. Genau einen Lookup über den p1-Helfer (z. B. `getAppointmentRequestByToken`)
   durchführen; bei unbekanntem Token dieselbe generische 404 wie in Schritt 2
   zurückgeben (keine Timing- oder Textunterschiede, die Enumeration erlauben).
4. Status-Badge rendern: `offen` → „angefragt", `bestaetigt` → „bestätigt",
   `abgelehnt` → „abgelehnt", `storniert` → „storniert".
5. Wunschtermin (Datum, Uhrzeit), Service-Snapshot (Name, Dauer, Preis) und
   Besucherhinweis aus der gespeicherten Anfrage anzeigen; niemals Live-Katalog-
   werte nachladen (Snapshot aus p1 ist maßgeblich).
6. Kontextaktionen einbetten: Storno-Formular (nur bei `offen`/`bestaetigt`)
   und Umbuchungs-Formular (nur bei `offen`/`bestaetigt`), jeweils POST auf die
   Routen aus Task 2/3. Bei `abgelehnt`/`storniert` keine Aktionsformulare.

Akzeptanzkriterien:

- Gültiges Token zeigt Status, Termin und Service-Snapshot korrekt an.
- Ungültiges, leeres oder fehlendes Token liefert immer die identische
  generische 404-Seite; kein Hinweis auf Existenz/Nichtexistenz anderer Anfragen.
- Ohne gültiges Token findet kein DB-Lookup statt.
- Storno-/Umbuchungsformulare erscheinen nur bei Status `offen`/`bestaetigt`.

Verify:

```bash
wc -l components/website/src/pages/anfrage/\[token\].astro
```

## Task 2 — Storno-API `api/anfrage/[token]/storno.ts`

Ziel: Besucher storniert die eigene Anfrage per POST; nur aus `offen` oder
`bestaetigt`; optionale Notiz geht an die Inhaberin.

Steps:

1. Datei `components/website/src/pages/api/anfrage/[token]/storno.ts` mit
   `POST`-Handler anlegen; Rate-Limit wie in `booking.ts`
   (`checkRateLimit`, Key `anfrage-storno:<ip>`, 5/min).
2. Token aus `Astro.params` lesen; Anfrage per p1-Helfer laden; bei unbekanntem
   Token generische 404-JSON-Antwort (`{ error: 'Nicht gefunden.' }`).
3. Status-Guard: nur `offen`/`bestaetigt` stornierbar; sonst 409 mit
   generischer Fehlermeldung („Diese Anfrage kann nicht mehr storniert werden.").
4. Optionale Besucher-Notiz aus Body lesen (max. 1000 Zeichen, trimmen);
   Status per p1-Helfer auf `storniert` setzen (mit Notiz + Zeitstempel).
5. Inhaberin benachrichtigen (`sendAdminNotification`, Betreff mit Name/Datum,
   inklusive Notiz); kein E-Mail-Versand an den Besucher nötig (Statusseite
   zeigt den neuen Stand).
6. Erfolgsantwort `{ success: true, status: 'storniert' }` mit 200.

Akzeptanzkriterien:

- POST mit gültigem Token aus `offen`/`bestaetigt` setzt Status auf `storniert`.
- POST aus `abgelehnt`/`storniert` liefert 409 und ändert nichts.
- Unbekanntes Token liefert 404 ohne Status-Details.
- Notiz (falls angegeben) steht in der Inhaber-Benachrichtigung.
- Rate-Limit greift bei Missbrauch (429).

Verify:

```bash
wc -l 'components/website/src/pages/api/anfrage/[token]/storno.ts'
```

## Task 3 — Umbuchungs-API `api/anfrage/[token]/umbuchung.ts`

Ziel: Besucher sendet einen Wunschtermin; es entsteht eine neue offene Anfrage,
verknüpft mit der alten (kein stilles Überschreiben).

Steps:

1. Datei `components/website/src/pages/api/anfrage/[token]/umbuchung.ts` mit
   `POST`-Handler anlegen; Rate-Limit wie Task 2 (Key `anfrage-umbuchung:<ip>`).
2. Token lesen, Anfrage laden; unbekanntes Token → generische 404-JSON.
3. Status-Guard: nur `offen`/`bestaetigt` umbuchbar; sonst 409.
4. Body validieren: `slotStart`/`slotEnd` Pflicht, Berlin-Folgeregel wie in
   `booking.ts` (Slot-Datum strikt nach Heute, sonst 409); Slot-Fenster-Prüfung
   (`isSlotInAnyWindow`) wie in `booking.ts`.
5. Neue offene Anfrage per p1-Helfer anlegen: gleiche Besucher-/Service-Daten,
   neuer Wunschtermin, Verknüpfung auf die alte Anfrage
   (z. B. `supersedes_id`); alte Anfrage auf `storniert` setzen mit Vermerk
   „durch Umbuchung ersetzt" (kein Löschen, Historie bleibt erhalten).
6. Inhaberin benachrichtigen (neuer Wunschtermin + Verweis auf alte Anfrage);
   Erfolgsantwort `{ success: true, status: 'offen' }` mit neuem Token, falls
   die neue Anfrage ein eigenes Token erhält.

Akzeptanzkriterien:

- POST mit gültigem Slot erzeugt genau eine neue offene Anfrage mit Verknüpfung
  auf die alte; alte Anfrage ist `storniert` mit Umbuchungs-Vermerk.
- Ungültige Slots (Vergangenheit, außerhalb Fenster) liefern 409, keine neue Anfrage.
- Unbekanntes Token liefert 404; falscher Status liefert 409.
- Inhaberin erhält eine Benachrichtigung mit altem und neuem Termin.

Verify:

```bash
wc -l 'components/website/src/pages/api/anfrage/[token]/umbuchung.ts'
```

## Task 4 — Failing-Test-Step (rot→grün) und Verify

Ziel: Nachweis, dass die drei Routen erst fehlen/scheitern und nach der
Implementierung bestehen.

Steps:

1. Vor der Implementierung einen Vitest-Lauf gegen die (noch fehlenden) Routen
   ausführen, z. B. per existierender Test-Datei im nächstgelegenen
   `__tests__`-Bundle erweitert um Token-Routen-Fälle — expected: FAIL.
2. Nach Task 1–3 denselben Vitest-Lauf wiederholen — expected: PASS.
3. Finale Verify-Kommandos ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Akzeptanzkriterien:

- Der erste Testlauf vor der Implementierung schlägt fehl (expected: FAIL),
  der zweite danach besteht.
- `task test:changed`, `task freshness:regenerate` und `task freshness:check`
  laufen ohne Fehler.
- CQ02-Prüfung: `any`-Zählung in `components/website/src` steigt nicht.

Verify: Ausgaben der drei Kommandos im Execute-Protokoll festhalten.
