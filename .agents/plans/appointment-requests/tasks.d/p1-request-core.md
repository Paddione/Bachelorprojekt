---
title: "p1-request-core — Request-State, Token, Vorlauf, Idempotency"
ticket_id: T901024
domains: [plan-authoring, dev-tooling]
status: draft
---

# appointment-requests — Implementation Plan

Partial-Plan `p1-request-core` für T901024 (Slug `appointment-requests`).
Scope: Request-Kern — State-Maschine, Token, Mindestvorlauf, Idempotency.
Zieldateien sind exklusiv; dieser Partial ändert keine weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `components/website/src/lib/appointment-requests.ts` | 0 (neu) | 900 |
| `components/website/src/pages/api/booking.ts` | 182 | 718 |

Budget-Quelle: `.ts`-Limit 900 aus `docs/code-quality/gates.yaml`
(`yq '.s1.limits' docs/code-quality/gates.yaml`); `booking.ts` ist laut
`docs/code-quality/baseline.json` nicht-baselined, wirksame Schwelle ist das
statische Limit → `components/website/src/pages/api/booking.ts` Ist 182
(Budget 718). Neue Lib-Datei mit Wachstumsreserve deutlich unter 900 halten
(Richtwert Endstand unter 300 Zeilen).

Migration `components/website/src/db/migrations/20261008_appointment_requests.sql`:
entfällt, siehe Task 0 (Entscheidung mit Begründung, keine Dateiänderung).

<!-- vitest: kein neuer Test nötig, weil der zugehörige Test
(`components/website/src/lib/__tests__/appointment-requests.test.ts`) in einem
eigenen Partial des gleichen Slugs angelegt wird; dieser Partial hat exklusiv
Lib/Handler-Scope. -->

## Task 0 — Migrations-Entscheidung: Inbox-Payload reicht, keine Migration

Steps:

1. `createInboxItem`-Signatur in `components/website/src/lib/messaging-db.ts`
   prüfen: `payload: Record<string, unknown>` (JSONB), dazu `referenceId`,
   `referenceTable`, `status` (`pending` | `actioned` | `archived`),
   `updateInboxItemStatus` für Übergänge.
2. Mapping festlegen und im Code-Kommentar von Task 1 verankern:
   - Request-State (`offen`, `bestaetigt`, `abgelehnt`, `storniert`) lebt in
     `payload.state`, Übergänge erzwingt die Lib-Funktion.
   - `inbox_items.status` spiegelt grob: `pending` solange `offen`, sonst
     `actioned`; `payload.outcome` hält den Endzustand.
   - Request-Token steht in `payload.token` und zusätzlich in `reference_id`
     (Lookup-Spalte für Folge-Partials, ohne neue Query-Helfer lesbar).
   - Idempotency-Key steht in `payload.idempotencyKey`.
3. Ergebnis dokumentieren: keine neue Tabelle, keine neue Spalte, kein Index
   nötig — die in Task 1/2 gespeicherten Felder passen vollständig in
   bestehende Spalten. Die Migration entfällt daher ersatzlos.

Akzeptanzkriterien:

- Die Begründung steht als Kommentar im Kopf von
  `appointment-requests.ts` (warum kein eigenes Schema nötig ist).
- Es wird keine `.sql`-Datei angelegt oder geändert.

Verify:

```bash
export AGENT_LOCK_SID=1503143
ls components/website/src/db/migrations/20261008_appointment_requests.sql 2>&1 | grep -c "No such file"
grep -c "inbox_items" components/website/src/lib/appointment-requests.ts
```

## Task 1 — `lib/appointment-requests.ts` neu anlegen (State, Token, Vorlauf, Idempotency)

Rot-Phase (Failing-Test-Step):

```bash
export AGENT_LOCK_SID=1503143
npx vitest run --run components/website/src/lib/__tests__/appointment-requests.test.ts
# expected: FAIL — Modul und Test-Bundle existieren vor der Implementierung nicht (Exit-Code ungleich 0)
```

Steps:

1. Typen definieren, voll typisiert ohne `any` (CQ02: Zähler steht bei 0,
   darf nicht steigen): `RequestState` (`offen` | `bestaetigt` |
   `abgelehnt` | `storniert`), `TransitionError`-Klasse, Payload-Typ für
   den Inbox-Eintrag.
2. State-Maschine `transitionRequest(from, to)` implementieren: erlaubt nur
   `offen → bestaetigt`, `offen → abgelehnt`, `bestaetigt → storniert`,
   `offen → storniert`; jeder andere Übergang wirft `TransitionError`.
   Reines Modul: keine Imports aus DB-/API-Schichten (S2), kein Env-, kein
   Pool-, kein Clock-Zugriff außer übergebenen Parametern.
3. Token-Helfer implementieren: `generateRequestToken()` erzeugt per
   `node:crypto`-Zufall einen URL-sicheren Token (mindestens 128 Bit
   Entropie); `isValidRequestTokenFormat(token)` prüft Format/Länge
   (reine Formatvalidierung, kein DB-Lookup).
4. Vorlauf-Regel `isLeadTimeOk(slotStartISO, now)` implementieren: Berlin-
   Tagesschlüssel von Slot und Anfragezeitpunkt über
   `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'` vergleichen
   (DST-sicher, keine manuellen Offsets); Slot-Tag muss strikt nach dem
   Anfrage-Tag liegen. Bestehende `berlinDayKey`-Logik aus
   `lib/caldav-cache.ts` wiederverwenden, falls importfrei von Zyklen
   möglich, sonst die gleiche Intl-Technik lokal abbilden.
5. Idempotency-Helfer `resolveIdempotencyKey(headerValue, bodyValue)`
   implementieren: Header gewinnt über Body, Trimmen, Leerstring wird
   `null`, Längenobergrenze (z. B. 128 Zeichen) mit Ablehnung bei
   Überschreitung. Keine Persistenz in der Lib (reines Modul).
6. S1-Check: Datei muss unter 900 Zeilen bleiben, Richtwert unter 300.

Akzeptanzkriterien:

- Alle fünf Exportgruppen existieren und sind explizit typisiert.
- Verbotene Übergänge (z. B. `abgelehnt → bestaetigt`,
  `storniert → offen`) werfen `TransitionError`.
- Gleich-Tag-Slot und Vergangenheits-Slot verletzen die Vorlauf-Regel,
  Folgetag erfüllt sie — auch über eine DST-Grenze hinweg.
- Kein `any`, keine `*.mentolder.de`- oder `*.korczewski.de`-Literale (S3),
  keine neuen Import-Zyklen (S2).

Verify:

```bash
export AGENT_LOCK_SID=1503143
wc -l components/website/src/lib/appointment-requests.ts
node --input-type=module -e "import('./components/website/src/lib/appointment-requests.ts')"
grep -rn ': any\|<any>\|as any' components/website/src/lib/appointment-requests.ts | wc -l
```

## Task 2 — `pages/api/booking.ts` erweitern (Idempotency, Vorlauf-409, Token)

S1-Notiz: `components/website/src/pages/api/booking.ts` Ist 182 (Budget 718).
Erwartetes Wachstum klein (Richtwert unter 80 Zeilen netto); Split nicht nötig.

Steps:

1. Idempotency-Key auslesen: Header `Idempotency-Key` bevorzugt, Fallback
   Feld `idempotencyKey` aus dem JSON-Body; normalisieren und validieren
   mit `resolveIdempotencyKey` aus Task 1. Ungültiger Key → `400`.
2. Dedupe-Lookup bei vorhandenem Key: parametrisierte Abfrage der
   `inbox_items` auf `type = 'booking'` mit passendem
   `payload->>'idempotencyKey'` im Zeitfenster der letzten 24 Stunden
   (bestehenden Pool der Messaging-DB nutzen, kein neues Modul, keine
   Änderung an fremden Dateien). Bei Treffer die Erst-Antwort erneut
   zurückgeben, ohne zweiten Inbox-Eintrag und ohne zweite Mail.
3. Vorlauf-409: `isLeadTimeOk` aus Task 1 für Nicht-Callback-Anfragen mit
   Slot prüfen; bei Verletzung `409` mit der bestehenden Fehlermeldung
   „Dieser Termin ist leider nicht mehr verfügbar." zurückgeben. Die
   bestehende Inline-Prüfung wird durch den Lib-Aufruf ersetzt (kein
   doppelter Codepfad).
4. Token erzeugen (`generateRequestToken`), in den Inbox-Payload als
   `token` plus `state: 'offen'` und `idempotencyKey` legen und als
   `referenceId` an `createInboxItem` übergeben.
5. Token in die Antwort-Mail an den Gast aufnehmen (Storno-/Umbuchungs-
   Hinweis mit Token-Bezug, ohne hartcodierte Domain — Linkbasis aus
   Request-Host oder Env ableiten) sowie in den Admin-Text.
6. Erfolgsantwort um `requestToken` und `state: 'offen'` erweitern;
   bestehende Felder unverändert lassen.

Akzeptanzkriterien:

- Doppel-POST mit gleichem Idempotency-Key erzeugt genau einen Inbox-
  Eintrag und versendet die Bestätigungs-Mail nur einmal.
- Gleich-Tag-Anfrage antwortet `409`; Folgetag-Anfrage läuft durch.
- Inbox-Payload enthält `token`, `state`, `idempotencyKey`; `reference_id`
  trägt denselben Token.
- Gast-Mail und Erfolgsantwort enthalten den Token; keine hartcodierte
  Brand-Domain im neuen Code.

Verify:

```bash
export AGENT_LOCK_SID=1503143
wc -l components/website/src/pages/api/booking.ts
grep -c "resolveIdempotencyKey\|isLeadTimeOk\|generateRequestToken" components/website/src/pages/api/booking.ts
grep -rn 'mentolder\.de\|korczewski\.de' components/website/src/pages/api/booking.ts components/website/src/lib/appointment-requests.ts | grep -v '^\s*//' | wc -l
```

## Task 3 — Verifikation und Gate-Läufe

Steps:

1. Geänderte Dateien einzeln gegen S1-Budgets prüfen (Budget 718 für
   `booking.ts`, Limit 900 für die neue Lib-Datei) und `any`-Zähler
   global gegen Limit 200 halten.
2. Pflicht-Gate-Läufe in dieser Reihenfolge ausführen.

Akzeptanzkriterien:

- Alle drei Kommandos laufen ohne Fehler durch.
- Kein S1-Ratchet-Verstoß, kein neuer `any`-Treffer, keine Baseline-
  Änderung.

Verify:

```bash
export AGENT_LOCK_SID=1503143
task test:changed
task freshness:regenerate
task freshness:check
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
```

