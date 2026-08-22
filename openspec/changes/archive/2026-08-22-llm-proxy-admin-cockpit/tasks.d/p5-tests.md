# p5-tests — Rot vor grün, Registrierung, Abschlussverifikation

_Rolle: tests · Ticket: T013909_

Die Tests dieses Partials entstehen **vor** den Implementierungspartials. Sie sind zuerst rot; erst
danach werden p1 bis p4 umgesetzt.

## 1. Roter Test für Discovery und Bearer-Guard

`scripts/llm-proxy/listeners.test.mjs` nach dem Muster der Nachbardateien (`node:test` plus
`node:assert/strict`, wie `loadouts.test.mjs`).

`discoverBridgeAddress` darf im Test kein `docker` aufrufen — der Offline-Job der CI garantiert
kein Docker. Die Funktion bekommt deshalb in p1 einen injizierbaren Ausführungs-Callback als
zweiten Parameter, dessen Vorgabe `execFileSync` ist. Der Test reicht eine Attrappe hinein.

Abzudeckende Fälle:

- Die Attrappe liefert eine Gateway-Adresse — die Funktion gibt sie zurück.
- Die Attrappe wirft — die Funktion gibt `null` zurück und wirft nicht weiter.
- `withBearerAuth` ohne `authorization`-Header — Antwort 401, der innere Handler wurde nicht
  aufgerufen.
- `withBearerAuth` mit falschem Token — Antwort 401.
- `withBearerAuth` mit korrektem Token — der innere Handler wurde genau einmal aufgerufen.
- `startListeners` ohne Token, aber mit Adresse — es entsteht genau ein Listener, und die Adresse
  des Bridge-Listeners taucht in keinem davon auf.

Der letzte Fall ist der wichtigste: er sichert die Regel ab, dass ein fehlendes Token den Listener
schließt, statt ihn ungeschützt zu öffnen.

Ausführen und den roten Lauf bestätigen:

```bash
node --test scripts/llm-proxy/listeners.test.mjs
# expected: FAIL — listeners.mjs existiert noch nicht
```

## 2. Roter BATS-Test für das Listener-Verhalten am laufenden Proxy

`tests/spec/local-llm-proxy/host-listener-auth.bats`.

Dieser Test setzt einen laufenden Proxy voraus, den CI nicht stellt. Der Verfügbarkeits-Guard
gehört deshalb schon in die Rotphase, sonst misst der Test die Ausstattung des Runners statt den
Zustand des Codes:

```bash
curl -s -m 2 -o /dev/null "http://127.0.0.1:18235/livez" || skip "llm-proxy not running"
```

Geprüft wird gegen die Ausgabe der Befehle, nicht gegen den Quelltext:

- `/admin/state` auf dem Loopback-Listener antwortet ohne `Authorization`-Header mit 200.
- Die Antwort von `/admin/state` enthält die Felder `port`, `uptimeSec` und `version`.
- `/admin` antwortet mit 410 und enthält kein `<html`.
- Ist ein Bridge-Listener offen, antwortet `/admin/state` dort ohne Token mit 401 und mit
  korrektem Token mit 200. Ist keiner offen, wird dieser Block übersprungen — mit einer
  Skip-Begründung, die den Grund nennt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/host-listener-auth.bats
# expected: FAIL
```

## 3. Roter Test für die Zustandsunterscheidung

`tests/spec/sdlc-cockpit/proxy-unreachable-vs-stopped.bats` prüft, dass die Oberfläche einen nicht
adressierbaren Proxy nicht mehr als angehaltenen ausgibt. Positiv-Anker statt Abwesenheitsprüfung:
der Test verlangt, dass die versuchte Adresse im Text vorkommt, und erst danach, dass der
Startbefehl fehlt. Eine reine Abwesenheitsprüfung wäre auch bei einer leeren Datei grün.

## 4. Vitest für die Fehlerklassifikation

`components/website/src/lib/sdlc/__tests__/llm-proxy-client.test.ts` deckt `classifyProxyError` für
alle drei Zustände ab, jeweils mit dem Fehlerobjekt, das `fetch` in dieser Lage tatsächlich wirft:
DNS-Fehlschlag, `ECONNREFUSED`, abgebrochenes `AbortSignal`, HTTP 401, HTTP 500.

## 5. Neue Testdateien in CI registrieren

`.github/workflows/ci.yml` listet die `scripts/llm-proxy/*.test.mjs`-Dateien einzeln auf (Zeile
175). Eine nicht eingetragene Datei läuft in CI nie und ist damit kein Gate, sondern Dekoration.
`listeners.test.mjs` wird dort ergänzt. Der bestehende Guard
`tests/spec/local-llm-proxy/proxy-tests-registered.bats` prüft genau diese Übereinstimmung und muss
nach der Ergänzung grün sein.

Danach das Testinventar regenerieren, das CI gegen den committeten Stand vergleicht:

```bash
task test:inventory
```

## 6. Grüner Durchlauf nach der Implementierung

Nach p1 bis p4 alle vier Testdateien erneut ausführen und den Wechsel auf grün bestätigen.

## 7. Abschlussverifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

Zusätzlich die beiden Zählungen, die dieser Plan angefasst hat:

```bash
wc -l scripts/llm-proxy/server.mjs
bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

`server.mjs` muss unter 800 Zeilen liegen, die `any`-Zählung bei 0 bleiben.
