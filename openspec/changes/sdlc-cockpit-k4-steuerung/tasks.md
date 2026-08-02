---
title: "sdlc-cockpit-k4-steuerung — Implementation Plan"
ticket_id: T002463
domains: [cockpit, website, security]
status: active
file_locks: [".lavish/kit/adapter.js", ".lavish/kit/panel.js"]
shared_changes: false
batch_id: null
parent_feature: T002458
depends_on_plans: [cockpit-auth-schnitt]
---

# sdlc-cockpit-k4-steuerung — Implementation Plan

_Ticket: T002463 (K4 des Epics T002458) · bindender Vorlauf: `openspec/changes/cockpit-auth-schnitt`_

## File Structure

| Datei | Art | Ist-Zeilen | Budget |
|---|---|---|---|
| `.lavish/kit/adapter.js` | geändert | 356 | 444 |
| `.lavish/kit/panel.js` | geändert | 278 | 522 |
| `website/src/lib/tickets/cockpit-db.ts` | geändert | 395 | 505 |

Weitere neue Dateien (noch nicht im Repo, daher ohne Budgetangabe — der Linter
misst nur, was auf der Platte liegt):

- `website/src/db/migrations/20260802_create_cockpit_audit.sql`
- `website/src/lib/tickets/cockpit-audit.ts`
- `website/src/pages/api/admin/cockpit/ticket-status.ts`
- `website/src/pages/api/admin/cockpit/ticket-status.test.ts`
- `website/src/pages/api/admin/cockpit/audit.ts`
- `.lavish/kit/action-policy.js`
- `tests/unit/cockpit-action-policy.test.ts`
- `tests/spec/sdlc-cockpit/endpoint-host-map.bats`
- `tests/spec/sdlc-cockpit/write-token-removed.bats`

Weitere geänderte Dateien ohne eigene Budgetaussage: `.lavish/cockpit-shell.html`,
`website/src/pages/admin/cockpit.astro`, `website/src/data/test-inventory.json`
(regeneriert).

Alle drei oben tabellierten Quelldateien sind **nicht** in
`docs/code-quality/baseline.json` eingetragen; wirksame Schwelle ist damit das
statische Extension-Limit (`.js` 800, `.ts` 900). Die Budgets sind mit
`bash scripts/plan-lint.sh residual_budget <pfad>` ermittelt. Kein Split nötig:
jede Datei bleibt auch nach der Erweiterung deutlich unter 80 % ihrer Schwelle.

## Scope-Grenze: genau eine Schreibaktion

**Der Daemon-Server wird nicht angefasst.** Seine Stub-Endpunkte
`/api/cockpit/ticket-action` und `/api/cockpit/agent-action` bleiben inklusive
`auditMiddleware(token)` bestehen — sie belegen die Zusage „der Daemon hat keinen
unauthentifizierten Schreibpfad" und werden von
`tests/spec/sdlc-cockpit/daemon-token-mode.bats` geprüft (401 ohne Token).
Entfernt wird ausschließlich der **browser-seitige** Zugriff darauf.

K4 setzt aus E5 **eine** Klasse-A-Schreibaktion um: **Ticket-Status setzen**.

**PR-Merge ist bewusst nicht im Scope.** Das ist keine Auslassung, sondern eine
Token-Grenze: `k3d/website.yaml` mountet dem Website-Pod nur
`GITHUB_CONTENT_TOKEN`, dessen Scope laut `environments/schema.yaml` (Zeilen
976–984) auf `contents:write + pull-requests:write` beschränkt auf
`website/content/**` festgelegt ist. Der weitergehende `GITHUB_PAT`, den
`website/src/pages/api/admin/delivery-metrics.ts:11` liest, ist im Deployment
nicht gesetzt. Ein Merge-Endpunkt wäre damit zur Laufzeit tot.

Bestätigungsabstufung (D5), Vier-Zustands-Slot (D4), mobile Sonderregel (D6) und
Audit-Log werden trotzdem **vollständig** gebaut. Sie sind das Muster, an das ein
späterer PR-Merge als **zweiter Konsument** andockt, sobald ein Token mit
ausreichendem Scope bereitsteht. Wer diesen Plan umsetzt, darf PR-Merge **nicht**
„mit erledigen".

Die lokal-only-Aktionen (Agent killen, Worktree entfernen, Lock brechen,
Terminal) bleiben nach dem Auth-Schnitt der Kommandozeile vorbehalten — es gibt
keinen Netzwerkweg vom Cluster zu einem Entwicklerrechner.

## Task 1 — Migration: `tickets.cockpit_audit`

- [ ] `website/src/db/migrations/20260802_create_cockpit_audit.sql` anlegen.
      **Dieses** Verzeichnis hat einen echten Runner: `task website:migrate`
      (`Taskfile.yml:3635`) wendet es idempotent an und trackt es in
      `schema_migrations`. Es läuft beim Deploy automatisch **vor** dem
      Website-Rollout (`Taskfile.yml:2824`, `:2955`, `:3825`). Das
      Wurzelverzeichnis `migrations/` hat dagegen keinen Runner — eine Datei
      dort würde nie von selbst angewandt. Namenskonvention hier ist
      `YYYYMMDD_name.sql` mit **Unterstrich**, siehe die Nachbarn
      `20260717_add_missing_fk_indexes.sql` und
      `20260719_add_missing_fk_indexes_batch2.sql`.

- [ ] Form der Nachbardateien übernehmen: **idempotent und markenverträglich**.
      Dieses Verzeichnis wird von **jedem** Marken-`db:migrate`-Lauf gelesen; ein
      Statement gegen ein Objekt, das in der Datenbank einer anderen Marke nicht
      existiert, bricht deren gesamten Migrationslauf ab. Deshalb wie in
      `20260717_add_missing_fk_indexes.sql` mit `DO $$ … $$` und einem
      Existenz-Guard arbeiten, nicht mit nacktem DDL:

```sql
-- tickets.cockpit_audit — Audit-Log der Cockpit-Schreibaktionen (T002463 / K4).
-- Idempotent: ein Wiederholungslauf ist folgenlos.
--
-- Guarded mit to_regnamespace(): dieses Migrationsverzeichnis wird von jedem
-- Marken-db:migrate-Lauf gelesen. Fehlt das tickets-Schema in einer Datenbank,
-- wuerde nacktes DDL dort den gesamten Migrationslauf abbrechen.
DO $$
BEGIN
  IF to_regnamespace('tickets') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS tickets.cockpit_audit (
      id          bigserial PRIMARY KEY,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      actor       text        NOT NULL,
      action      text        NOT NULL,
      target      text        NOT NULL,
      outcome     text        NOT NULL CHECK (outcome IN ('success','failure')),
      brand       text        NOT NULL,
      detail      jsonb
    );
    CREATE INDEX IF NOT EXISTS cockpit_audit_occurred_at_idx
      ON tickets.cockpit_audit (occurred_at DESC);
  END IF;
END
$$;
```

- [ ] **Zur Marke:** die Tabelle entsteht in **jeder** Marken-Datenbank, weil das
      Migrationsverzeichnis geteilt ist — das ist richtig so und kein Nebeneffekt,
      den man unterdrücken sollte. Die Markenbindung des Cockpits liegt nicht im
      Schema, sondern in der Anwendung: E16 pinnt es auf `brand=mentolder`, und
      alle Lese- und Schreibpfade aus Task 2 und 4 filtern darauf. Die Spalte
      `brand` ist deshalb `NOT NULL` **ohne** Default: der Schreibpfad muss die
      Marke ausdrücklich nennen, damit in der markengetrennten Ticket-Welt keine
      Zeile ohne Zuordnung entstehen kann.

- [ ] Anwenden:

```bash
task website:migrate ENV=mentolder
```

  Ein gesonderter Schritt ist das nur, solange noch nicht deployt wurde — beim
  nächsten `workspace:deploy` läuft dieselbe Migration ohnehin automatisch vor
  dem Website-Rollout, und der Lauf ist idempotent.

- [ ] Anwendung belegen statt annehmen — hier ist `kubectl exec` das
      Verifikationsmittel, nicht der Anwendungsweg:

```bash
POD=$(kubectl --context fleet -n workspace get pod -l app=shared-db \
      --field-selector status.phase=Running -o jsonpath='{.items[0].metadata.name}')
kubectl --context fleet -n workspace exec -i "$POD" -c postgres -- \
  psql -U postgres -d website -c "\d tickets.cockpit_audit"
```

  > `-i` ist zwingend. Ohne es läuft `psql` mit leerem stdin, endet mit Exit 0
  > und gibt nichts aus. `--field-selector status.phase=Running` ist ebenso
  > zwingend: ohne ihn greift die Abfrage nach einem `shared-db`-Rollout den
  > `Completed`-Pod.

## Task 2 — Audit-Schreib- und Lesepfad in der Website-Bibliothek

- [ ] `website/src/lib/tickets/cockpit-audit.ts` neu anlegen. Zwei exportierte,
      vollständig typisierte Funktionen (CQ02: die `any`-Zählung in `website/src`
      darf nicht steigen — kein `as any`, kein `catch (e: any)`):
      - `recordAudit(client, entry)` — schreibt **eine** Zeile. Nimmt den
        Postgres-Client als Parameter, damit der Aufrufer sie in **derselben**
        Transaktion wie die Fachänderung ausführen kann.
      - `listAudit(brand, limit)` — liest die jüngsten Einträge, `occurred_at DESC`,
        `limit` hart auf 200 gedeckelt.
      - Typ `AuditEntry { actor, action, target, outcome, brand, detail? }`.

- [ ] **Bewusste Abweichung von der bestehenden `audit()`-Hilfsfunktion in
      `cockpit-db.ts` (Zeile 387):** die ist absichtlich best-effort und
      verschluckt Fehler, damit ein Audit-Ausfall keine Fachlogik zurückrollt.
      Für `cockpit_audit` gilt das Gegenteil — die Zusage aus dem Auth-Schnitt
      lautet „jede ausgeführte Schreibaktion steht im Log", und ein still
      verlorener Eintrag verletzt sie. Statusänderung und Audit-Zeile laufen
      deshalb in **einer** Transaktion; scheitert die Audit-Zeile, scheitert die
      Aktion und meldet das. Die bestehende `audit()`-Funktion bleibt für ihre
      bisherigen Aufrufer unverändert.

- [ ] `setTicketStatus(brand, ticketId, status, actor)` in
      `website/src/lib/tickets/cockpit-db.ts` ergänzen, im Stil der dortigen
      Mutationshelfer:
      - zuerst `assertSameBrand(brand, [ticketId])` — der bestehende Schutz gegen
        markenübergreifende Schreibzugriffe.
      - Zielstatus gegen den Typ `TicketStatus` aus
        `website/src/lib/tickets/admin.ts` prüfen; die dortige Union ist die
        Quelle und wird nicht abgetippt.
      - `UPDATE tickets.tickets SET status = $1, updated_at = now()
         WHERE id = $2 AND brand = $3`
      - `recordAudit(...)` mit `action='ticket_status'`, `target=<ticketId>`,
        `detail={from,to}` in derselben Transaktion.
      - Rückgabe `{ ok: true, from, to }` — der Aufrufer muss den Ausgang kennen,
        damit der Zustand „läuft" am Ergebnis enden kann (Task 7).

## Task 3 — RED: der Ticket-Status-Endpunkt fehlt noch

- [ ] `website/src/pages/api/admin/cockpit/ticket-status.test.ts` anlegen, nach
      dem im Repo gelebten Muster für API-Routen (`vi.mock` auf
      `../../../../lib/auth`, wie in
      `website/src/pages/api/factory-floor/inject.test.ts`). Der Test **ruft die
      Route auf** und prüft Antwortstatus und -körper — keine Quelltext-Greps
      (Test-Resultats-Konvention T002448-M4). Vier Fälle:
      1. Positiv-Anker zuerst: gültige Admin-Session, gültiger Zielstatus →
         `200`, Antwort trägt `from`/`to`, `setTicketStatus` genau einmal
         aufgerufen.
      2. ohne Session → `403`, und `setTicketStatus` wurde **nicht** aufgerufen.
         Ohne den Anker aus Fall 1 bestünde diese Aussage auch dann, wenn die
         Route gar nicht existierte.
      3. Session ohne Admin-Recht → `403`.
      4. gültige Admin-Session, unbekannter Zielstatus → `400`.

- [ ] Testlauf, solange die Route noch nicht existiert:

```bash
cd website && pnpm exec vitest run --project node \
  src/pages/api/admin/cockpit/ticket-status.test.ts
# expected: FAIL — src/pages/api/admin/cockpit/ticket-status.ts existiert noch nicht,
# der Import schlaegt fehl (rot).
```

## Task 4 — GREEN: Website-Endpunkte

- [ ] `website/src/pages/api/admin/cockpit/ticket-status.ts` (POST). Das
      Auth-Muster wird **wörtlich** von
      `website/src/pages/api/admin/cockpit/feature-action.ts:9-11` übernommen:

```ts
const session = await getSession(request.headers.get('cookie'));
if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
```

  Danach: JSON-Body lesen (`{ ticketId, status }`), beide Pflichtfelder prüfen
  (`400`), Zielstatus validieren (`400`),
  `setTicketStatus(BRAND(), ticketId, status, actor)` aufrufen. `actor` wird aus
  der **Session** abgeleitet, nie aus dem Body — ein vom Aufrufer gesetzter
  Akteur macht das Audit-Log wertlos. `BrandMismatchError` → `400 cross-brand`,
  sonst `500`. Der Endpunkt ist neu: `feature-action.ts` setzt **keinen**
  Ticket-Status, sondern nur `next_step`/`discard`/`major`/`comment`.

- [ ] `website/src/pages/api/admin/cockpit/audit.ts` (GET) — dieselbe
      Session-Prüfung, liefert `listAudit(BRAND(), limit)` plus `fetchedAt`.
      Auch der **Lesepfad** ist admin-pflichtig: das Audit-Log nennt Ticket-IDs
      und Akteure.

- [ ] Derselbe Testlauf wie in Task 3 — jetzt grün:

```bash
cd website && pnpm exec vitest run --project node \
  src/pages/api/admin/cockpit/ticket-status.test.ts
```

## Task 5 — Adapter: Endpunkt-Karte statt Basis-Konstante, Stubs entfernen

- [ ] `.lavish/kit/adapter.js`, Zeile 7: die globale Konstante
      `const BASE = 'http://127.0.0.1:49152'` weicht einer **Karte pro Endpunkt**.
      Ein globaler Umschalter ist laut Auth-Schnitt ausdrücklich unzulässig — die
      Website bedient heute nur drei der acht Endpunkte, ein Umschalten stellte
      fünf Panels auf `404`. Karte:

| Endpunkt-Schlüssel | Quelle |
|---|---|
| `portfolio`, `pods-list`, `factory-control` | Website (existiert heute) |
| `epics`, `styles`, `ci` | Website baubar — bis dahin Daemon |
| `agents`, `models` | **dauerhaft** nur Daemon (lesen lokalen Zustand) |
| `ticket-status`, `audit` | Website (neu aus Task 4) |

- [ ] `resolveEndpoint(key)` als Auflösefunktion, die `{ host, path, available }`
      liefert. `host` ist im Admin-Kontext die eigene Origin (leerer Präfix), im
      Standalone-Kontext die Daemon-Basis. Der Kontext wird **einmal** beim Laden
      bestimmt (Standalone erkennt man daran, dass die Seite nicht von der
      Admin-Fläche ausgeliefert wird — `location.protocol === 'file:'` oder ein
      Port, der nicht der Website gehört). `resolveEndpoint` wird auf dem
      Rückgabeobjekt mit veröffentlicht, damit der Kontrakt messbar ist statt nur
      behauptet — Task 6 misst ihn.

- [ ] **D13 im Admin-Kontext:** ein daemon-only-Endpunkt (`agents`, `models`)
      darf dort **nicht** still leer zurückkommen. Er liefert
      `{ error: 'Quelle in diesem Kontext nicht verfügbar', fetchedAt: … }`; das
      Panel zeigt damit „Quelle nicht verfügbar" statt einer leeren Liste, die
      wie ein Messwert aussieht.

- [ ] `fetchEndpoint()` (Zeile 41–57) **wiederverwenden, nicht neu bauen**: es
      hält D12/D13 bereits ein (`fetchedAt` ist immer gesetzt, ein Fehler kommt
      als `error`-Feld statt als `null`). Es bekommt lediglich den aufgelösten
      Host vorangestellt.

- [ ] `getToken()` (Zeile 334–336) und `agentAction()` (Zeile 307–320)
      **ersatzlos entfernen**, samt `agentAction` im `return`-Objekt. Begründung:
      `getToken()` gibt seit T002505 hart `null` zurück — jeder Aufruf scheitert
      per Konstruktion. Der Code behauptet eine Fähigkeit, die der Auth-Schnitt
      ausdrücklich zurückgestellt hat, und ein Leser kann „deaktiviert" nicht von
      „defekt" unterscheiden. Der erklärende Kommentar zur Token-Frage wandert
      gekürzt an die Karte: er hält fest, **warum** hier kein Browser-Token
      existiert.

- [ ] `ticketAction(ticketId, action)` (Zeile 292) auf die Website-API umbiegen:
      `POST` auf den aufgelösten `ticket-status`-Endpunkt, `credentials: 'include'`
      (Session-Cookie), **kein** `Authorization`-Header. Die Antwort wird
      unverändert durchgereicht, damit der Aufrufer den Ausgang kennt.

- [ ] `audit(opts)` als Poll auf den neuen Lese-Endpunkt ergänzen (Strom-Panel,
      Task 8) — Vorbild `factory()` und `epics()` in derselben Datei.

## Task 6 — `action-policy.js`: Abstufung und Zustände als eigenes Modul

Die Abstufung gehört **nicht** in `panel.js`. Dort ist sie an DOM-Aufbau
gekoppelt und in einem node-Testlauf nicht messbar — genau der Grund, warum die
bestehenden Panel-Tests in `tests/unit/cockpit-panel.test.ts` nur nachgebaute
Konstanten prüfen statt echten Code. Ein eigenes, DOM-freies Modul dreht das um.

- [ ] `.lavish/kit/action-policy.js` als klassisches Skript (kein ES-Modul — die
      Hüllen laden Kit-Dateien per `<script src>`, siehe `.lavish/cockpit-shell.html`
      Zeile 9–10). Es setzt `window.actionPolicy` mit:
      - `ACTION_STATES = ['available','locked','confirming','running']` — die vier
        Zustände aus D4.
      - `classify(action)` → `'repeatable' | 'reversible' | 'irreversible'`, nach
        D5: `refresh`/`reconcile`/`tick`/`enqueue` → wiederholbar (keine
        Rückfrage); `ticket_status`/`panel_close` → umkehrbar (einfache
        Rückfrage); `pr_merge`/`agent_kill`/`worktree_remove`/`lock_break` → nicht
        umkehrbar (Rückfrage **mit Nennung des Ziels**). Eine unbekannte Aktion
        gilt als **nicht umkehrbar** — die sichere Richtung.
      - `confirmationFor(action, target)` → `null` bei wiederholbar,
        `{ level:'simple' }` bei umkehrbar, `{ level:'named', target }` bei nicht
        umkehrbar. Bei `named` ohne `target` wirft die Funktion: eine Rückfrage,
        die das Ziel nicht nennen kann, erfüllt D5 nicht.
      - `mobileLock(action, { viewport, unlockedThisSession })` → `true`, wenn die
        Aktion nicht umkehrbar ist, die Darstellung mobil oder Vollbild ist und in
        dieser Sitzung nicht bewusst freigeschaltet wurde (D6).

- [ ] `tests/unit/cockpit-action-policy.test.ts` (Vitest; die Root-Config erfasst
      `tests/unit/**/*.test.ts`). Der Test **führt die echte Quelle aus**: Datei
      per `readFileSync` lesen, in `new Function('window', src)` mit einem
      Fenster-Attrappenobjekt ausführen, dann das entstandene `window.actionPolicy`
      befragen. Damit misst er Verhalten, nicht Text. Fälle: alle vier Zustände
      vorhanden; jede der drei Klassen richtig zugeordnet;
      `confirmationFor('pr_merge', 'PR #123')` nennt das Ziel;
      `confirmationFor('pr_merge')` ohne Ziel wirft; unbekannte Aktion gilt als
      nicht umkehrbar; `mobileLock` sperrt mobil und gibt nach bewusster
      Freischaltung frei; `mobileLock` sperrt eine wiederholbare Aktion nicht.

- [ ] Lauf vor der Implementierung des Moduls:

```bash
npx vitest run tests/unit/cockpit-action-policy.test.ts
# expected: FAIL — .lavish/kit/action-policy.js existiert noch nicht,
# readFileSync wirft ENOENT (rot).
```

- [ ] `tests/spec/sdlc-cockpit/endpoint-host-map.bats` — misst die Karte aus
      Task 5 **im Lauf**, nicht im Quelltext: ein node-Aufruf lädt `adapter.js`
      mit einer `document`/`window`/`fetch`-Attrappe und gibt für jeden Schlüssel
      eine Zeile `<key> <host-oder-unavailable>` aus. Positiv-Anker zuerst:
      `portfolio` löst im Admin-Kontext auf die eigene Origin auf. Danach die
      Negativ-Aussage: `agents` und `models` lösen dort **nicht** auf die Website
      auf, sondern melden „nicht verfügbar". Assertions immer auf die passende
      Ausgabezeile einschränken (`… | grep '^agents ' | grep -c …`), nie
      `[[ "$output" == *"…"* ]]` gegen den vollen stdout+stderr — der
      Worktree-Name steckt sonst mit in der Ausgabe.

- [ ] `tests/spec/sdlc-cockpit/write-token-removed.bats` — gleiche node-Attrappe.
      Positiv-Anker: `typeof window.data.ticketAction === 'function'`. Danach:
      `window.data.agentAction` und `window.data.getToken` sind `undefined`. Ohne
      den Anker bestünde der Test auch dann, wenn `adapter.js` gar nicht lüde.

- [ ] Beide `.bats`-Dateien syntaktisch prüfen — `bash -n` taugt dafür **nicht**:

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/endpoint-host-map.bats
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/write-token-removed.bats
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/endpoint-host-map.bats \
  tests/spec/sdlc-cockpit/write-token-removed.bats
```

  Die Namen kollidieren mit keiner der bestehenden K1-Dateien im selben
  Verzeichnis (`no-direct-fetch.bats`, `panel-type-declaration.bats` und die
  übrigen). Eine Datei pro Vorgang — nicht an eine Sammeldatei anhängen (T002416).

## Task 7 — `panel.js`: vier Zustände, gestufte Bestätigung, zwei Defekte

- [ ] `setActionState(state)` (Zeile 238–241) setzt heute nur eine CSS-Klasse —
      die vier Zustände aus D4 sind damit Dekoration ohne Logik. Umbau: der
      Zustand wird gegen `window.actionPolicy.ACTION_STATES` validiert (ungültig
      → Fehler statt stiller Klasse), auf `this.actionState` gehalten und als
      `data-action-state` am Slot gespiegelt. **`locked` wird sichtbar und
      erkennbar gesperrt dargestellt, nicht ausgeblendet** (D4): die Knöpfe
      bleiben im DOM, bekommen `disabled` und eine lesbare Begründung. Grund laut
      Entwurf: bei ausgeblendeten Knöpfen ist nicht unterscheidbar, ob eine
      Aktion fehlt oder nur nicht freigeschaltet ist.

- [ ] `confirmAction(label, target, callback)` (Zeile 243–267) ist heute
      **ungestuft** — jede Aktion bekommt dieselbe Rückfrage. Neue Signatur
      `confirmAction(action, target, callback)`; die Entscheidung kommt aus
      `window.actionPolicy.confirmationFor(action, target)`:
      - `null` → Rückfrage wird **übersprungen**, `callback` läuft direkt.
      - `{ level:'simple' }` → schlichte Bestätigen/Abbrechen-Rückfrage.
      - `{ level:'named', target }` → Rückfrage, die das konkrete Ziel nennt und
        bestätigen lässt (der bestehende `panel__confirm-target`-Knoten trägt es).

- [ ] **Defekt 1 (Zeile 252):**
      `setTimeout(() => this.setActionState('available'), 2000)` beendet „läuft"
      nach blinden zwei Sekunden, unabhängig vom Ausgang — eine langsame Aktion
      zeigt „verfügbar", während sie noch läuft. Ersetzen: der `callback` gibt ein
      Promise zurück, der Zustand wechselt erst nach dessen Auflösung — bei Erfolg
      auf `available`, bei Fehler auf `available` **mit sichtbarer Fehlermeldung**.
      Kein Timer. Genau dafür liefert `setTicketStatus` aus Task 2 ein Ergebnis
      statt eines nackten `ok`.

- [ ] **Defekt 2 (Zeile 212–220):** `resize(size)` greift nur beim Umschalten auf
      `'fullscreen'`, liest `btn.dataset.irreversible` und kennt kein
      Freischalten. Damit fehlt D6 in zwei Punkten: die Sperre greift nicht, wenn
      die Seite bereits in Mobilgröße **geladen** wird, und ein bewusstes
      Freischalten **pro Sitzung** gibt es überhaupt nicht. Umbau:
      - Die Sperre zieht `applyMobileLock()` und wird aus `init()`, `resize()`
        **und** einem `resize`-Fensterereignis aufgerufen — nicht nur beim
        Umschalten.
      - Klassifiziert wird über `window.actionPolicy.mobileLock(action, …)` statt
        über ein DOM-Attribut; die Aktion steht als `data-action` am Knopf.
      - Freischaltung pro Sitzung: ein Schalter am Slot setzt ein Flag in
        `sessionStorage` — das überlebt einen Reload und endet mit dem Tab, genau
        die von D6 verlangte Reichweite. Gesperrte Knöpfe bleiben dabei sichtbar
        (D4).

## Task 8 — Audit-Log als Strom-Panel

- [ ] Panel-Markup in `.lavish/cockpit-shell.html` ergänzen, mit
      `data-panel-type="strom"`: append-only, Reihenfolge ist Bedeutung, Lücken
      sind Datenverlust und müssen als Lückenmarkierung sichtbar sein. Die Daten
      kommen über `data.audit()` aus Task 5 — **kein** direktes `fetch` im Panel;
      der Negativtest `tests/spec/sdlc-cockpit/no-direct-fetch.bats` prüft das.

- [ ] Rail-Darstellung mitliefern (D3: jedes Panel **muss** eine haben) — eine
      Zeile mit der jüngsten Aktion und ihrem Zeitstempel.

- [ ] `.lavish/kit/action-policy.js` in beiden Hüllen laden: in
      `.lavish/cockpit-shell.html` und in `website/src/pages/admin/cockpit.astro`
      (dort als `<script is:inline src="/cockpit/kit/action-policy.js">`, **vor**
      `panel.js`). `website/public/cockpit/kit` ist ein Symlink auf `.lavish/kit`
      — eine Kopie ist weder nötig noch zulässig.

- [ ] Aktualitätsanzeige: `fetchedAt` wird dauerhaft angezeigt, nicht nur im
      Fehlerfall (D12).

## Task 9 — Verifikation

- [ ] Testinventar regenerieren und mitcommitten — CI vergleicht es gegen die
      Arbeitskopie und schlägt sonst fehl:

```bash
task test:inventory
```

- [ ] Gezielte Läufe der in diesem Plan angelegten Tests:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/endpoint-host-map.bats \
  tests/spec/sdlc-cockpit/write-token-removed.bats
npx vitest run tests/unit/cockpit-action-policy.test.ts
cd website && pnpm exec vitest run --project node \
  src/pages/api/admin/cockpit/ticket-status.test.ts && cd ..
```

- [ ] CQ02: die Zahl expliziter `any`-Typen in `website/src` darf nicht steigen.

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

- [ ] Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Ausdrückliche Annahmen

1. **Der Akteur im Audit-Log** wird aus der Session abgeleitet (Benutzerkennung
   oder E-Mail, je nachdem, was `getSession` führt). Trägt das Session-Objekt
   keine stabile Kennung, wird `'admin'` als Akteur geschrieben und die
   vorhandene Session-Kennung in `detail` abgelegt — ein Akteur aus dem
   Request-Body kommt in keinem Fall in Frage.
2. **`GITHUB_PAT`** wird von diesem Plan weder angelegt noch angefordert. Dockt
   PR-Merge später als zweiter Konsument an, ist die Token-Beschaffung der erste
   Schritt jenes Vorgangs, nicht dieses.
