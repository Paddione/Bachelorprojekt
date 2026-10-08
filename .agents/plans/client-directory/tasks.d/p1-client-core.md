---
title: p1-client-core — Kunden-Kernlogik aus Inbox-Anfragen ableiten
ticket_id: T901026
domains: [website, datenschutz]
status: staged
---

# client-directory (p1-client-core) — Implementation Plan

Herleitung: T901019 `docs/website/massage-privacy-requirements/README.md` §6
(Mindestfelder Name/Kontakt, keine Gesundheitsdaten ohne Art.-9-Ausnahme),
T901024 `appointment-requests.ts` (`toAppointmentRequest`, States
`offen`/`bestaetigt`/`abgelehnt`/`storniert`), Inbox-Schema aus
`messaging-db.ts` (`inbox_items` mit JSONB-`payload`).

<!-- vitest: kein neuer Test in diesem Partial, weil die Suite components/website/src/lib/__tests__/clients.test.ts im Sibling-Partial des Tickets gepflegt wird -->

## File Structure

| Datei | Art | Ist-Zeilen | S1-Budget |
| --- | --- | --- | --- |
| `components/website/src/lib/clients.ts` | neu, pure (S2) | 0 | Limit `.ts` 900, Restbudget 900, Zielgröße unter 250 |
| `components/website/src/db/migrations/20261008_clients.sql` | entfällt, begründeter Verzicht | — | `.sql` steht nicht in `s1.limits`, kein S1-Budget nötig |

Budget-Herkunft: `gates.yaml` (`yq '.s1.limits' docs/code-quality/gates.yaml`:
`.ts: 900`), Baseline-Abfrage
`jq -r '."S1:components/website/src/lib/clients.ts".metric // "nicht-baselined"'`
ergibt `nicht-baselined`, daher wirksame Schwelle = statisches Limit.
CQ02-Ist: 0 `any`-Verwendungen in `components/website/src` (Limit 200);
dieses Partial fügt null hinzu.

## Task 1: Migrations-Entscheid — abgeleitete Sicht statt Kunden-Tabelle

Die Datei `components/website/src/db/migrations/20261008_clients.sql` wird
bewusst NICHT angelegt. Begründung:

1. Alle Kundenfelder (Name, E-Mail, Telefon, Leistung, Slot, State) liegen
   bereits in `inbox_items.payload` (T901024-Muster: SSOT ist die Inbox).
   Eine Kunden-Tabelle würde PII duplizieren und driften.
2. Die existierende Tabelle `customers` gehört Portal-/Keycloak-Konten
   (Fremdschlüssel aus Messaging/Threads), nicht der Massage-Kundendatei;
   keine Umnutzung fachfremder Tabellen.
3. Spätere Schreib-Operationen (korrigieren, zusammenführen, löschen)
   persistieren als Payload-Updates auf den Inbox-Zeilen des Kunden
   (Name/Telefon/E-Mail umschreiben, Zeile löschen/anonymisieren);
   auch dafür braucht es keine neue Tabelle.
4. DSGVO-Datenminimierung (§6): kein zweiter PII-Speicher, Löschung =
   Zeilen-Löschung ohne Restbestände in einer Schatten-Tabelle.
5. Präzedenz: T901024 hat seine `20261008`-Migration aus demselben Grund
   gestrichen (Header-Kommentar in `appointment-requests.ts`).

Steps:

1. Entscheid im Kopfkommentar von `clients.ts` dokumentieren (drei Sätze:
   Quelle ist `inbox_items`, keine Tabelle, Löschung per Zeilen-Delete).
2. S1-Budgets verifizieren:
   `yq '.s1.limits' docs/code-quality/gates.yaml` und
   `jq -r '."S1:components/website/src/lib/clients.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json`.

Akzeptanz: Kein `.sql`-File angelegt; Entscheid im `clients.ts`-Header
nachlesbar; Budget-Notiz (Limit 900, Restbudget 900) stimmt mit den
Befehlsausgaben überein.

## Task 2: `clients.ts` als pures Modul implementieren

Reines Modul (S2): einziger Import ist `toAppointmentRequest` plus Typen
aus `./appointment-requests.js` (selbst importfrei bis auf `node:crypto`
und `berlinDayKey`). Keine DB-/API-Imports, kein Pool, keine Env-Zugriffe.
Keine `any`-Typen (CQ02), keine Hostnamen-Literale (S3).

Öffentliche API:

- `normalizeClientEmail(email: unknown): string | null` — trimmen,
  kleinschreiben; `null` bei fehlendem `@` oder leerem Lokal-/Domainteil.
  Kein Plus-Adress-Stripping (dokumentierte Entscheidung: identitätsneutral).
- `normalizeClientName(name: string): string` — trimmen, Binnen-Whitespace
  falten, kleinschreiben (Vergleichsbasis für Dubletten-Heuristik).
- `deriveClients(rows: readonly InboxRowLike[]): ClientRecord[]` —
  Zeilen per `toAppointmentRequest` mappen (`null` = Legacy ohne
  Token/State, wird übersprungen), nach normalisierter E-Mail gruppieren,
  Zeilen ohne brauchbare E-Mail überspringen (kein Kunde ohne
  Kontaktweg, §6-Mindestfelder). Primärname = jüngster nicht-leerer Wert
  (höchste Zeilen-`id`), Telefon = jüngster nicht-leerer Wert,
  `nameVariants` = übrige distinkte Schreibweisen, Historie nach
  Zeilen-`id` aufsteigend (Zeit-Proxy, da `InboxRowLike` kein Datum
  trägt), Ausgabe nach Name sortiert (`localeCompare`, `de`).
- `ClientRecord { id, name, email, phone, requestIds, history,
  nameVariants, requestCount, openCount }` — `id` stabil abgeleitet als
  `mail:` + normalisierte E-Mail; `history`-Einträge mit
  `requestId/token/state/serviceName/slotStart/slotEnd/slotDisplay`.
  Das Nachrichtenfeld (`message`) wird bewusst NICHT übernommen:
  Freitext kann Gesundheitsangaben enthalten (Art. 9), daher kein
  Feld dafür, keine Behandlungsnotizen, kein Notizfeld am Typ.
- `searchClients(clients, query: string): ClientRecord[]` — leere
  Anfrage liefert alle; sonst Teilstring, kleingeschrieben, über Name,
  E-Mail und Namensvarianten.
- `findDuplicateCandidates(clients): DuplicateCandidate[]` mit
  `{ a, b, reason }`, `reason` aus `gleiche-telefonnummer`
  (Ziffern-normalisiert, Mindestlänge 6) oder `gleicher-name`
  (normalisierter Name gleich, E-Mails verschieden). Nur Kandidaten,
  kein Auto-Merge: Zusammenführen bleibt manueller Owner-Akt im
  späteren API-Partial. Paare deterministisch sortiert.

Aufrufer-Verträge (im Header dokumentieren): Brand-Filterung und
`is_test_data`-Ausschluss passieren beim Laden per
`listInboxItems({ brand })`, nicht in diesem Modul. E-Mail-Korrektur
ändert die abgeleitete `id`; Historie folgt über Payload-Umschreibung.

Steps:

1. Datei mit Header (SSOT-Verweis Inbox, Art.-9-Ausschluss, Aufrufer-Verträge),
   Typen und den fünf Funktionen anlegen, Zielgröße unter 250 Zeilen.
2. `npx tsc --noEmit -p components/website/tsconfig.json` muss fehlerfrei
   laufen.

Akzeptanz: Modul importiert nur `./appointment-requests.js`; `ClientRecord`
enthält kein Nachrichten-/Notizfeld; Gruppierung, Suche und Heuristik
verhalten sich wie oben; kein `any` im File.

## Task 3: Rot→Grün-Nachweis über die Ticket-Testsuite

Der Nachweis läuft über die Sibling-Suite des Tickets
(`components/website/src/lib/__tests__/clients.test.ts`, Sibling-Partial).
Rot-Beleg: Suite gegen fehlendes Modul ausführen, Import-Fehler beobachten.
Grün-Beleg: nach Task 2 erneut ausführen, Suite grün.

Steps:

1. `npx vitest run components/website/src/lib/__tests__/clients.test.ts`
   vor der Implementierung — expected: FAIL (Modul fehlt, Import-Fehler).
2. Implementierung aus Task 2 ausführen.
3. Gleicher `npx vitest run`-Befehl nach der Implementierung — alle
   Fälle grün (Gruppierung, Suche, Dubletten, Nachrichten-Ausschluss).
4. Falls das Sibling-Partial noch nicht gemergt ist, Rot→Grün im
   Sibling-Verify nachholen und hier als Ausführungsnotiz vermerken
   (kein separates Gate, nur Reihenfolge-Hinweis).

Akzeptanz: Schritt 1 belegt Rot per Import-Fehler, Schritt 3 belegt Grün
per Testrunner-Ausgabe; beide Ausgaben liegen dem Verify-Protokoll bei.

## Task 4: Verify — Gates und Freshness

Steps:

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. CQ02-Nachweis:
   `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`
5. S1-Nachweis: `wc -l components/website/src/lib/clients.ts` liegt
   unter dem `.ts`-Limit 900 mit deutlicher Reserve; keine neue
   `.sql`-Datei vorhanden.

Akzeptanz: Alle drei `task`-Befehle grün, `any`-Zähler unverändert bei
0, `clients.ts` unter 250 Zeilen, keine Migration angelegt.
