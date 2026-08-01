---
title: "cockpit-daemon-runtime — Implementation Plan"
ticket_id: T002508
domains: [bachelorprojekt-test]
status: active
file_locks:
  - package.json
  - package-lock.json
  - tsconfig.json
  - Taskfile.yml
  - .github/workflows/ci.yml
  - .lavish/kit/daemon/server.ts
  - .lavish/kit/daemon/tsconfig.json
  - tests/spec/sdlc-cockpit/daemon-runtime-contract.bats
  - tests/spec/sdlc-cockpit/daemon-endpoints.bats
  - tests/spec/sdlc-cockpit/daemon-token-mode.bats
  - tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats
  - tests/spec/sdlc-cockpit/freshness-timestamp.bats
  - tests/spec/sdlc-cockpit/no-silent-fallback.bats
  - tests/unit/cockpit-daemon-cache.test.ts
  - tests/unit/cockpit-adapter.test.ts
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-daemon-runtime — Implementation Plan

_Ticket: T002508_

Der Cockpit-Daemon wurde nie lauffähig eingecheckt: `hono` und `@hono/node-server` sind in
keiner `package.json` deklariert, es gibt keine tsconfig-Referenz und keinen Start-Task.
Folge ist ein stilles CI-Loch — 24 der 41 Tests in `tests/spec/sdlc-cockpit/` skippen
dauerhaft, darunter alle Security-Guards aus T002505. Dieser Plan stellt den Lauf-Kontrakt
her und nagelt ihn mit einem fail-closed CI-Gate fest.

## File Structure

```
package.json                                          (M)  +3 devDependencies
package-lock.json                                     (M)  generiert durch npm install
tsconfig.json                                         (M)  +1 Projektreferenz
.lavish/kit/daemon/tsconfig.json                      (N)  Projekt-Konfiguration des Daemons
.lavish/kit/daemon/server.ts                          (M)  ESM-fs-Import, fetchedAt in /health
Taskfile.yml                                          (M)  +Task cockpit:daemon
.github/workflows/ci.yml                              (M)  Daemon-Start + REQUIRED im Shard-Job
tests/spec/sdlc-cockpit/daemon-runtime-contract.bats  (N)  RED-Test, bereits vorhanden
tests/spec/sdlc-cockpit/daemon-endpoints.bats         (M)  setup(): fail statt skip
tests/spec/sdlc-cockpit/daemon-token-mode.bats        (M)  setup(): fail statt skip
tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats (M) setup(): fail statt skip
tests/spec/sdlc-cockpit/freshness-timestamp.bats      (M)  setup(): fail statt skip
tests/spec/sdlc-cockpit/no-silent-fallback.bats       (M)  setup(): fail statt skip
tests/unit/cockpit-daemon-cache.test.ts               (M)  3 Platzhalter → echte Tests
tests/unit/cockpit-adapter.test.ts                    (M)  3 Attrappen entfernt
```

**S1-Budget.** `.lavish/` steht nicht in `scan.code_roots` (`docs/code-quality/gates.yaml`) —
der Daemon liegt außerhalb des S1-Scan-Universums, für `server.ts` gilt kein Limit.
`.bats`, `.yml` und `.json` haben in `s1.limits` keinen Eintrag, also greift S1 dort nicht.
Betroffen ist allein `.ts` mit Limit 900: `tests/unit/cockpit-daemon-cache.test.ts` steht bei
26 Zeilen (Reserve 874), `tests/unit/cockpit-adapter.test.ts` bei 75 (Reserve 825). Keine
Datei nähert sich ihrer Schwelle; ein Verkleinerungsschritt ist nicht erforderlich. Keine der
betroffenen Dateien hat einen Eintrag in `docs/code-quality/baseline.json`, es gibt also auch
keinen strengeren Baseline-Wert als das Limit.

## Task 1 — RED bestätigen

- [ ] Den bereits geschriebenen Reproducer laufen lassen und den roten Zustand belegen.
      Alle sechs Tests müssen fehlschlagen, und zwar jeweils aus dem in ihrem Namen
      genannten Grund — nicht an einem Syntaxfehler.

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/sdlc-cockpit/daemon-runtime-contract.bats
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-runtime-contract.bats
# expected: FAIL — 6 von 6 rot; Test 3 meldet ERR_MODULE_NOT_FOUND für 'hono'
```

Erwartete Einzelbegründungen: Test 1 `MISSING` für beide Pakete, Test 2 `require.resolve`
scheitert, Test 3 `ERR_MODULE_NOT_FOUND`, Test 4 der Lauf bleibt bei gesetztem
`COCKPIT_DAEMON_REQUIRED` grün statt rot, Test 5 kein Treffer in `ci.yml`, Test 6 kein
`cockpit:daemon` im Taskfile.

## Task 2 — Lauf-Kontrakt herstellen

- [ ] `hono`, `@hono/node-server` und `tsx` als `devDependencies` in die Root-`package.json`
      aufnehmen, mit exakter Version gepinnt nach der im Repo üblichen Caret-Konvention der
      bestehenden Einträge. Anschließend `npm install` ausführen, damit `package-lock.json`
      mitwandert.
- [ ] `.lavish/kit/daemon/tsconfig.json` anlegen und in den `references`-Block der
      Root-`tsconfig.json` eintragen, damit `npm run typecheck` den Daemon erfasst.
- [ ] `server.ts:23` von `const fs = require('fs')` auf einen ESM-Import umstellen. Die
      Root-`package.json` setzt `"type": "module"`; `require` ist dort nicht definiert. Dieser
      Fehler wird erst sichtbar, nachdem `hono` auflösbar ist — der erste Blocker verdeckt ihn.

```bash
npm install
node -e "console.log(require.resolve('hono/package.json'))"
npm run typecheck
COCKPIT_DAEMON_PORT=49199 npx tsx .lavish/kit/daemon/server.ts &
sleep 3 && curl -sf http://127.0.0.1:49199/health && kill %1
```

Der Daemon muss hier bereits antworten. Tut er es nicht, liegt ein dritter Startfehler vor —
dann diesen zuerst beheben, bevor Task 3 beginnt.

## Task 3 — Start-Weg

- [ ] Task `cockpit:daemon` im Taskfile ergänzen, neben dem bestehenden `cockpit:dev`. Er
      startet den Daemon, pollt `/health` bis zur Antwort und bricht mit Exit-Code ungleich
      null ab, wenn der Daemon innerhalb des Zeitfensters nicht erreichbar wird. Ein still im
      Hintergrund gestorbener Daemon darf nicht als Erfolg durchgehen — genau diese Art
      stiller Erfolg ist die Ursache des gesamten Tickets.
- [ ] Den bestehenden Stop-Weg aus dem Kopfkommentar von `server.ts` (PID-Datei unter
      `/tmp/cockpit-daemon.pid`) beibehalten und im Task dokumentieren.

```bash
task cockpit:daemon
curl -sf http://127.0.0.1:49152/health
kill "$(cat /tmp/cockpit-daemon.pid)"
```

## Task 4 — Gate fail-closed schalten

- [ ] In den fünf betroffenen `.bats`-Dateien die `setup()`-Funktion so ändern, dass bei
      gesetzter Variable `COCKPIT_DAEMON_REQUIRED` ein nicht erreichbarer Daemon den Test
      **fehlschlagen** lässt, statt ihn zu skippen. Ohne die Variable bleibt das
      Skip-Verhalten unverändert, damit ein lokaler Lauf der 17 statischen Tests weiterhin
      ohne Daemon möglich ist.
- [ ] Im Job `test-factory-shard` von `ci.yml` vor dem Suite-Aufruf den Daemon starten und
      `COCKPIT_DAEMON_REQUIRED=1` setzen. Der Job läuft als 4er-Matrix; der Start gehört in
      jeden Shard, da die Zuordnung der Cockpit-Dateien zu einem Shard nicht garantiert ist.
- [ ] Sicherstellen, dass ein fehlgeschlagener Daemon-Start den Job abbricht, statt ihn
      weiterlaufen zu lassen.

```bash
COCKPIT_DAEMON_PORT=49198 tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-endpoints.bats
# erwartet: grün mit Skips — lokale Ergonomie bleibt erhalten
COCKPIT_DAEMON_REQUIRED=1 COCKPIT_DAEMON_PORT=49198 tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-endpoints.bats
# erwartet: rot, ohne eine einzige Skip-Zeile
```

## Task 5 — Die nun laufenden Tests grün bekommen

- [ ] Suite mit laufendem Daemon und gesetzter Variable ausführen und die Fehler
      protokollieren. Erwartet ist mindestens ein echter Kontraktbruch: `/health` liefert
      `{ status, uptime }` ohne `fetchedAt`, während `freshness-timestamp.bats` genau dieses
      Feld verlangt.
- [ ] `/health` um einen ISO-8601-Zeitstempel ergänzen, konsistent zum `fetchedAt` der
      übrigen Routen.
- [ ] Die übrigen Funde triagieren. Was zum Lauf-Kontrakt gehört, wird hier behoben. Was
      darüber hinausgeht — insbesondere alles an den Write-Endpunkten, der CORS-Herkunft
      `'null'` oder den unauthentifizierten GET-Routen — wandert als eigenes Ticket heraus,
      statt diesen Fix aufzublähen. Die Entscheidung je Fund im Ticketkommentar festhalten.

```bash
task cockpit:daemon
COCKPIT_DAEMON_REQUIRED=1 tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/
# erwartet am Ende von Task 5: 41 Tests, 0 Skips, 0 Fehler
kill "$(cat /tmp/cockpit-daemon.pid)"
```

## Task 6 — Platzhalter-Assertions

- [ ] Die drei `expect(true).toBe(true)`-Stubs in `tests/unit/cockpit-daemon-cache.test.ts`
      durch echte Tests gegen `.lavish/kit/daemon/lib/cache.ts` ersetzen: `fetchedAt` wird
      gesetzt, TTL-Ablauf greift, und bei einem Fehler bleiben die alten Daten samt
      `error`-Feld erhalten. Das Modul importiert kein `hono` und ist direkt aus vitest
      ladbar — genauso wie `lib/exec.ts` im T002505-Test.
- [ ] Die drei Attrappen in `tests/unit/cockpit-adapter.test.ts` entfernen, die auf
      bats-Dateien verweisen (D10 `refreshMs`, D12 `fetchedAt`, D13 `error`-Feld). Diese
      Zusagen prüft die bats-Suite nach Task 4 erstmals wirklich; eine zweite, immer grüne
      Kopie in vitest schafft nur Doppelpflege. Der D11-Block bleibt: er prüft tatsächlich
      etwas.

```bash
npx vitest run tests/unit/cockpit-daemon-cache.test.ts tests/unit/cockpit-adapter.test.ts
grep -c "expect(true).toBe(true)" tests/unit/cockpit-daemon-cache.test.ts tests/unit/cockpit-adapter.test.ts
# erwartet: 0 Treffer in beiden Dateien
```

## Task 7 — Abschließende Verifikation

- [ ] Reproducer aus Task 1 grün: alle sechs Tests bestehen.
- [ ] Gesamte Cockpit-Suite mit Daemon: 41 Tests, keine Skips.
- [ ] Die drei verpflichtenden CI-Gates laufen sauber durch.

```bash
task cockpit:daemon
COCKPIT_DAEMON_REQUIRED=1 tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/
kill "$(cat /tmp/cockpit-daemon.pid)"
task test:changed
task freshness:regenerate
task freshness:check
```
