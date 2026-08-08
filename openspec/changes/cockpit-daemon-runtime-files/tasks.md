---
title: "cockpit-daemon-runtime-files — Implementation Plan"
ticket_id: T002721
domains: [sdlc-cockpit, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cockpit-daemon-runtime-files — Implementation Plan

_Ticket: T002721 · Design: `openspec/changes/cockpit-daemon-runtime-files/design.md`_

## File Structure

```
.lavish/kit/daemon/server.ts                              (geändert — State-Dir, Schreibzeitpunkt, Cleanup)
tests/spec/sdlc-cockpit/daemon-runtime-files.bats         (neu — RED-Guard, liegt bereits vor)
openspec/changes/cockpit-daemon-runtime-files/specs/sdlc-cockpit.md (neu — Delta-Spec, liegt bereits vor)
```

## Partials

| # | Rolle | Ziel-Dateien | Abhängigkeit |
|---|-------|--------------|--------------|
| p1 | Daemon | `.lavish/kit/daemon/server.ts` | — |
| p2 | Tests | `tests/spec/sdlc-cockpit/daemon-runtime-files.bats` | p1 |

S1-Restbudget `.lavish/kit/daemon/server.ts`: 745 Zeilen (wirksame Schwelle − aktuelle Zeilen).
Der Zuwachs liegt bei rund +25 Zeilen; kein Split nötig. Die `.bats`-Datei ist ungated.

---

## p1 — Daemon

- [ ] **Failing-Test-Step (RED).** Der Guard liegt bereits als
      `tests/spec/sdlc-cockpit/daemon-runtime-files.bats` auf dem Branch. Vor der Implementierung
      ausführen und den roten Stand bestätigen. Beide Tests scheitern derzeit am Positiv-Anker
      `[ -f "${PIDFILE}" ]`, weil `COCKPIT_DAEMON_STATE_DIR` noch nicht beachtet wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-runtime-files.bats
# expected: FAIL (rot — State-Dir, Schreibzeitpunkt und Cleanup fehlen)
```

- [ ] **`COCKPIT_DAEMON_STATE_DIR` einführen.** Verzeichnis aus der Umgebung lesen, Default `/tmp`,
      und daraus die beiden Dateipfade ableiten. Die Pfade werden anschließend nur noch über diese
      Konstanten verwendet — kein zweites Literal im Code.

```typescript
// Umstellbar, damit Tests nicht den Zustand eines echten Entwickler-Daemons
// ueberschreiben — ohne das waere der Cleanup-Test selbst die Schadensquelle,
// gegen die er sich richtet [T002721].
const STATE_DIR = process.env.COCKPIT_DAEMON_STATE_DIR || '/tmp';
const TOKEN_FILE = `${STATE_DIR}/cockpit-daemon.token`;
const PID_FILE = `${STATE_DIR}/cockpit-daemon.pid`;
```

- [ ] **Mutationsprobe (Zwischenschritt, nicht überspringen).** Nach dem State-Dir, aber VOR dem
      Verschieben der Schreibvorgänge, den Guard erneut laufen lassen. Test 1 muss **weiterhin rot**
      sein — jetzt aber an der eigentlichen Aussage (`[ "$(cat "${PIDFILE}")" = "$pid_before" ]`),
      nicht mehr am Positiv-Anker. Das belegt, dass der Test den Defekt misst und nicht bloß die
      fehlende Umgebungsvariable.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-runtime-files.bats
# expected: FAIL — Test 1 an der Zustandsgleichheit, nicht mehr an [ -f "${PIDFILE}" ]
```

- [ ] **Schreibvorgänge in den `listen`-Callback verschieben.** Die beiden Aufrufe am
      Modul-Top-Level entfallen; sie stehen künftig neben der Startmeldung, die aus demselben
      Grund bereits dort steht (T002708). Den vorhandenen Kommentar mitnehmen und um den Grund
      ergänzen, warum „vor dem Serverstart" durch „im listen-Callback" erfüllt bleibt: der
      Callback feuert vor der Annahme des ersten Requests.

```typescript
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  // Erst jetzt — ein Prozess ohne Socket darf keine Spuren hinterlassen, die ihn
  // als laufenden Daemon ausweisen [T002721]. Die urspruengliche Anforderung
  // ("Token schreiben, BEVOR der Server bedient") bleibt erfuellt: dieser
  // Callback laeuft, bevor der erste Request angenommen wird.
  writeTokenFile(TOKEN_FILE, token);
  fs.writeFileSync(PID_FILE, String(process.pid));

  console.log(`[cockpit-daemon] listening on http://127.0.0.1:${info.port}`);
  console.log(`[cockpit-daemon] token at ${TOKEN_FILE} (0600)`);
  console.log(`[cockpit-daemon] pid ${process.pid}`);
});
```

- [ ] **Cleanup beim Beenden.** Eine `cleanup()`-Funktion entfernt beide Dateien und wird an
      `SIGINT`, `SIGTERM` und `exit` gehängt. Die Funktion MUSS vor dem Löschen prüfen, dass die
      PID-Datei die eigene PID enthält — sonst entfernt ein Prozess die Dateien eines fremden
      Daemons, also genau die Klasse von Fremdeingriff, gegen die dieses Ticket sich richtet.
      Sie muss außerdem mehrfach aufrufbar sein, ohne zu werfen (`SIGTERM` und `exit` feuern
      nacheinander), und darf bei fehlenden Dateien nicht scheitern.

      **Diese Funktion schreibt der Operator selbst** (siehe Anmerkung am Planende) — die
      Signalauswahl und der Umgang mit dem Ownership-Check sind eine bewusste Entscheidung, keine
      Mechanik. Die Aufhängepunkte:

```typescript
function cleanup(): void {
  // TODO(operator): beide Dateien entfernen — aber nur, wenn PID_FILE die
  // eigene process.pid traegt. Mehrfachaufruf und fehlende Dateien duerfen
  // nicht werfen.
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
```

- [ ] **Der `EADDRINUSE`-Pfad darf nichts aufräumen.** Der Handler aus T002708 beendet mit
      `process.exit(1)`, was `exit` und damit `cleanup()` auslöst. Da zu diesem Zeitpunkt keine
      Datei mit der eigenen PID existiert, greift der Ownership-Check und lässt den Zustand des
      laufenden Daemons unberührt. Diesen Zusammenhang im Code festhalten — er ist der Grund,
      warum der Check nicht optional ist.

- [ ] **Token-Pfad in der Fehlermeldung nachziehen.** Die `EADDRINUSE`-Meldung und der
      Dateikopf-Kommentar (`Stop: kill $(cat /tmp/cockpit-daemon.pid)`) nennen feste `/tmp`-Pfade.
      Beide auf die Konstanten bzw. auf den Default mit Hinweis auf die Variable umstellen.

## p2 — Tests

- [ ] **Guard grün fahren.** Beide Tests müssen bestehen, Test 1 einschließlich der
      HTTP-200-Assertion mit dem Token aus der Datei.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/daemon-runtime-files.bats
# expected: PASS
```

- [ ] **Gesamte Cockpit-Suite grün fahren.** Beide Dateiformen erfassen (T002696) — insbesondere
      `daemon-runtime-contract.bats` und `daemon-token-mode.bats`, die den Token-Pfad ebenfalls
      berühren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: PASS
```

- [ ] **Realprobe ohne State-Dir.** Der Default-Pfad muss unverändert funktionieren — sonst bricht
      der Adapter, der die Token-Datei unter `/tmp` erwartet:

```bash
npx tsx .lavish/kit/daemon/server.ts &
sleep 8 && test -f /tmp/cockpit-daemon.token && test -f /tmp/cockpit-daemon.pid
kill "$(cat /tmp/cockpit-daemon.pid)" && sleep 2
test ! -f /tmp/cockpit-daemon.token && test ! -f /tmp/cockpit-daemon.pid && echo "Cleanup OK"
```

## Verify

- [ ] **Abschluss-Verifikation.** Die drei Pflicht-Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **TypeScript unter `strict` prüfen** — der Daemon hat eine eigene tsconfig und wird von
      keinem CI-Job typgeprüft, ein Fehler fiele sonst erst zur Laufzeit auf:

```bash
npx tsc --noEmit -p .lavish/kit/daemon/tsconfig.json
```

---

**Anmerkung zur Arbeitsteilung:** Der `cleanup()`-Rumpf ist bewusst offen gelassen und wird vom
Operator geschrieben. Der Rest des Plans ist Mechanik; an dieser einen Stelle steht eine
Abwägung — wie streng der Ownership-Check ausfällt und ob `exit` neben den beiden Signalen
überhaupt behandelt wird — die die Entscheidung dessen sein sollte, der den Daemon betreibt.
