# p2 — Mitschnitt-Modul und Eingriff im Proxy

**Rolle:** implementation
**Dateien:** `scripts/llm-proxy/request-log.mjs`, `scripts/llm-proxy/respond.mjs`,
`scripts/llm-proxy/server.mjs`

## Kontext

`proxyV1` in `scripts/llm-proxy/server.mjs` ist der einzige Eingriffspunkt für alle `/v1/*`-POSTs
(Zeile 650). Die Erfassung darf den Transport unter keinen Umständen beeinflussen — Begründung,
Fehlerregeln und der T002609-Vorbehalt gegen Eingriffe im Stream-Pfad stehen in `design.md` → D2,
D1a, D4.

## Aufgaben

- [ ] **Antwortpfade extrahieren.** Die beiden Antwortpfade aus `proxyV1` (gepufferter Pfad ab
      `if (upstream.body && budgetedBody?.stream !== true)`, Stream-Pfad ab `res.writeHead`) nach
      `scripts/llm-proxy/respond.mjs` verlagern, mit den Funktionen `respondBuffered()` und
      `respondStreamed()`. `server.mjs` ruft nur noch auf.

      Das ist ein echter Split, kein Zeilen-Zusammenziehen: `server.mjs` liegt bei 665 von 800
      Zeilen und käme mit dem Mitschnitt in Reichweite der Schwelle. Der Nebengewinn ist, dass der
      Stream-Tap dadurch ohne laufenden Server prüfbar wird.

      Verhalten dabei **unverändert** lassen — insbesondere `stripTurnMarkers` im gepufferten Pfad
      (T002609) und den `upstreamStream.on('error')`-Pfad, der einen Backend-Abbruch abfängt,
      damit er nicht die gesamte serialisierte Queue mitreißt.

- [ ] **`request-log.mjs` anlegen** mit der öffentlichen Fläche `capture(record)`,
      `truncate(text, limit)`, `flush()` und `startFlushTimer(intervalMs)`. Das Modul kennt weder
      `http` noch Request-Objekte.

- [ ] **Kappung.** `truncate()` schneidet bei 256 KiB und meldet die Originalgröße zurück, damit
      `truncated` und `original_bytes` gesetzt werden können. Stilles Abschneiden ist untersagt.

- [ ] **Gebündeltes Schreiben.** `capture()` hängt die Zeile an einen Speicherpuffer; ein Timer
      schreibt alle 5 Sekunden gesammelt über **einen** `factory_psql`-Aufruf. Kein Aufruf je
      Dispatch: der Zugang ist `kubectl exec -i <pod> -- psql` und kostet je Aufruf einen
      Prozessstart. Bodies gehen über stdin, nicht über Kommandozeilenargumente.

- [ ] **Puffer beim Herunterfahren leeren.** `SIGTERM`/`SIGINT` lösen ein letztes `flush()` aus,
      bevor der Prozess endet.

- [ ] **Fehler verschlucken, nie weiterreichen.** Jeder Fehler beim Puffern oder Schreiben endet in
      einer Zeile auf stderr und verwirft den Mitschnitt. `capture()` wird in `server.mjs` **nicht**
      awaited.

- [ ] **Eingriff im gepufferten Pfad.** In `respondBuffered()` nach dem Lesen der Antwort die
      Zeile vervollständigen und `capture()` aufrufen.

- [ ] **Eingriff im Stream-Pfad.** In `respondStreamed()` einen `PassThrough` als passiven Tap
      neben den bestehenden Pipe hängen, der die Chunks sammelt. Vollständig in eigenem
      `try/catch`: jeder Fehler verwirft den Mitschnitt und lässt den Transport unberührt. Endet
      der Strom vor dem Abschlusssignal des Backends, wird die Zeile mit `stream_incomplete = true`
      geschrieben — nicht weggelassen.

- [ ] **Kopfdaten einsammeln.** Nach `readBody()` in `proxyV1` Zeitstempel, `requestedModel`,
      Korrelations-Header und Warteschlangenzeit (`waitMs` ist dort bereits berechnet) erfassen und
      an den Antwortpfad durchreichen.

- [ ] **Erfassung von Hand nachweisen** — geprüft wird die geschriebene Zeile, nicht der Quelltext:

```bash
curl -s -X POST http://127.0.0.1:18235/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"gemma26-factory","messages":[{"role":"user","content":"ping"}]}' >/dev/null
sleep 6   # eine Pufferperiode abwarten
source scripts/factory/lib.sh && factory_resolve
echo "SELECT backend, http_status, length(request_body) FROM tickets.llm_proxy_request_log ORDER BY id DESC LIMIT 1;" | factory_psql
# erwartet: eine Zeile mit gesetztem backend, http_status und einer Body-Laenge > 0
```

## Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/llm-proxy/server.mjs` | 665 | 135 |

`server.mjs` ist nicht gebaselinet, wirksame Schwelle ist das `.mjs`-Limit von 800. Durch die
Extraktion nach `respond.mjs` **sinkt** die Zeilenzahl netto, statt das Budget aufzubrauchen.
`request-log.mjs` und `respond.mjs` sind neu und werden mit Reserve unter 800 Zeilen geschnitten.
