---
title: "cockpit-realtime-push — Implementation Plan"
ticket_id: T002643
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-realtime-push — Implementation Plan

_Ticket: T002643 · Cockpit von Poll auf PostgreSQL-Benachrichtigung umstellen und die SDLC-Aktionen bedienbar machen_

Der Plan wird **seriell von einem Agenten** abgearbeitet (lokales Modell, DeepSeek als
Ausweichpfad). Die Schritte sind deshalb kleiner geschnitten als sonst und nennen jeweils
die genaue Datei, den genauen Befehl und das erwartete Ergebnis. Kein Schritt verlangt eine
Entwurfsentscheidung — die sind im Proposal getroffen.

**Reihenfolge ist bindend.** Task 1 repariert einen bestehenden Ausfall (der Adapter zeigt
auf Routen, die der Build-Target-Split entfernt hat). Ohne Task 1 lässt sich kein
nachfolgender Schritt am laufenden Cockpit prüfen, weil jeder Panel-Fetch in einen 404
läuft.

## File Structure

```
tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats              (neu · RED-Test Task 1)
tests/spec/sdlc-cockpit/action-inventory.bats                (neu · Task 9)
.lavish/kit/adapter.js                                        (edit · Task 1, 5)
.lavish/kit/panel.js                                          (edit · Task 6)
.lavish/kit/action-policy.js                                  (edit · Task 7)
website/src/db/migrations/20260804_cockpit_notify_triggers.sql (neu · Task 2)
website/src/lib/sdlc/cockpit-listen-hub.ts                     (neu · Task 3)
website/src/lib/sdlc/__tests__/cockpit-listen-hub.test.ts      (neu · Task 3)
website/src/pages/sdlc/api/cockpit/stream.ts                   (neu · Task 4)
website/src/pages/sdlc/api/cockpit/stream.test.ts              (neu · Task 4)
website/src/pages/sdlc/api/cockpit/actions.ts                  (neu · Task 7)
website/src/pages/sdlc/api/cockpit/actions.test.ts             (neu · Task 7)
website/src/pages/sdlc/cockpit.astro                           (edit · Task 8)
docs/sdlc/cockpit-action-inventory.md                          (neu · Task 9)
website/src/data/test-inventory.json                           (regeneriert · Task 10)
```

**S1-Budgets (wirksame Schwelle je Datei).** `.lavish/**` liegt nicht im Scan-Universum von
`docs/code-quality/gates.yaml` (`code_roots` führt `.lavish` nicht), es besteht dort kein
Zeilenbudget. Für die übrigen Ziele:

| Datei | jetzt | Limit | Budget |
|---|---|---|---|
| `website/src/pages/sdlc/cockpit.astro` | 209 | 600 (`.astro`) | 391 |
| `website/src/lib/sdlc/cockpit-listen-hub.ts` | 0 (neu) | 900 (`.ts`) | 900 |
| `website/src/pages/sdlc/api/cockpit/stream.ts` | 0 (neu) | 900 (`.ts`) | 900 |
| `website/src/pages/sdlc/api/cockpit/actions.ts` | 0 (neu) | 900 (`.ts`) | 900 |

Keine Datei kommt ihrer Schwelle nahe; ein Verkleinerungsschritt ist nicht nötig.

---

## Task 1 — RED: Adapter zeigt auf entfernte Routen

Der Build-Target-Split (T002624) hat die SDLC-Routen nach `website/src/pages/sdlc/`
verschoben. `.lavish/kit/adapter.js` zeigt weiter auf `/api/admin/cockpit/*` und
`/api/admin/factory-control`. Diese Routen existieren nicht mehr — jeder Panel-Fetch endet
im 404.

**Files:** `tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats` (neu).

1. Lege die Testdatei an. Sie prüft **Ergebnisse**, nicht Quelltextmuster: für jeden
   `website: true`-Eintrag im Endpunkt-Verzeichnis wird geprüft, ob unter
   `website/src/pages/` eine Routendatei für den Pfad existiert (Astro leitet die URL vom
   Dateipfad ab, die Existenz der Datei ist damit die Erreichbarkeitsbedingung).

   Header-Kommentar der Datei (Pflicht nach Test-Resultats-Konvention): der Test prüft
   Datei-Existenz als Erreichbarkeitsbedingung des Astro-Routings, nicht Implementierungsmuster.

   Der Test enthält einen **Positiv-Anker**: er stellt zuerst fest, dass mindestens ein
   `website: true`-Eintrag gefunden wurde. Ohne diesen Anker liefe die Prüfung über eine
   leere Kandidatenliste und bestünde vakuos.

   ```bash
   # Struktur des Tests (ein @test-Block):
   #   1. Kandidaten aus adapter.js extrahieren (Zeilen mit "website: true")
   #   2. POSITIV-ANKER: [ "$count" -gt 0 ]  — sonst ist die Aussage leer
   #   3. Fuer jeden Pfad: Routendatei unter website/src/pages/ muss existieren
   #   4. Kein Pfad darf mit /api/admin/cockpit/ beginnen
   ```

2. Führe den Test aus:

   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats
   # expected: FAIL (rot — der Adapter zeigt noch auf die entfernten /api/admin/-Pfade)
   ```

**Verify Task 1:** Der Test läuft und schlägt fehl. Die Fehlermeldung nennt die Pfade, die
keine Routendatei haben.

---

## Task 2 — GREEN: Adapter-Pfade auf das SDLC-Target ziehen

**Files:** `.lavish/kit/adapter.js` (edit, `ENDPOINT_MAP` ab Zeile 19).

1. Ändere im `ENDPOINT_MAP` die fünf website-bedienten Einträge auf die tatsächlichen
   Routen. Verifizierte Zielpfade (jede Datei existiert auf `main`):

   | Schlüssel | alt | neu |
   |---|---|---|
   | `portfolio` | `/api/admin/cockpit/portfolio` | `/sdlc/api/cockpit/portfolio` |
   | `pods-list` | `/api/admin/cluster/pods-list` | `/sdlc/api/cluster/pods-list` |
   | `factory-control` | `/api/admin/factory-control` | `/sdlc/api/factory-control` |
   | `ticket-status` | `/api/admin/cockpit/ticket-status` | `/sdlc/api/cockpit/ticket-status` |
   | `audit` | `/api/admin/cockpit/audit` | `/sdlc/api/cockpit/audit` |

2. Korrigiere zusätzlich `brainLinks()` (derzeit Zeile 356): der Aufruf übergibt einen
   vollständigen Pfad als Endpunkt-Schlüssel an `fetchEndpoint`, was im
   `ENDPOINT_MAP`-Lookup fehlschlägt und still `available: false` ergibt. Nimm `brain` als
   Eintrag ins `ENDPOINT_MAP` auf (`/sdlc/api/cockpit/brain`, `website: true`) und rufe
   `fetchEndpoint('brain', { query: ... })` auf.

3. Test erneut ausführen:

   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/adapter-sdlc-paths.bats
   # erwartet: PASS
   ```

**Verify Task 2:** Test grün. Kein Eintrag im `ENDPOINT_MAP` beginnt mit `/api/admin/`.

---

## Task 3 — NOTIFY-Trigger auf den Cockpit-Tabellen

**Files:** `website/src/db/migrations/20260804_cockpit_notify_triggers.sql` (neu).

1. Schreibe die Migration nach dem Muster von `20260802_create_cockpit_audit.sql`:
   idempotent und mit `to_regnamespace('tickets')` abgesichert. Ohne diesen Wächter bricht
   ein Migrationslauf gegen eine Datenbank ohne `tickets`-Schema komplett ab.

2. Lege eine Triggerfunktion `tickets.cockpit_notify()` an, die auf dem Kanal
   `cockpit_events` benachrichtigt. Die Nutzlast trägt **nur Kennfelder**, keinen
   Zeileninhalt:

   ```sql
   -- Nutzlast bewusst schlank: pg_notify bricht ueber 8000 Byte hart ab.
   -- Der Empfaenger liest die maßgebliche Zeile selbst nach; die Nutzlast
   -- sagt nur, WAS sich geaendert hat, nicht WIE es jetzt aussieht.
   PERFORM pg_notify('cockpit_events', json_build_object(
     'domain', TG_ARGV[0],
     'op',     TG_OP,
     'at',     extract(epoch from now())
   )::text);
   ```

3. Hänge die Funktion an drei Tabellen (jeweils `AFTER INSERT OR UPDATE`, `FOR EACH ROW`),
   mit der Domäne als Trigger-Argument:
   - `tickets.factory_phase_events` → Domäne `factory`
   - `tickets.cockpit_audit` → Domäne `audit`
   - die Ticket-Tabelle für Statuswechsel → Domäne `tickets`; beschränke den Trigger mit
     `WHEN (OLD.status IS DISTINCT FROM NEW.status)`, damit nicht jede Feldänderung feuert.

   Ermittle den genauen Tabellennamen vor dem Schreiben:

   ```bash
   grep -rn "FROM tickets\." website/src/lib/sdlc/factory-floor.ts | head -5
   ```

4. Migration anwenden und die Benachrichtigung tatsächlich beobachten — nicht nur die
   Trigger-Existenz prüfen:

   ```bash
   # In einer psql-Sitzung: LISTEN cockpit_events;
   # In einer zweiten: INSERT in tickets.factory_phase_events
   # erwartet: die erste Sitzung meldet eine Notification mit "domain":"factory"
   ```

**Verify Task 3:** Ein Insert in `tickets.factory_phase_events` erzeugt eine beobachtbare
Benachrichtigung auf `cockpit_events`. Ein wiederholter Migrationslauf ist folgenlos.

---

## Task 4 — LISTEN-Verteiler mit genau einer Verbindung

**Files:** `website/src/lib/sdlc/cockpit-listen-hub.ts` (neu),
`website/src/lib/sdlc/__tests__/cockpit-listen-hub.test.ts` (neu).

Der Verteiler hält **eine** langlebige Verbindung und versorgt alle verbundenen
Cockpit-Sitzungen. Eine Verbindung pro Browser wäre die naheliegende, aber falsche Lösung:
der Pool hat eine feste Obergrenze, und eine `LISTEN`-Verbindung ist dauerhaft belegt — bei
mehreren offenen Cockpits wäre der Pool erschöpft und die übrige Website ohne Datenbank.

1. Exportiere:

   ```ts
   export type CockpitEvent = { domain: string; op: string; at: number };
   export function subscribe(fn: (ev: CockpitEvent) => void): () => void;
   export function subscriberCount(): number;
   ```

2. Beim ersten Abonnenten: einen dedizierten Client aus `pool` (`website/src/lib/db-pool.ts`)
   verbinden, `LISTEN cockpit_events` absetzen, `notification`-Ereignisse an alle Abonnenten
   verteilen. Beim letzten Abgang: `UNLISTEN`, Verbindung freigeben.

3. Verbindungsabbruch behandeln: bei `error` auf dem Client die Verbindung schließen und
   nach einer Wartezeit neu aufbauen, solange Abonnenten vorhanden sind. Nach einem
   Wiederaufbau ein Ereignis `{ domain: 'reconnect' }` verteilen — die Abonnenten haben
   während der Lücke Benachrichtigungen verpasst und müssen einmal vollständig nachlesen.
   Eine stille Wiederverbindung wäre die gefährlichere Variante: das Cockpit sähe verbunden
   aus und zeigte veraltete Daten.

4. Test schreiben (Vitest, `pg`-Client gemockt): zwei Abonnenten → genau ein `connect`;
   Abmeldung beider → `UNLISTEN` und Freigabe; Fehler auf dem Client → Wiederaufbau und
   `reconnect`-Ereignis.

   ```bash
   cd website && pnpm vitest run src/lib/sdlc/__tests__/cockpit-listen-hub.test.ts
   ```

**Verify Task 4:** Tests grün. Zwei Abonnenten teilen sich nachweislich eine Verbindung.

---

## Task 5 — SSE-Route unter Admin-Sitzung

**Files:** `website/src/pages/sdlc/api/cockpit/stream.ts` (neu),
`website/src/pages/sdlc/api/cockpit/stream.test.ts` (neu).

1. Nimm `website/src/pages/sdlc/api/factory-floor/stream.ts` als Vorlage — Auth-Prüfung,
   `ReadableStream`, Header und Abbruchbehandlung sind dort bereits richtig. Ersetze den
   `setInterval`-Poll durch `subscribe()` aus Task 4.

2. Beachte die Importtiefe: die Route liegt vier Ebenen unter `src`, also
   `../../../../lib/auth` (identisch zur Vorlage).

3. Struktur:

   ```ts
   const session = await getSession(request.headers.get('cookie'));
   if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
   // ... ReadableStream:
   //   unsubscribe = subscribe((ev) => send(ev.domain, ev));
   //   beatTimer  = setInterval(() => send('heartbeat', { t: Date.now() }), STREAM_HEARTBEAT_MS);
   //   cleanup: unsubscribe() UND clearInterval(beatTimer) — beides, sonst bleibt
   //            nach dem Trennen ein Timer auf einem geschlossenen Controller stehen.
   ```

   Der Heartbeat bleibt: ohne ihn ist eine ruhige Verbindung von einer abgerissenen nicht zu
   unterscheiden, und Zwischenschichten schließen ungenutzte Verbindungen.

4. Test: Anfrage ohne Sitzung → 401 und **kein** Abonnement (`subscriberCount()` bleibt 0);
   Anfrage mit Admin-Sitzung → 200 mit `content-type: text/event-stream`; Abbruch →
   Abonnentenzahl fällt zurück.

   ```bash
   cd website && pnpm vitest run src/pages/sdlc/api/cockpit/stream.test.ts
   ```

**Verify Task 5:** Tests grün. Die 401-Antwort hinterlässt kein Abonnement.

---

## Task 6 — Adapter: Push statt Poll, Vertrag unverändert

**Files:** `.lavish/kit/adapter.js` (edit).

`panel.js` konsumiert `window.data[source]()` und `handle.subscribe(fn)` (Zeilen 104–112).
Diese Form bleibt **wörtlich erhalten** — nur die Innenseite wechselt. Damit ist die
Spec-Anforderung „Adapter-Vertragstreue (E1)" erfüllt und `panel.js` braucht keinen Umbau
seiner Datenbindung.

1. Ergänze eine Funktion `createPush(key, domain, query)`, die dieselbe Handle-Form liefert
   wie `createPoll` (`{ _handle, get data(), subscribe }`), aber:
   - einmal initial über `fetchEndpoint` lädt,
   - sich an einen gemeinsamen `EventSource` auf `/sdlc/api/cockpit/stream` hängt,
   - bei einem Ereignis der passenden Domäne **neu lädt** (die Nutzlast trägt bewusst keine
     Zeilendaten, siehe Task 3),
   - bei `reconnect` ebenfalls neu lädt.

2. Genau **ein** `EventSource` für alle Quellen, nicht einer je Panel: Browser begrenzen die
   gleichzeitigen Verbindungen pro Ursprung, und das Cockpit zeigt sechs Panels. Baue den
   Stream als Modul-Singleton mit Referenzzählung, analog zur `polls`-Registry.

3. Stelle die push-fähigen Domänen um — `tickets` (Domäne `tickets`), `factory` (`factory`),
   `audit` (`audit`). Sie rufen `createPush` statt `createPoll`.

4. **Nicht** umstellen: `cluster`, `ci`, `models`. Sie haben keine Postgres-Quelle. Setze
   über diese drei Aufrufe je einen Kommentar, der benennt, warum sie gepollt bleiben
   (kubectl / GitHub / Ollama — kein `NOTIFY` möglich). Diese Begründung ist Teil der
   Spec-Anforderung, nicht Beiwerk.

5. `refreshMs` bleibt in der Signatur der umgestellten Methoden erhalten und wird ignoriert
   — der Spec-Text zu `D10` ist genau darauf angepasst.

6. Ergänze `window.data.streamState()` mit Rückgabe `'live' | 'polling' | 'error'` für die
   Kopfzeile in Task 9.

**Verify Task 6:** `tests/unit/cockpit-adapter.test.ts` läuft weiter grün (der Vertrag ist
unverändert). Bei geöffnetem Cockpit besteht genau eine Verbindung zu `stream`.

```bash
cd website && pnpm vitest run ../tests/unit/cockpit-adapter.test.ts
```

---

## Task 7 — Panel-Laufzeit: kein Poll neben dem Stream

**Files:** `.lavish/kit/panel.js` (edit, `startPolling` Zeilen 93–98).

Ohne diesen Schritt läuft der panel-eigene Refresh-Timer **zusätzlich** zum Stream weiter —
das Ergebnis wäre Push *und* Poll statt Push statt Poll.

1. Ergänze in `startPolling()` eine Vorabprüfung: liefert der Handle der Quelle eine
   Kennzeichnung als push-versorgt (z. B. `handle.pushed === true`, in Task 6 gesetzt), wird
   kein Intervall gestartet.

2. Setze in `createPush` entsprechend `pushed: true` auf dem Handle, in `createPoll`
   `pushed: false`.

3. Test ergänzen in `tests/unit/cockpit-panel.test.ts`: ein Panel an einer push-versorgten
   Quelle startet kein Intervall; ein Panel an `cluster` startet weiterhin eines
   (Positiv-Anker — ohne ihn bestünde die Aussage auch bei komplett abgeschaltetem Polling).

   ```bash
   cd website && pnpm vitest run ../tests/unit/cockpit-panel.test.ts
   ```

**Verify Task 7:** Beide Fälle nachgewiesen — push-versorgt ohne Timer, poll-versorgt mit.

---

## Task 8 — Aktionen erreichbar machen und einordnen

**Files:** `website/src/pages/sdlc/api/cockpit/actions.ts` (neu),
`website/src/pages/sdlc/api/cockpit/actions.test.ts` (neu),
`.lavish/kit/action-policy.js` (edit).

1. Lege `actions.ts` als einen gebündelten POST-Endpunkt an, der eine Aktion und ein Ziel
   entgegennimmt und an den zuständigen Pfad weiterleitet. Ein Endpunkt statt zwölf hält die
   Sitzungsprüfung und das Audit-Schreiben an **einer** Stelle; bei zwölf Endpunkten wäre
   die erste vergessene Audit-Zeile eine Frage der Zeit.

   Abzudeckende Aktionen:

   | Aktion | Ziel | Umkehrbarkeit |
   |---|---|---|
   | `feature_action`, `feature_actions`, `batch`, `reorder`, `reparent`, `suggest` | vorhandene Routen unter `sdlc/api/cockpit/` | `reversible` |
   | `factory_tick`, `factory_enqueue`, `factory_release_slot` | `sdlc/api/factory-control` | `repeatable` (`tick`, `enqueue`), `reversible` (Slot) |
   | `flux_reconcile`, `ci_rerun` | `gh-axi` bzw. Flux | `irreversible` |
   | `ticket_stage_plan`, `ticket_release_hold`, `ticket_close` | `scripts/ticket.sh` | `reversible` (stage, hold), `irreversible` (close) |

2. Jede Anfrage: erst `getSession` + `isAdmin`, bei Fehlen 401 **ohne** Schreibzugriff. Dann
   ausführen, dann in `tickets.cockpit_audit` schreiben — mit `outcome` `success` oder
   `failure`. Auch der Fehlschlag wird protokolliert: ein Audit-Log, das nur Erfolge kennt,
   verschweigt genau die Vorgänge, für die man es liest.

3. Erweitere in `action-policy.js` die Funktion `classify()` um die Aktionsnamen der Tabelle.
   Ändere **nicht** den Vorgabefall: unbekannte Aktionen bleiben `irreversible`. Die
   bestehende Regel in `confirmationFor()`, dass eine nicht umkehrbare Aktion ohne
   benennbares Ziel hart scheitert, bleibt ebenfalls unverändert.

4. Tests: 401 ohne Sitzung und kein Schreibzugriff; erfolgreiche Aktion erzeugt eine
   Audit-Zeile `success`; fehlschlagende Aktion erzeugt eine Zeile `failure`; unbekannter
   Aktionsname wird als `irreversible` eingeordnet.

   ```bash
   cd website && pnpm vitest run src/pages/sdlc/api/cockpit/actions.test.ts
   tests/unit/lib/bats-core/bin/bats tests/unit/cockpit-action-policy.test.ts 2>/dev/null || \
     (cd website && pnpm vitest run ../tests/unit/cockpit-action-policy.test.ts)
   ```

**Verify Task 8:** Alle vier Testfälle grün. `classify('etwas_unbekanntes')` liefert
weiterhin `irreversible`.

---

## Task 9 — Cockpit-Oberfläche: Knöpfe und ehrliche Kopfzeile

**Files:** `website/src/pages/sdlc/cockpit.astro` (edit; 209 Zeilen, Limit 600, Budget 391).

1. Ersetze die Kopfzeilen-Anzeige `● Fixtures (K1)` (Zeile 47) durch eine Auswertung von
   `window.data.streamState()` aus Task 6: `live` / `Poll` / `getrennt`. Die feste
   Beschriftung behauptet heute Fixture-Betrieb, obwohl der Adapter seit K4 Livedaten
   liefert.

2. Ergänze in den bestehenden `panel__actions`-Bereichen Knöpfe für die häufigen Handgriffe.
   Bisher steht dort fast ausschließlich „Aktualisieren" — mit Push ist ein
   Aktualisieren-Knopf ohnehin weitgehend gegenstandslos.
   - Factory-Panel: `Tick`, `Enqueue`, `Slot freigeben`
   - Tickets-Panel: `Plan stagen`, `Freigabe aufheben`, `Schließen`
   - CI-Panel: `CI erneut`, `Flux abgleichen`

3. Alle Knöpfe rufen den Pfad aus Task 8 über die Aktions-Ebene des Kits auf — **kein**
   `fetch()` direkt in der Seite. Die Spec-Anforderung „Kein direkter fetch() aus Panels"
   (E1) gilt auch für die Hülle.

4. Die Rückfragen-Abstufung aus `action-policy.js` greift vor der Ausführung. Ein Knopf für
   eine nicht umkehrbare Aktion ohne benennbares Ziel darf nicht gerendert werden — er würde
   beim Klick zwangsläufig in den harten Fehler aus `confirmationFor()` laufen.

5. Zeilenzahl nach der Änderung prüfen:

   ```bash
   wc -l website/src/pages/sdlc/cockpit.astro   # muss < 600 bleiben
   ```

**Verify Task 9:** Die Kopfzeile spiegelt den tatsächlichen Zustand. Kein `fetch(` in
`cockpit.astro`.

---

## Task 10 — Aktions-Inventur mit Nachweis

**Files:** `docs/sdlc/cockpit-action-inventory.md` (neu),
`tests/spec/sdlc-cockpit/action-inventory.bats` (neu).

Dies ist die Antwort auf „festhalten, welche Aktionen wir zugänglich gemacht haben — und
das bestätigen". Eine Liste allein wäre keine Bestätigung, deshalb der begleitende Test.

1. Schreibe das Inventar als Tabelle mit je Zeile: Aktionsname, HTTP-Pfad, Methode,
   Umkehrbarkeitsklasse, Audit-Verhalten. Führe **zusätzlich** die bewusst gepollte
   Restmenge auf (`cluster`, `ci`, `models`) mit der Begründung, warum sie kein `NOTIFY`
   liefern kann.

2. Schreibe den Test dazu. Er prüft Ergebnisse: für jede Inventar-Zeile muss die Routendatei
   existieren, und jede Zeile muss eine Umkehrbarkeitsklasse tragen. Positiv-Anker zuerst:
   die Tabelle muss mindestens eine Zeile haben.

   Header-Kommentar: Prüfmodus ist Datei-/Struktur-Verifikation, weil sich die Aussage
   („dokumentierte Aktion ist erreichbar") im Routing manifestiert.

   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/action-inventory.bats
   # erwartet: PASS
   ```

3. Gegenprobe, dass der Test greift: entferne testweise die Klassenangabe einer Zeile, lasse
   den Test laufen (muss rot werden), stelle sie wieder her.

**Verify Task 10:** Test grün, Gegenprobe rot. Jede Aktion aus Task 8 steht im Inventar.

---

## Task 11 — Abschließende Verifikation

Alle Änderungen zusammen prüfen und die abgeleiteten Artefakte erneuern.

1. Testbestand neu erfassen (es sind Testdateien hinzugekommen):

   ```bash
   task test:inventory
   ```

2. Abgeleitete Artefakte erneuern und die verbindlichen Gates fahren:

   ```bash
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```

3. Die erneuerten Dateien mit den Codeänderungen zusammen committen.

4. Abschließende Sichtprüfung am laufenden Cockpit: Cockpit öffnen, in einer zweiten Sitzung
   einen Ticketstatus ändern, und beobachten, dass das Panel **ohne** Zutun nachzieht. Das
   ist der eigentliche Zweck des Changes — er ist mit Unit-Tests allein nicht belegt.

**Verify Task 11:** Alle drei Gates grün, `test-inventory.json` committed, und die
Statusänderung erscheint im Cockpit ohne manuelles Aktualisieren.
