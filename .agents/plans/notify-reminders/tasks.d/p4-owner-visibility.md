## Task 1: Versandstatus-Spalte in owner/anfragen.astro

Context. Dieser Partial gehört zu Ticket T901025 (Slug notify-reminders) und setzt das gemergte p1-Protokoll (`components/website/src/lib/appointment-notify.ts`) voraus. Erwarteter p1-Vertrag: Status-Literale `versandt` | `fehlgeschlagen` | `ausstehend`, eine Reader-Funktion für den Status einer Anfrage und eine Resend-Funktion mit Dedupe. Schritt 1 reverifiziert den realen p1-Vertrag — die reale p1-API gewinnt bei Abweichung gegen jede Annahme in diesem Plan. Fehlt die p1-Lib im Worktree, ist dieser Partial nicht ausführbar (Abhängigkeit); es wird kein Ersatz-Protokoll erfunden.

Target files (1 MOD):

- `components/website/src/pages/owner/anfragen.astro` (Ist 92, nicht-baselined, .astro-Limit 1000, Budget 908)

### Steps

1. p1-Vertrag reverifizieren: Export-Namen, Status-Literale und Ablage (Payload-Schlüssel oder p1-Tabelle) aus der gemergten p1-Lib ablesen:
   ```bash
   ls components/website/src/lib/appointment-notify.ts
   grep -nE "export (function|const|type)" components/website/src/lib/appointment-notify.ts
   grep -nE "versandt|fehlgeschlagen|ausstehend" components/website/src/lib/appointment-notify.ts | head -n 10
   ```
   Alle folgenden Schritte verwenden die realen Namen aus dieser Ausgabe.
2. Versandstatus pro Anfrage serverseitig rendern: Reader aus Schritt 1 importieren, pro `req` genau einen der drei deutschen Statuswörter `versandt`, `fehlgeschlagen`, `ausstehend` als `<p><strong>Versandstatus:</strong> …</p>` ausgeben. Ist p1 payloadbasiert, wird das bereits geladene `payload` gelesen (keine zusätzliche Query); ist p1 tabellenbasiert, wird der p1-Batch-Helper verwendet — eigenes SQL auf Notify-State ist verboten. Die `requireOwner`-Zeilen bleiben unverändert.
3. Resend-Formular nur bei Fehler-Status: plain POST-Formular ohne JS auf `/api/owner/anfragen/${req.id}/resend` mit Button `Erneut senden`, ausschließlich gerendert wenn der Status `fehlgeschlagen` ist. Kein `<script>`, keine `client:`-Direktive.
4. Guards und Messung:
   ```bash
   grep -q "requireOwner(Astro.request.headers.get('cookie'))" components/website/src/pages/owner/anfragen.astro
   if grep -n "<script" components/website/src/pages/owner/anfragen.astro; then exit 1; fi
   if grep -n "client:" components/website/src/pages/owner/anfragen.astro; then exit 1; fi
   grep -c "Versandstatus" components/website/src/pages/owner/anfragen.astro
   wc -l components/website/src/pages/owner/anfragen.astro
   bash scripts/plan-lint.sh residual_budget components/website/src/pages/owner/anfragen.astro
   ```
   Erwartet: requireOwner vorhanden, beide Guards drucken nichts, Zähler mindestens 1, Wachstum rund 20 bis 30 Zeilen (Zielwert unter 130 von 1000, Split unnötig).

### Acceptance criteria

- Jede Anfrage auf `/owner/anfragen` zeigt genau einen Versandstatus (`versandt`, `fehlgeschlagen` oder `ausstehend`), gelesen über die p1-Lib, ohne eigenes Notify-SQL, ohne JS.
- Das Resend-Formular erscheint ausschließlich bei `fehlgeschlagen` und postet auf die resend-Route aus Task 2.
- `requireOwner` plus Login-Redirect sind unverändert; unauthentifiziert antwortet die Seite mit Redirect zum Login.
- S1: Datei bleibt deutlich unter dem .astro-Limit (Budget 908, Wachstum rund 20 bis 30 Zeilen).

## Task 2: Owner-Resend-Endpunkt resend.ts

Context. Neue Owner-Route für T901025, die eine fehlgeschlagene Nachricht über die p1-Lib (mit deren Dedupe) erneut sendet. Struktur und Antwortkonventionen spiegeln die Geschwister-Routen `annehmen.ts` und `ablehnen.ts`: `requireOwner`, Brand-Prüfung mit generischem 404 (kein Enumerierungs-Signal), deutsche Fehlermeldungen, `requestLogger`. Abweichung mit Grund: Anders als in `annehmen.ts` (Mailversand dort Nebeneffekt, Fehler nur Warn-Log) ist der Versand hier der Zweck — Erfolg und Misserfolg werden als 200 `{ success: true }` bzw. 502-Fehler an den Aufrufer zurückgemeldet. Doppel-POSTs sind sicher: Nach erfolgreichem Resend sieht der zweite Aufruf Status `versandt` und erhält 409, zusätzlich greift die p1-Dedupe.

Target files (1 NEW):

- components/website/src/pages/api/owner/anfragen/[id]/resend.ts — neue Datei, wirksame Schwelle ist das statische .ts-Limit (900); geplant sind rund 90 bis 120 Zeilen mit Wachstumsreserve.

### Steps

1. Rot-Nachweis: Probe in /tmp schreiben (gehört nicht zum Repo, kein Inventar-Eintrag) und gegen den laufenden Dev-Server (`npm run dev` in `components/website`, Port 4321) ausführen — expected: FAIL, denn die Route fehlt und Astro antwortet 404 statt 401:
   ```bash
   cat > /tmp/p4-resend-probe.bats <<'EOF'
   @test "p4: resend route answers 401 without session (route exists)" {
     code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4321/api/owner/anfragen/1/resend)
     [ "$code" = "401" ]
   }
   EOF
   bats /tmp/p4-resend-probe.bats
   ```
   Der Fehlschlag wird protokolliert; die Probe ist datenbankunabhängig (401 fällt vor jedem DB-Zugriff).
2. `resend.ts` als `POST`-Handler anlegen: Imports aus `../../../../../lib/owner-guard` (`requireOwner`, `ownerBusiness`), `messaging-db-pool` (`pool`), `appointment-requests` (`toAppointmentRequest`, `InboxRowLike`) und der p1-Lib (Namen aus Task 1 Schritt 1). Ablauf: `requireOwner` → 401 `{ error: 'Unauthorized' }`; `id`-Parsen plus Zeile laden (`SELECT id, brand, payload … WHERE id = $1 AND type = 'booking'`) plus Mapping plus Brand-Prüfung → je 404 `{ error: 'Anfrage nicht gefunden.' }`; p1-Status lesen → nur `fehlgeschlagen` fortsetzen, sonst 409 `{ error: 'Nur fehlgeschlagene Nachrichten können erneut gesendet werden.' }`; p1-Resend aufrufen → 200 `{ success: true }` oder 502 `{ error: 'Die Nachricht konnte nicht erneut gesendet werden.' }` plus Warn-Log; catch-all 500 `{ error: 'Interner Serverfehler.' }` plus Error-Log mit Präfix `[owner/anfragen/resend]`. Voll typisiert, kein `any`, keine Hostnamen-Literale, Importe nur einseitig Richtung Lib (S2).
3. Grün-Nachweis: `bats /tmp/p4-resend-probe.bats` besteht (401 ohne Session). Zusätzlich `curl -X POST` ohne Cookie gegen `annehmen` zum Vergleich — gleiche 401-Semantik. Authentifizierte Pfade (409 bei nicht-fehlgeschlagenem Status, 200/502 nach Resend) brauchen eine Owner-Session und sind Grenze dieser Probe; sie gehören zur Spec-Abdeckung des Test-Partials.
4. Messung:
   ```bash
   wc -l "components/website/src/pages/api/owner/anfragen/[id]/resend.ts"
   grep -rn ': any\|<any>\|as any' "components/website/src/pages/api/owner/anfragen/[id]/resend.ts" && exit 1 || true
   ```

### Acceptance criteria

- `POST /api/owner/anfragen/[id]/resend` ohne Session antwortet 401; unbekannte/fremde IDs antworten generisch 404 ohne Unterscheidungssignal.
- Nur Nachrichten im Status `fehlgeschlagen` werden erneut gesendet (sonst 409); der Versand läuft über die p1-Lib mit deren Dedupe.
- Erfolg meldet 200 `{ success: true }`, Versandfehler meldet 502 mit deutscher Meldung (kein stilles Schlucken).
- Die /tmp-BATS-Probe war vor der Implementierung rot (expected: FAIL) und ist danach grün.
- S1: neue Datei rund 90 bis 120 Zeilen von 900; CQ02: kein neues `any`.

## Task 3: p4-Gates und Scope-Nachweis

### Steps

1. S1-Tabelle verifizieren (Stichtag Worktree, gemessen per `residual_budget`):
   | `components/website/src/pages/owner/anfragen.astro` | 92 | 908 |
   Nach den Tasks 1–2 erneut messen: `wc -l` beider Dateien, `bash scripts/plan-lint.sh residual_budget components/website/src/pages/owner/anfragen.astro` muss weiter klar positiv sein; `resend.ts` muss unter 900 mit Reserve bleiben. Kein Split nötig (beide Dateien unter 15 % ihrer wirksamen Schwelle).
2. Gates für den p4-Scope ausführen:
   ```bash
   task quality:check
   task test:api-auth
   task test:changed
   bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
   grep -rnE '[A-Za-z0-9.-]+\.(mentolder|korczewski)\.de' components/website/src/pages/owner/anfragen.astro && exit 1 || true
   grep -rnE '[A-Za-z0-9.-]+\.(mentolder|korczewski)\.de' "components/website/src/pages/api/owner/anfragen/[id]/resend.ts" && exit 1 || true
   ```
   Ist-Stand `any` ist 0 und darf nicht steigen. `test:api-auth` bestätigt die Klassifizierung der neuen Route als authentifiziert (kein Allowlist-Eintrag nötig); S2 ist über `quality:check` abgedeckt.
3. Scope-Guard: `git status --porcelain` zeigt aus diesem Partial genau die zwei Target-Dateien (eine MOD, eine NEW); die BATS-Probe liegt in /tmp und erzeugt keinen Inventar-Bedarf (`task test:inventory` nur bei Repo-Teständerung, hier keine). Generierte Artefakte (Routen-Index u. ä.) aktualisiert zentral der finale Verify-Task des gemergten Plans per `freshness:regenerate`, nicht dieser Partial.

### Acceptance criteria

- `task quality:check`, `task test:api-auth` und `task test:changed` sind grün; `any`-Zählung unverändert 0 von 200; S3-Greps leer.
- Beide S1-Budgets eingehalten: `anfragen.astro` klar positiv restlich, `resend.ts` mit Wachstumsreserve unter 900.
- Genau zwei Dateien geändert/angelegt (Target-Files exklusiv), keine Baseline-Änderung, keine neuen Testdateien im Repo.

<!-- vitest: kein neuer Test nötig, weil die Versand-/Dedupe-Logik vollständig in der p1-Lib liegt (dort getestet), der Endpunkt nur Guard plus Status-Gatter plus Delegation ist wie die ebenfalls vitest-freien Geschwister annehmen/ablehnen, und die persistente Verhaltensabdeckung dem Spec-Partial mit tests/spec/notify-reminders.bats gehört; dieser Partial verifiziert rot-grün per /tmp-BATS-Probe. -->
