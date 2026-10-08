## Task 1: Kontaktkorrektur korrigieren.ts mit Validierung

Kontext. Dieses Partial setzt die Owner-Aktionen fuer T901026 (Slug client-directory) um: vier neue API-Endpunkte unter `components/website/src/pages/api/owner/kunden/[id]/`. Es besitzt exakt vier Zieldateien (unten), erstellt oder aendert keine weitere Datei und setzt voraus, dass das Lib-Partial p1 gemergt ist: `components/website/src/lib/clients.ts` muss existieren. Der Executor verifiziert das in Schritt 1 vor jeder Code-Aenderung.

Angenommener p1-Vertrag (kanonische Namen; weicht die Lib-Datei ab, folgen alle Schritte den echten Exporten, und die Abweichung landet in der Commit-Message): Typ `Client` mit `id`, `brand`, `name`, `email`, `phone`; Typ `ClientHistoryEntry` mit `id`, `clientId`, `date`, `kind`, `summary`; Funktionen `getClient(id, brand)`, `updateClientContact(id, brand, patch)`, `getClientHistory(id, brand)`, `clientRetentionStatus(id, brand)`, `anonymizeClient(id, brand)`, `deleteClient(id, brand)`, `mergeClients(keepId, dropId, brand)`. `getClient` gibt bei unbekannter oder markenfremder ID `null` zurueck; `updateClientContact` gibt `false` bei E-Mail-Konflikt mit einem anderen Eintrag derselben Marke zurueck; `mergeClients` gibt `false` bei bereits zusammengefuehrter Quelle zurueck.

S1-Budgets (verifiziert 2026-10-08 im Worktree, gates.yaml: `.ts` 900): Alle vier Dateien sind neu — das Verzeichnis `components/website/src/pages/api/owner/kunden/` existiert noch nicht. Ist 0, nicht baselined, wirksame Schwelle 900, Budget 900 je Datei. Zielstaende um 90 bis 170 Zeilen je Endpunkt, alle deutlich unter 80 Prozent der wirksamen Schwelle, daher ist kein Split noetig.

Zieldateien (vier neue Dateien, exklusiv):

- `components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts` (korrigieren.ts): Kontaktdaten korrigieren, validiert.
- `components/website/src/pages/api/owner/kunden/[id]/export.ts` (export.ts): CSV-Export pro Kunde (Kontakt plus Historie).
- `components/website/src/pages/api/owner/kunden/[id]/loeschen.ts` (loeschen.ts): Loeschung mit Steuerfristen-Pruefung und Anonymisierungs-Fallback.
- `components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts` (zusammenfuehren.ts): expliziter manueller Merge zweier Eintraege.

Alle vier Endpunkte folgen dem Muster aus `api/owner/anfragen/[id]/annehmen.ts`: `requireOwner` aus dem Cookie-Header, sonst 401 mit `{ error: 'Unauthorized' }`; Marke aus `ownerBusiness(session).brand` mit `process.env.BRAND`-Fallback; unbekannte oder markenfremde ID gibt 404 mit `{ error: 'Kunde nicht gefunden.' }`; unerwartete Fehler landen mit `locals.requestLogger` im 500-Handler. Kleine Body-Helfer werden inline je Datei dupliziert (Vorbild `readBody`-Stil in den Owner-Endpunkten), weil ein fuenfter Helper-File gegen die Target-Exklusivitaet verstiesse.

### Steps

1. Verifiziere die Voraussetzungen vom Worktree-Root aus und halte Drift im Commit fest:
   ```bash
   ls components/website/src/lib/clients.ts
   grep -n 'export .*getClient\|export .*updateClientContact\|export .*getClientHistory\|export .*clientRetentionStatus\|export .*anonymizeClient\|export .*deleteClient\|export .*mergeClients' components/website/src/lib/clients.ts
   grep -n 'export async function requireOwner\|export function ownerBusiness' components/website/src/lib/owner-guard.ts
   ```
   Fehlt ein p1-Export unter anderem Namen, gelten die echten Namen fuer alle folgenden Tasks.
2. Erstelle `components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts` (korrigieren.ts) als `POST: APIRoute` mit der Auth-, Marken- und Lade-Logik aus dem Kontext (401/404-Faelle identisch zum Muster; nicht-numerische ID gibt 404). Lies den Body JSON- oder formular-tolerant mit einem inline `readBody`. Erlaube ausschliesslich die Kontaktfelder `name`, `email`, `phone`; jedes andere Feld gibt 400 mit `{ error: 'Unbekanntes Feld: <name>.' }`, ein leeres Patch nach Trim 400 mit `{ error: 'Keine Aenderung uebermittelt.' }`.
3. Validiere jedes uebermittelte Feld, jedes mit 400 und eigener deutscher Meldung: `name` nicht leer und hoechstens 200 Zeichen; `email` hoechstens 254 Zeichen und gegen ein einfaches E-Mail-Muster (`/.+@.+\..+/`); `phone` hoechstens 50 Zeichen und nur Ziffern, Leerzeichen sowie `+ - / ( )`. Rufe danach `updateClientContact(id, brand, patch)`; meldet sie `false` (E-Mail bereits bei einem anderen Eintrag der Marke), antworte 409 mit `{ error: 'Diese E-Mail-Adresse ist bereits einem anderen Kunden zugeordnet.' }`. Erfolg antwortet 200 mit `{ success: true }`; 500-Handler wie im Muster.
4. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'requireOwner\|updateClientContact' 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts'
   wc -l 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard beide Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Nicht-Owner erhalten 401, unbekannte, nicht-numerische oder markenfremde IDs 404.
- Nur `name`, `email`, `phone` sind schreibbar; unbekannte Felder, leere Patches und jede verletzte Feldregel geben 400 mit eigener Meldung; E-Mail-Dopplungen geben 409.
- Erfolgreiche Korrekturen persistieren ueber `updateClientContact` und antworten 200 mit `{ success: true }`.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 2: CSV-Export export.ts mit Kontakt und Historie

Kontext. Dieser Task erstellt den GET-Endpunkt, der Kontakt und Historie eines Kunden als CSV-Datei zum Download anbietet. Format-Vorbild ist `api/admin/projekte/export.ts` (BOM, Escapes, Download-Header), mit Semikolon als Trennzeichen nach deutscher Excel-Konvention: zwei Sektionen (`Kontakt` als Feld/Wert-Paare, `Historie` als chronologische Zeilen), getrennt durch eine Leerzeile.

### Steps

1. Erstelle `components/website/src/pages/api/owner/kunden/[id]/export.ts` (export.ts) als `GET: APIRoute` mit derselben Auth-, Marken- und Lade-Logik wie Task 1 Schritt 2 (401/404-Faelle identisch). Lade die Historie via `getClientHistory(id, brand)`; ein leeres Ergebnis ist kein Fehler, sondern rendert nur die Kopfzeile der Historie-Sektion.
2. Baue das CSV mit einer `csvCell`-Funktion nach dem Muster aus `projekte/export.ts`, angepasst auf Semikolon: Zellen, die `"`, `;`, `\n` oder `\r` enthalten, werden in Anfuehrungszeichen gesetzt und innere Anfuehrungszeichen verdoppelt. Sektion `Kontakt` mit Kopfzeile `Feld;Wert` und einer Zeile je Kontaktfeld (Name, E-Mail, Telefon); danach eine Leerzeile, dann Sektion `Historie` mit Kopfzeile `Datum;Art;Zusammenfassung` und einer Zeile je Eintrag in chronologischer Reihenfolge (aeltester zuerst). Verbinde Zeilen mit `\r\n` und stelle `\uFEFF` (BOM) voran.
3. Antworte mit `Content-Type: text/csv; charset=utf-8` und `Content-Disposition: attachment; filename="kunde-<id>-<YYYY-MM-DD>.csv"` (Datum aus `new Date().toISOString().slice(0, 10)`, ID numerisch aus der Route, kein Nutzerinput im Dateinamen). DB-Fehler geben 500 mit Text `Datenbankfehler` wie in `projekte/export.ts`; 500-Handler mit `locals.requestLogger`.
4. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/kunden/[id]/export.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/kunden/[id]/export.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'csvCell\|getClientHistory\|Content-Disposition' 'components/website/src/pages/api/owner/kunden/[id]/export.ts'
   wc -l 'components/website/src/pages/api/owner/kunden/[id]/export.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard alle drei Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Auth- und 404-Verhalten stimmen mit dem Korrektur-Endpunkt ueberein.
- Der Export enthaelt Kontakt- und Historie-Sektion, trennt mit Semikolon, maskiert `"`, `;` und Zeilenumbrueche (z. B. Name mit Semikolon oder Anmerkung mit Umbruch bleibt ein Feld), beginnt mit BOM, nutzt `\r\n` und sendet `text/csv; charset=utf-8` plus Attachment-Disposition mit stabilem Dateinamen.
- Kunden ohne Historie erhalten eine gueltige Datei mit Kontakt plus leerer Historie-Sektion.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 3: Loesch-Endpunkt loeschen.ts mit Steuerfristen-Pruefung

Kontext. Dieser Task erstellt den POST-Endpunkt, der einen Kunden unter Beachtung der Aufbewahrungspflichten entfernt. Regelquelle ist T901019 §5-6 (`docs/website/massage-privacy-requirements/README.md`): Steuerfristen (§257 HGB, §147 AO, GoBD) gehen als Mindestaufbewahrung vor (T901019 §6); wo die Loeschung dadurch blockiert ist, werden Kontaktdaten anonymisiert statt geloescht, Rechnungsdaten bleiben erhalten. Der Datei-Kopf traegt einen Kommentar mit dieser Regelquelle und dem Hinweis, dass Aufbewahrungsdetails der Steuerberatung vorbehalten sind (Recherche-Checkliste, keine Rechts- oder Steuerberatung).

### Steps

1. Erstelle `components/website/src/pages/api/owner/kunden/[id]/loeschen.ts` (loeschen.ts) als `POST: APIRoute` mit derselben Auth-, Marken- und Lade-Logik wie Task 1 Schritt 2 (401/404-Faelle identisch). Frage danach `clientRetentionStatus(id, brand)`; der Rueckgabewert unterscheidet `blocked: true` (Rechnungsdaten vorhanden oder Frist laeuft, mit `retainUntil`-Datum) von `blocked: false`. Weicht der p1-Name oder die Form ab, gelten die echten Exporte (Drift-Regel aus Task 1 Schritt 1).
2. Ist die Loeschung blockiert, rufe `anonymizeClient(id, brand)` (Kontaktfelder Name/E-Mail/Telefon werden durch nicht-personenbezogene Platzhalter ersetzt, Rechnungs- und Historienreferenzen bleiben) und antworte 200 mit `{ success: true, mode: 'anonymisiert', hinweis: 'Rechnungsdaten bleiben bis <retainUntil> gespeichert (steuerliche Aufbewahrung).' }`. Ist sie nicht blockiert, rufe `deleteClient(id, brand)` und antworte 200 mit `{ success: true, mode: 'geloescht' }`. Der `mode` ist Pflichtfeld jeder Erfolgsantwort, damit der Owner jederzeit sieht, welcher Pfad genommen wurde.
3. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts' | grep -v '^\s*//'; then exit 1; fi
   grep -c 'clientRetentionStatus\|anonymizeClient\|deleteClient' 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts'
   wc -l 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts'
   ```
   Die Muster-Guards muessen leer bleiben, der Vertrags-Guard alle drei Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Auth- und 404-Verhalten stimmen mit dem Korrektur-Endpunkt ueberein.
- Bei laufender Aufbewahrungspflicht wird anonymisiert statt geloescht; die Antwort nennt `mode: 'anonymisiert'` und einen Behalten-Hinweis mit Datum; ohne Pflicht wird hart geloescht mit `mode: 'geloescht'`.
- Kontaktdaten sind nach Anonymisierung nicht mehr personenbezogen, Rechnungsdaten bleiben erhalten; der Datei-Kopf nennt T901019 §5-6 als Regelquelle.
- Die Datei bleibt unter dem `.ts`-Limit, ohne `any` und ohne hartcodierte Domains.

## Task 4: Merge-Endpunkt zusammenfuehren.ts mit Bestaetigung beider IDs

Kontext. Dieser Task erstellt den POST-Endpunkt, der zwei Kundeneintraege manuell zusammenfuehrt. Der Merge ist niemals still: Die Anfrage muss beide IDs plus eine explizite Bestaetigung enthalten, die Antwort spiegelt beide IDs zurueck. Die Historie beider Eintraege wird vereint (chronologisch, je Zeile mit der Herkunfts-ID markiert); die Kontaktdaten des behaltenen Eintrags gewinnen; der aufgegebene Eintrag wird als zusammengefuehrt markiert und ist danach nicht mehr direkt adressierbar.

### Steps

1. Erstelle `components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts` (zusammenfuehren.ts) als `POST: APIRoute` mit derselben Auth-Logik wie Task 1 (401 identisch). Die Routen-ID ist der behaltene Eintrag (`keepId`); lies den Body JSON- oder formular-tolerant mit einem inline `readBody` und fordere `dropId` (aufgegebener Eintrag) plus `confirm: true`. Fehlt `dropId` oder ist `confirm` nicht exakt `true`, antworte 400 mit `{ error: 'Zusammenfuehrung erfordert beide Eintrags-IDs und bestaetigtes confirm.' }`; ist `dropId` gleich `keepId`, antworte 400 mit `{ error: 'Beide Eintraege muessen verschieden sein.' }`.
2. Lade beide Eintraege via `getClient` (jeweils mit Marke); fehlt einer oder gehoert er einer fremden Marke, antworte 404 mit `{ error: 'Kunde nicht gefunden.' }`. Rufe `mergeClients(keepId, dropId, brand)`; meldet sie `false` (Quelle bereits zusammengefuehrt), antworte 409 mit `{ error: 'Dieser Eintrag wurde bereits zusammengefuehrt.' }`. Die Lib vereint die Historie chronologisch mit Herkunfts-ID je Zeile; die Kontaktdaten des `keepId` bleiben unveraendert.
3. Antworte 200 mit `{ success: true, kept: keepId, merged: dropId, historyCount }`, wobei `historyCount` die vereinte Zeilenzahl aus dem Lib-Ergebnis ist. 500-Handler wie im Muster.
4. Pruefe Datei-Guards und Budget:
   ```bash
   if grep -rnE ': any|<any>|as any' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'; then exit 1; fi
   if grep -rniE 'mentolder\.de|korczewski\.de' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts' | grep -v '^\s*//'; then exit 1; fi
   if grep -nE 'deleteClient|anonymizeClient' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'; then exit 1; fi
   grep -c 'mergeClients\|requireOwner' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'
   wc -l 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'
   ```
   Die Muster- und Loesch-Guards muessen leer bleiben (der Merge nutzt ausschliesslich `mergeClients`, nie Loeschfunktionen direkt), der Vertrags-Guard beide Symbole finden, die Zeilenzahl unter 900.

### Acceptance criteria

- Ohne beide IDs oder ohne `confirm: true` findet kein Merge statt (400); gleiche IDs geben 400; unbekannte oder markenfremde IDs geben 404; bereits zusammengefuehrte Quellen geben 409.
- Erfolgreiche Merges vereinen die Historie chronologisch mit Herkunfts-ID, behalten die Kontaktdaten des `keepId` und spiegeln `kept`, `merged` und `historyCount` in der Antwort.
- Der Merge-Pfad ruft weder `deleteClient` noch `anonymizeClient` direkt auf und bleibt unter dem `.ts`-Limit.

## Task 5: Verify, Scope-Nachweis und Commit

Kontext. Dieser Task beweist Rot-nach-Gruen, die Target-Exklusivitaet, die S1-Budgets und die CI-Gates und committet genau die vier Dateien.

<!-- vitest: kein neuer Test noetig, weil die Endpunkt-Abdeckung in der Ticket-Spec-Suite tests/spec/client-directory.bats des Tests-Partials liegt und dieses Partial aus Target-Exklusivitaet keine Testdatei anlegt -->

### Steps

1. Rot-nach-Gruen gegen die Ticket-Spec (gehoert dem Tests-Partial, wird hier nur ausgefuehrt, nicht angelegt):
   ```bash
   bats tests/spec/client-directory.bats
   ```
   Vor Task 1 bis 4 ist das Ergebnis erwartet rot (expected: FAIL, fehlende Endpunkte oder noch nicht gelandete Spec); nach allen Tasks muss die Suite gruen sein. Ist die Spec-Datei noch nicht vorhanden, protokolliere Rot-durch-Abwesenheit und ziehe den Lauf nach Landung des Tests-Partials nach.
2. Weise die Target-Exklusivitaet nach: `git status --porcelain` darf nur die vier Zieldateien zeigen (plus keine anderen Aenderungen):
   ```bash
   git status --porcelain
   ```
3. Pruefe die S1-Budgets gegen die wirksame Schwelle neu (Ratchet, kein statisches Limit):
   ```bash
   wc -l 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts' 'components/website/src/pages/api/owner/kunden/[id]/export.ts' 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'
   jq -r '."S1:components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
   ```
   Alle vier Dateien muessen unter 900 bleiben; der Baseline-Wert muss weiter `nicht-baselined` lauten.
4. Fahre die Pflicht-Gates:
   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
   Alle drei muessen gruen sein; `freshness:check` deckt den S1-Ratchet, S2 bis S4 und die Baseline-Assertion ab.
5. Committe genau die vier Dateien im Ticket-Scope:
   ```bash
   git add 'components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts' 'components/website/src/pages/api/owner/kunden/[id]/export.ts' 'components/website/src/pages/api/owner/kunden/[id]/loeschen.ts' 'components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts'
   git commit -m "feat(T901026): owner actions kunden [T901026]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss exakt vier Dateien zeigen.

### Acceptance criteria

- Die Ticket-Spec ist nach den Tasks gruen (oder Rot-durch-Abwesenheit ist bei fehlendem Tests-Partial protokolliert und zur Nachholung markiert).
- `git status` und der Commit-Stat zeigen exakt die vier Zieldateien, keine weitere.
- Alle S1-Budgets halten gegen die wirksame Schwelle und `task test:changed`, `task freshness:regenerate`, `task freshness:check` sind gruen.
