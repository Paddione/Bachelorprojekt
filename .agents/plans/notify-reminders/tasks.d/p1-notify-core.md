## Task 1: Notify-Kernmodul (Renderer + Versand-Wrapper mit Dedupe/Retry/Protokoll)

Context. Dieses Partial legt den Notify-Kern für T901025 (Slug notify-reminders). Es besitzt
genau eine neue Datei, `components/website/src/lib/appointment-notify.ts`, und fasst KEINE
andere Datei an. Anlaufstellen: `sendEmail` aus `lib/email.ts` (Rückgabe `boolean`, E2E-
Kurzschluss via optionalem `Request`), Request-Typen aus `lib/appointment-requests.ts`
(`AppointmentRequest`, Token liegt in `payload.token` / `reference_id`), Inbox-Zeilen aus
`lib/messaging-db.ts` (nur als Formwissen — KEIN Import, siehe S2-Regel unten). Die zweite
Scope-Datei, `components/website/src/db/migrations/20261008_appointment_notify.sql`, wird
bewusst NICHT angelegt (Verzicht mit Begründung, siehe Task 2). Die Vitest-Datei
`components/website/src/lib/__tests__/appointment-notify.test.ts` gehört einem
Geschwister-Partial (Tests); dieses Partial definiert nur den Modulvertrag, gegen den jene
Tests rot→grün laufen.

Target files (eine NEUE Datei; Scope exklusiv):

- `components/website/src/lib/appointment-notify.ts`: Template-Renderer für die vier
  Nachrichtentypen Bestätigung / Erinnerung / Storno / Umbuchung (deutsche Entwürfe),
  Versand-Wrapper um `sendEmail` mit Dedupe-Key, Retry und Ergebnis-Protokoll; Umfang
  unter zweihundertfünfzig Zeilen inklusive knapper Kommentar-Köpfe.

S1-Budget-Notizen (verifiziert 2026-10-08 im Worktree):

- `components/website/src/lib/appointment-notify.ts`: Ist 0 (neue Datei),
  Status nicht-baselined, wirksame Schwelle `.ts`-Limit 900 aus
  `docs/code-quality/gates.yaml` → Budget 900, Planziel unter 250 Zeilen
  (Wachstumsreserve, kein Split nötig).
- `components/website/src/db/migrations/20261008_appointment_notify.sql`: Verzicht —
  keine Datei, kein Budgetverbrauch. (`.sql` steht ohnehin nicht in `s1.limits`.)
- CQ02: Ist-Zählung `grep -rn ': any\|<any>\|as any' components/website/src` ergibt 0
  bei Limit 200 — das Modul führt null neue `any`-Verwendungen ein.

### Steps

1. Vor dem Schreiben die Anker im Worktree gegenprüfen (Drift im Commit-Body
   vermerken, Code folgt den Live-Werten):
   ```bash
   grep -n "export async function sendEmail" components/website/src/lib/email.ts
   grep -n "export interface AppointmentRequest" -A 18 components/website/src/lib/appointment-requests.ts
   grep -n "PROD_DOMAIN" components/website/src/lib/email.ts | head -5
   ```
   Erwartet: `sendEmail(params, request?)` mit `boolean`-Rückgabe; `AppointmentRequest`
   mit `id/token/name/email/serviceName/slotStart/slotDisplay`; `PROD_DOMAIN`-Muster
   `https://web.${PROD_DOMAIN}/` als Vorbild für die Link-Auflösung.
2. `components/website/src/lib/appointment-notify.ts` neu anlegen. Modulvertrag
   (exakte Exportnamen — Geschwister-Partials und Tests bauen darauf):
   - Typen: `NotifyKind` (`'bestaetigung' | 'erinnerung' | 'storno' | 'umbuchung'`),
     `NotifyParams` (`request: AppointmentRequest`, `kind`, `manageUrl`, optionale
     `slotLabel`-Überschreibung), `NotifyResult` (`{ ok, kind, key, attempts, error? }`),
     `NotifyLogEntry` (`{ key, kind, status: 'sent' | 'failed', attempts, at, error? }`).
   - `dedupeKey(requestId: number, kind: NotifyKind): string` — rein, Format
     `notify:<id>:<kind>`.
   - `renderNotify(params: NotifyParams): { subject, text, html }` — rein, kein
     Env-/DB-Zugriff. Vier deutsche Entwürfe; Pflichtslots: Name, Service, Datum,
     Uhrzeit, Token-Link (`manageUrl` wird als Paramter übergeben, nicht im
     Renderer gebaut).
   - `sendNotify(params, deps?): Promise<NotifyResult>` — Versand-Wrapper um
     `sendEmail`: prüft zuerst den Dedupe-Key gegen das übergebene bisherige
     Protokoll (bereits `sent` → sofort `{ ok: true, attempts: 0 }` ohne
     Mailversand), sonst bis zu 3 Versuche mit Backoff (Versuch 1 sofort,
     dann 1 s, dann 4 s Pause; `sleep` über `deps` injizierbar, Default
     `setTimeout`-Promise). `deps.mailer` defaultet auf `sendEmail`, `deps.request`
     wird an `sendEmail` durchgereicht (E2E-Kurzschluss bleibt wirksam).
   - `appendNotifyLog(payload, entry): Record<string, unknown>` — rein: hängt den
     Eintrag an `payload.notify` (Array, auf die letzten 20 Einträge gekappt) und
     gibt das neue Payload-Objekt zurück; persistiert NICHT (kein Pool-Import —
     Aufrufer schreiben per eigenem Inbox-UPDATE, Geschwister-Scope).
   - `formatNotifyDateTime(slotStartISO: string): string` — lokale Berlin-
     Formatierung (`Europe/Berlin`, `de-DE`, Wochentag + Datum + Uhrzeit),
     spiegelbildlich zum privaten `formatDe` in `email.ts`; Duplikat ist
     beabsichtigt, weil `email.ts` außerhalb dieses Partial-Scopes liegt und
     nicht angefasst werden darf. Fällt bei unparsbarem Input auf den
     `slotDisplay`-String des Requests zurück, nie auf eine Exception.
   - `notifyManageUrl(token: string): string` — baut den Token-Link nach dem
     `email.ts`-Muster aus `PROD_DOMAIN` (`https://web.${PROD_DOMAIN}/anfrage/<token>`);
     ohne `PROD_DOMAIN` relativer Pfad `/anfrage/<token>`. Einzige Env-Lesestelle
     des Moduls, am Modulkopf wie in `email.ts`.
3. Template-Leitplanken (T901019 §1/§6/§7, im Code als Kommentar-Kopf über
   `renderNotify` festhalten, je Typ ein Satz Zweckbindung):
   - Bestätigung: Annahmemitteilung nach Owner-Entscheidung; Erinnerung: reine
     Service-Nachricht zur Vertragsabwicklung (24-h-Hinweis); Storno:
     Stornobestätigung; Umbuchung: Mitteilung des neuen Termins.
   - Alle vier: werbefrei (keine Zusatzangebote, keine Newsletter-Hinweise),
     keine Heilkunde-Claims (keine Diagnosen, Heilungs-/Linderungsversprechen;
     Wellness-Formulierungen nur falls nötig, sonst sachlich), minimale Daten
     (Name, Service, Datum, Uhrzeit, Token-Link), KEINE Gesundheitsinfos
     (keine Anamnese-/Beschwerde-/Kontraindikationsfelder — Art. 9 bleibt
     komplett außen vor), keine Behandlungsdetails wie Anfahrt/Zugang
     (T901019 §4; Erweiterung erst nach Freigabe).
   - Betreffzeilen enthalten Datum/Uhrzeit wie `sendBookingConfirmation`
     (`Terminbestätigung — <Datum>` als Muster), Reminder zusätzlich das Wort
     `Erinnerung`, damit Filterregeln der Postfächer greifen können.
4. Scope- und Gate-Guards aus dem Worktree-Root laufen lassen (alle müssen
   grün sein):
   ```bash
   if grep -n "messaging-db\|from '\./website-core-db\|pages/api" components/website/src/lib/appointment-notify.ts; then exit 1; fi
   if grep -nE "mentolder\.de|korczewski\.de" components/website/src/lib/appointment-notify.ts | grep -v "^.*//"; then exit 1; fi
   if grep -nE ": any|<any>|as any" components/website/src/lib/appointment-notify.ts; then exit 1; fi
   if grep -niE "heilen|heilung|lindert|therapieerfolg|beschwerdefrei|diagnose" components/website/src/lib/appointment-notify.ts; then exit 1; fi
   wc -l components/website/src/lib/appointment-notify.ts
   ```
   Der erste Guard sichert S2 (kein Rück-Import auf DB-/API-Schichten — nur
   `./email.js` und `./appointment-requests.js`-Typen sind erlaubt), der zweite
   S3 (keine hartcodierten Brand-Domains außerhalb von Kommentarzeilen), der
   dritte CQ02, der vierte die Template-Leitplanken; `wc -l` muss unter 250
   bleiben (Budget 900, siehe Notizen oben).
5. Rot→Grün-Nachweis gegen die Geschwister-Testdatei (gehört dem Tests-Partial;
   dieses Partial schreibt sie NICHT, nutzt sie nur als Vertrag):
   ```bash
   npx vitest run components/website/src/lib/__tests__/appointment-notify.test.ts
   ```
   Vor Schritt 2 lautet das Ergebnis expected: FAIL (Modul fehlt); nach
   Schritt 2 + Tests-Partial ist der Lauf grün. Ist die Testdatei noch nicht
   vorhanden (Partial-Reihenfolge), dokumentiert der Executor den Stand im
   Commit-Body statt einen eigenen Test anzulegen — keine zweite Testdatei,
   kein Scope-Bruch.

### Acceptance criteria

- `components/website/src/lib/appointment-notify.ts` existiert, exportiert exakt
  `dedupeKey`, `renderNotify`, `sendNotify`, `appendNotifyLog`,
  `formatNotifyDateTime`, `notifyManageUrl` plus die Typen `NotifyKind`,
  `NotifyParams`, `NotifyResult`, `NotifyLogEntry`, und bleibt unter 250 Zeilen.
- `renderNotify` liefert für alle vier `NotifyKind`-Werte deutsche Betreff-,
  Text- und HTML-Fassungen mit Name/Service/Datum/Uhrzeit/Token-Link und ohne
  Heilkunde-Claims, Werbung oder Gesundheitsinfos.
- `sendNotify` sendet bei bereits protokolliertem Dedupe-Key keine zweite Mail,
  versucht sonst genau 3 Versuche mit Backoff und meldet das Ergebnis als
  `NotifyResult` zurück (Fehler als `error`-String, nie als stille Verschluckung).
- `appendNotifyLog` schreibt nur `payload.notify` (gekappt, mit `key/kind/status/
  attempts/at/error`), berührt keine anderen Payload-Felder und importiert kein
  DB-Modul; die Datei importiert ausschließlich `./email.js`- und
  `./appointment-requests.js`-Symbole.
- Alle vier Guards aus Schritt 4 sind grün und `wc -l` liegt unter 250.

## Task 2: Persistenz-Entscheidung (Verzicht auf eigene Protokoll-Tabelle) + Verify

Context. Die Scope-Datei
`components/website/src/db/migrations/20261008_appointment_notify.sql` wird NICHT
angelegt. Die Begründung folgt dem T901024-Präzedenzfall
(`lib/appointment-requests.ts`-Dateikopf: „the 20261008 migration is dropped“ —
Anfragen leben in `inbox_items.payload`): Das Versandprotokoll ist kleinvolumig
(höchstens eine Handvoll Einträge je Anfrage — vier Nachrichtentypen plus je
maximal ein Fehlschlag-Eintrag), wird nur je Anfrage gelesen (kein anfrage-
übergreifendes Reporting im T901025-Scope, kein JOIN-Bedarf) und profitiert von
der Atomarität (Protokoll-Anhang plus Status-Transition in einer einzigen
Inbox-UPDATE-Anweisung, keine zweite Tabelle, keine verteilte Transaktion).
DSGVO-Seite: Mit Löschung der Inbox-Zeile verschwindet das Protokoll automatisch
(kein Orphan-Risiko, kein separates Löschkonzept, minimale Datenhaltung nach
T901019 §6). Abgewogener Gegenentwurf (eigene `notify_log`-Tabelle mit
`UNIQUE(dedupe_key)` als DB-seitiger Dedupe-Garantie bei konkurrierenden
Sendern) wird verworfen, weil der einzige automatisierte Sender ein
single-instanziger CronJob ist und der Dedupe-Check (`payload.notify` enthält
`sent`-Eintrag für den Key) plus bedingtem UPDATE dafür ausreicht; sollte je ein
zweiter paralleler Sender entstehen, ist die Tabelle als Härtungs-Folgeänderung
zu planen — nicht jetzt. Die Begründung steht zusätzlich als Kommentar-Kopf in
`appointment-notify.ts` (Step 1 unten), damit sie am Code auffindbar bleibt.

Target files: keine neuen Dateien in diesem Task (nur Lese-Verifikation der
Task-1-Datei; Scope exklusiv — insbesondere keine Migration, keine Testdatei,
keine Änderung an `email.ts`, `appointment-requests.ts` oder `messaging-db.ts`).

### Steps

1. In `components/website/src/lib/appointment-notify.ts` steht am Modulkopf ein
   Kommentar-Block `Persistence decision (no migration needed)`, der den
   Verzicht auf `20261008_appointment_notify.sql` mit den drei Stichworten
   Volumen, Atomarität und Löschkonzept begründet und den T901024-Präzedenz
   nennt. Prüfen per:
   ```bash
   grep -n "no migration needed" components/website/src/lib/appointment-notify.ts
   test ! -e components/website/src/db/migrations/20261008_appointment_notify.sql && echo "migration correctly absent"
   ```
   Beide Zeilen müssen ausgeben (Kommentar gefunden, Datei abwesend).
2. Typcheck des Moduls ohne Projekt-Build (schnell, keine Seiteneffekte):
   ```bash
   npx tsc --noEmit -p components/website/tsconfig.json
   ```
   Muss ohne Fehler durchlaufen; neue Fehler im Notify-Modul werden dort
   behoben, Fehler in Fremddateien nur im Commit-Body vermerkt (Scope!).
3. Finale Verify-Kette für dieses Partial (exakte Befehle, alle grün):
   ```bash
   npx vitest run components/website/src/lib/__tests__/appointment-notify.test.ts
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
   Der Vitest-Lauf ist der Modul-Vertragsnachweis (grün erst gemeinsam mit dem
   Tests-Partial — davor gilt der `expected: FAIL`-Stand aus Task 1, Schritt 5);
   die drei `task`-Befehle sind die Pflichtkette (gezielte Tests, Artefakte
   regenerieren, CI-Äquivalent inkl. S1–S4-Ratchet und Baseline-Assertion).
   Schlägt `freshness:check` an einer Fremddatei-Baseline fehl, wird das als
   Befund im Commit-Body vermerkt statt per Baseline-Eingriff umgangen.

### Acceptance criteria

- Die Datei `20261008_appointment_notify.sql` existiert NICHT und der
  `no migration needed`-Begründungsblock steht am Kopf von
  `appointment-notify.ts` (Volumen, Atomarität, Löschkonzept, T901024-Verweis).
- `npx tsc --noEmit` läuft fehlerfrei; kein Scope-Bruch (keine Änderung
  außerhalb von `appointment-notify.ts`).
- Die Verify-Kette ist gelaufen: Vitest-Vertrag grün (oder sauber als
  `expected: FAIL` vor Tests-Partial dokumentiert), `task test:changed`,
  `task freshness:regenerate` und `task freshness:check` grün.
