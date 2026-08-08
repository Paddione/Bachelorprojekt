---
title: "cockpit-daemon-port-reserved — Implementation Plan"
ticket_id: T002708
domains: [sdlc-cockpit, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-daemon-port-reserved — Implementation Plan

_Ticket: T002708 · Design: `openspec/changes/cockpit-daemon-port-reserved/design.md`_

## File Structure

```
.lavish/kit/daemon/server.ts                              (geändert — Default-Port, Startmeldung, Fehlerbehandlung)
.lavish/kit/adapter.js                                    (geändert — DAEMON_BASE + Port-Vergleich)
.lavish/kit/canvas-store.js                               (geändert — Portangabe im Kommentar)
Taskfile.yml                                              (geändert — cockpit:daemon PORT-Default)
tests/spec/sdlc-cockpit/daemon-port-binding.bats          (neu — RED-Guard, liegt bereits vor)
tests/spec/sdlc-cockpit/daemon-runtime-contract.bats      (geändert — Testports + wirkungslose Assertion)
tests/spec/sdlc-cockpit/daemon-helper.bash                (geändert — Default-Port des Helpers)
tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats (geändert — Default-Port)
tests/spec/sdlc-cockpit/write-token-removed.bats          (geändert — simulierter location.port)
openspec/changes/cockpit-daemon-port-reserved/specs/sdlc-cockpit.md (neu — Delta-Spec, liegt bereits vor)
```

## Partials

| # | Rolle | Ziel-Dateien | Abhängigkeit |
|---|-------|--------------|--------------|
| p1 | Daemon + Adapter + Taskfile | `.lavish/kit/daemon/server.ts`, `.lavish/kit/adapter.js`, `.lavish/kit/canvas-store.js`, `Taskfile.yml` | — |
| p2 | Tests | `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats`, `tests/spec/sdlc-cockpit/daemon-helper.bash`, `tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats`, `tests/spec/sdlc-cockpit/write-token-removed.bats` | p1 |

S1-Restbudgets der berührten Dateien (wirksame Schwelle − aktuelle Zeilen): `server.ts` 778,
`adapter.js` 375, `canvas-store.js` 708, `daemon-helper.bash` 433. `Taskfile.yml` und die
`.bats`-Dateien sind ungated. Alle Änderungen sind Ersetzungen gleicher Zeilenzahl bis auf die
Fehlerbehandlung in `server.ts` (rund +15 Zeilen) — Budget bleibt weit im Plus, kein Split nötig.

---

## p1 — Daemon, Adapter, Taskfile

- [x] **Failing-Test-Step (RED).** Der Guard liegt bereits als
      `tests/spec/sdlc-cockpit/daemon-port-binding.bats` auf dem Branch. Vor der Implementierung
      ausführen und den roten Stand bestätigen — beide Tests müssen fehlschlagen, und zwar aus
      den benannten Gründen: Test 1 an `[ "$output" -eq 0 ]` (der Daemon loggt `listening on`,
      obwohl der Port belegt ist), Test 2 an `[ "$output" -lt 49152 ]` (der Default-Port liegt im
      reservierten Block).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-port-binding.bats
# expected: FAIL (rot — Port und Startmeldung sind noch unverändert)
```

- [x] **Default-Port in `.lavish/kit/daemon/server.ts` auf 39152 ziehen.** Zeile 19:
      `process.env.COCKPIT_DAEMON_PORT || '49152'` → `'39152'`. Im Kommentar festhalten, warum
      nicht der IANA-dynamic range verwendet wird — sonst wandert der Wert bei der nächsten
      Aufräumaktion zurück.

```typescript
// 39152 statt des IANA-dynamic range: Windows/Hyper-V reserviert auf WSL2-Hosts
// blockweise Portbereiche ab 49152 (netsh interface ipv4 show excludedportrange
// protocol=tcp). Ein bind() dort liefert EADDRINUSE, obwohl niemand lauscht —
// der Daemon war damit auf jedem WSL2-Rechner unstartbar [T002708].
const PORT = parseInt(process.env.COCKPIT_DAEMON_PORT || '39152', 10);
```

- [x] **Startmeldung in den `serve()`-Callback verschieben.** Die drei `console.log`-Zeilen
      (aktuell 118–120) stehen vor `serve()` und melden Erfolg, bevor gebunden wurde. Sie gehören
      in den Listening-Callback, den `serve()` als zweites Argument annimmt.

- [x] **`EADDRINUSE` verständlich behandeln.** Den von `serve()` zurückgegebenen Server auf
      `error` hören lassen: bei `EADDRINUSE` Port, Ursache und Abhilfe im Klartext ausgeben und
      mit `process.exit(1)` beenden, statt den Unhandled-`error`-Stacktrace zu werfen. Andere
      Fehler unverändert weiterreichen, damit der Handler keine echten Defekte verschluckt.

```typescript
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`[cockpit-daemon] listening on http://127.0.0.1:${info.port}`);
  console.log(`[cockpit-daemon] token at /tmp/cockpit-daemon.token (0600)`);
  console.log(`[cockpit-daemon] pid ${process.pid}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') { throw err; }
  console.error(
    `[cockpit-daemon] FEHLER: Port ${PORT} auf 127.0.0.1 ist belegt oder reserviert (EADDRINUSE).\n` +
    `  Laeuft bereits ein Daemon?  ss -ltnp | grep ${PORT}\n` +
    `  Auf WSL2 kann der Port auch ohne Lauscher reserviert sein:\n` +
    `    netsh.exe interface ipv4 show excludedportrange protocol=tcp\n` +
    `  Anderen Port waehlen:  COCKPIT_DAEMON_PORT=<frei> npx tsx .lavish/kit/daemon/server.ts`
  );
  process.exit(1);
});
```

- [x] **`.lavish/kit/adapter.js` nachziehen.** Zeile 10 `DAEMON_BASE` und Zeile 37 der
      `Number(location.port) === 49152`-Vergleich auf 39152. Beide Stellen müssen zusammen
      geändert werden: Zeile 37 entscheidet, ob der Adapter überhaupt in den Daemon-Modus geht.

- [x] **`.lavish/kit/canvas-store.js` Kommentar (Zeile 71)** auf 39152 korrigieren — er nennt die
      Basis-URL, die der Adapter ansteuert, und würde sonst auf einen toten Port verweisen.

- [x] **`Taskfile.yml` Zeile 4151:** `PORT: '{{.PORT | default "49152"}}'` → `"39152"`. Der Task
      startet denselben Daemon; ein abweichender Default würde `cockpit:daemon` gegen einen
      anderen Port prüfen lassen, als der Daemon bindet.

## p2 — Tests und Helper

- [x] **`tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` auf freie Ports ziehen.**
      `PORT=49199` → `39199` (Zeile 70), `DEAD_PORT=49198` → `39198` (Zeile 113). Den
      Kommentarblock ab Zeile 83 richtigstellen: die dort als ausgeschlossen notierte Ursache
      („Portkonflikt mit dem CI-Daemon") war die falsche Fährte — die Flakiness aus T002602
      erklärt sich durch die Hyper-V-Reservierung, nicht durch einen konkurrierenden Prozess.

- [x] **Die wirkungslose Assertion in derselben Datei reparieren (Zeile 132).**
      `! echo "$output" | grep -q "# skip"` schaltet `set -e` ab und kann nie fehlschlagen.
      Ersetzen durch eine gezählte Prüfung, die tatsächlich rot werden kann:

```bash
# Vorher (wirkungslos): ! echo "$output" | grep -q "# skip"
run bash -c "echo \"\$output\" | grep -c '# skip'"
[ "$output" -eq 0 ]
```

      Da `run` die Variable `$output` überschreibt, den zu prüfenden Text vorher in eine eigene
      Variable sichern. Nach der Umstellung muss der Test weiterhin grün sein — ist er es nicht,
      war die Aussage schon immer falsch und der Befund gehört ins Ticket, nicht in eine
      Anpassung der Erwartung.

- [x] **`tests/spec/sdlc-cockpit/daemon-helper.bash` Zeile 17** und
      **`tests/spec/sdlc-cockpit/daemon-token-endpoint-removed.bats` Zeile 27**:
      `${COCKPIT_DAEMON_PORT:-49152}` → `:-39152`. Beide bilden den Default des Daemons nach und
      würden sonst gegen einen Port prüfen, auf dem nichts läuft.

- [x] **`tests/spec/sdlc-cockpit/write-token-removed.bats` Zeile 17:** das simulierte
      `location = { protocol: 'file:', port: '49152' }` auf `'39152'` ziehen — der Wert muss zum
      Vergleich in `adapter.js:37` passen, sonst prüft der Test einen Pfad, den der Adapter nie
      nimmt.

- [x] **Gesamte Cockpit-Suite grün fahren.** Beide Dateiformen erfassen (Sammeldatei *und*
      Verzeichnis, T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: PASS — inklusive daemon-runtime-contract.bats Test 3, der den Anlass des Tickets bildet
```

## Verify

- [x] **Abschluss-Verifikation.** Die drei Pflicht-Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [x] **Ticket-Nachtrag.** T002524 wurde als `cant_reproduce` geschlossen und ist damit falsch
      abgelegt: reproduzierbar war der Defekt sehr wohl, nur lag die Ursache nicht bei den
      Dependencies. Einen Kommentar an T002524 hängen, der auf T002708 und die verifizierte
      Ursache verweist.
