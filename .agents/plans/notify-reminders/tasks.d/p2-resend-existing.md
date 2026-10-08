# p2-resend-existing — Bestandsversand auf Notify-Lib umstellen (T901025)

Partial-Plan für Slug `notify-reminders`. Setzt die p1-Lib
(`components/website/src/lib/appointment-notify.ts` mit einheitlichen Templates,
Dedupe, Retry und Protokoll) als vorhanden und gemergt voraus. Nur ausführbar,
wenn der p1-Export lesbar ist; Task 1 verifiziert das zuerst.

Scope: exakt die 5 Dateien unten. Keine neuen Dateien, keine Text-/Empfänger-
Änderungen außer Vereinheitlichung über die p1-Templates. Verhalten bleibt
äquivalent: gleiche Empfänger, gleiche Betreff-/Textaussagen, gleiche
Antwort-Statuscodes der Routen.

## Target-Files (exklusiv) mit S1-Budget

Alle 5 Dateien: nicht-baselined, wirksame Schwelle = statisches `.ts`-Limit 900
(Quelle: `docs/code-quality/gates.yaml`, gemessen 2026-10-08 im Worktree).

| `components/website/src/pages/api/booking.ts` | 239 | 661 |
| `components/website/src/pages/api/owner/anfragen/[id]/annehmen.ts` | 175 | 725 |
| `components/website/src/pages/api/owner/anfragen/[id]/ablehnen.ts` | 116 | 784 |
| `components/website/src/pages/api/anfrage/[token]/storno.ts` | 106 | 794 |
| `components/website/src/pages/api/anfrage/[token]/umbuchung.ts` | 177 | 723 |

Hinweis: `intel.json` nennt für `booking.ts` 182 Zeilen, gemessen sind 239 —
die Tabelle oben nutzt die gemessenen Werte. Alle Budgets sind groß (> 650);
die Umstellung ersetzt Inline-Texte durch Lib-Aufrufe und verkleinert jede
Datei netto. Kein Split nötig, keine Datei nähert sich 80 % der Schwelle.

## Task 1 — p1-Vertrag lesen + Failing-Test für umgestellte Versandstellen

Steps:

1. `components/website/src/lib/appointment-notify.ts` lesen: exportierte
   Notify-Funktion, Template-Namen/Keys, Parameter (Empfänger, Template-Key,
   Variablen, Dedupe-Key, Request-Kontext für Protokoll), Rückgabewerte und
   Fehlerverhalten dokumentieren. Falls die Datei fehlt oder kein stabiler
   Export existiert: Stopp, p1 ist nicht bereit — kein Workaround mit eigenen
   Templates in den Routen.
2. Ist-Aufrufe inventarisieren (7 Stellen in 5 Dateien):
   - `booking.ts`: `sendEmail` (Nutzer-Bestätigung, Varianten Callback/Termin)
     und `sendAdminNotification` (Admin, Varianten Callback/Termin).
   - `annehmen.ts`: `sendEmail` (Bestätigung; Rückgabe wird geprüft, bei
     Fehlschlag Warn-Log — dieses Verhalten mit dem Lib-Rückgabewert
     nachbilden).
   - `ablehnen.ts`: `sendEmail` (Absage inkl. optionaler Notiz).
   - `storno.ts`: `sendAdminNotification` (Storno inkl. Notiz).
   - `umbuchung.ts`: `sendAdminNotification` (Umbuchung alt → neu).
3. Bestehenden Vitest `components/website/src/lib/__tests__/email-booking.test.ts`
   erweitern: je Versandstelle ein Fall, der den Lib-Aufruf (Template-Key +
   Empfänger + Variablen-Gleichwertigkeit zu Betreff/Text heute) erwartet.
   Zuerst rot fahren:
   `npx vitest run components/website/src/lib/__tests__/email-booking.test.ts`
   — expected: FAIL, weil die Routen noch direkt `sendEmail` /
   `sendAdminNotification` nutzen.

Akzeptanzkriterien:

- Der p1-Export (Name, Signatur, Template-Keys) ist im Task-Protokoll festgehalten.
- Neue Testfälle existieren und schlagen vor der Umstellung fehl.
- Kein neuer Test-File angelegt (bestehende Datei erweitert).

## Task 2 — `booking.ts`: Nutzer- und Admin-Mail auf Lib umstellen

Steps:

1. Beide Aufrufe (`sendEmail`, `sendAdminNotification`) durch die p1-Lib
   ersetzen: je Variante (Callback/Termin) passender Template-Key, Variablen
   aus den heutigen Inline-Texten (Name, Typ-Label, Datum, Slot, Telefon,
   Nachricht, Token, Verwaltungs-Link), Dedupe-Key aus Anfrage-Token +
   Template-Key.
2. `replyTo: email` der Admin-Mail als Lib-Parameter übernehmen; HTML-Ableitung
   der Lib überlassen (kein eigenes HTML-Building mehr in der Route).
3. Unbenutzte Imports (`sendEmail`, `sendAdminNotification`) entfernen, sofern
   sonst ungenutzt; S2 beachten (nur Lib-Import, kein Rück-Import).

Akzeptanzkriterien:

- `booking.ts` enthält keinen direkten `sendEmail`- oder
  `sendAdminNotification`-Aufruf mehr.
- Empfänger, Betreffzeilen und Textaussagen sind zu heute äquivalent
  (Template-Rendering deckt Callback- und Termin-Variante ab).
- Antwort-Verhalten der Route unverändert (Statuscodes, Response-Body).

## Task 3 — Owner-Paar: `annehmen.ts` + `ablehnen.ts` umstellen

Steps:

1. `annehmen.ts`: `sendEmail` (Bestätigung mit Leistung + Slot-Text) auf
   Lib-Aufruf umstellen; Dedupe-Key aus Anfrage-ID + Template-Key. Die
   Rückgabe-Prüfung mit Warn-Log (`confirmation mail failed`) bleibt erhalten
   und nutzt den Lib-Rückgabewert.
2. `ablehnen.ts`: `sendEmail` (Absage mit Service-/Slot-Text + optionaler
   Notiz) auf Lib-Aufruf umstellen; Dedupe-Key aus Anfrage-ID + Template-Key.
   Rückgabe-Prüfung mit Warn-Log (`rejection mail failed`) bleibt erhalten.
3. Unbenutzte `sendEmail`-Imports entfernen.

Akzeptanzkriterien:

- Beide Dateien ohne direkten `sendEmail`-Aufruf.
- Slot-Text-Fallback (`slotDisplay ?? slotStart ?? 'Rückruf'`) und Notiz-Logik
  sind im Lib-Aufruf äquivalent abgebildet.
- Warn-Logs bei Fehlschlag bleiben bestehen; Erfolgs-/Fehler-Statuscodes
  der Routen unverändert.

## Task 4 — Token-Paar: `storno.ts` + `umbuchung.ts` umstellen

Steps:

1. `storno.ts`: `sendAdminNotification` (Storno mit Name, E-Mail, Termin,
   Gast-Notiz, `replyTo`) auf Lib-Aufruf umstellen; Dedupe-Key aus
   Anfrage-ID + Template-Key.
2. `umbuchung.ts`: `sendAdminNotification` (Umbuchung mit altem/neuem Termin,
   Anfrage-ID) auf Lib-Aufruf umstellen; Dedupe-Key aus neuer Anfrage
   (Token/ID) + Template-Key, sodass Retry der Route nicht doppelt meldet.
3. Unbenutzte `sendAdminNotification`-Imports entfernen.

Akzeptanzkriterien:

- Beide Dateien ohne direkten `sendAdminNotification`-Aufruf.
- Admin-Betreffzeilen (`[Storno] …`, `[Umbuchung] …`) und Textaussagen
  äquivalent; `replyTo` übernommen.
- Routen-Antworten unverändert.

## Task 5 — Verifikation: Äquivalenz, Gates, Freshness

Steps:

1. `npx vitest run components/website/src/lib/__tests__/email-booking.test.ts`
   — alle Fälle grün (rot→grün aus Task 1 geschlossen).
2. Negativ-Grep über die 5 Dateien: kein `sendEmail(` / kein
   `sendAdminNotification(` mehr direkt in den Routen.
3. CQ02 halten (`any`-Ist ist 0, Limit 200):
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`
4. S1 prüfen: jede der 5 Dateien kleiner als vorher (netto geschrumpft),
   `task quality:check` grün; S3: keine Brand-Domain-Literale eingeführt.
5. `task test:inventory` nach der Test-Erweiterung (Inventar mitcommitten).
6. Finale Gate-Kette:
   `task test:changed`,
   `task freshness:regenerate`,
   `task freshness:check`.

Akzeptanzkriterien:

- Vitest grün, Negativ-Grep leer, `any`-Zählung 0.
- `task quality:check` und `task freshness:check` grün; keine neue
  Baseline-Key-Count-Abweichung.
- Ausschließlich die 5 Target-Files plus der erweiterte Vitest geändert.
