# p1-listener — Zweiter Listener, Bearer-Guard, Wegfall der Proxy-UI

_Rolle: impl · Ticket: T013909_

Der Proxy bekommt einen zweiten Listener auf der k3d-Bridge-IP, abgesichert durch ein Bearer-Token,
und verliert seine eigene Admin-Seite. `scripts/llm-proxy/server.mjs` hat bei 742 von 800 Zeilen
nur 58 Zeilen Budget — die neue Logik wird deshalb in ein eigenes Modul extrahiert, nicht dort
ergänzt.

## 1. `scripts/llm-proxy/listeners.mjs` anlegen

Neues Modul, keine Abhängigkeit auf `server.mjs` (S2: reines Modul, kein Rück-Import).

Exportierte Funktionen, alle typisiert per JSDoc analog zu den Nachbarmodulen:

- `discoverBridgeAddress(networkName, exec = execFileSync)` — ermittelt das Gateway des
  k3d-Docker-Netzes über `exec('docker', ['network', 'inspect', networkName, '-f', '<go-template>'])`.
  Gibt bei jedem Fehler `null` zurück statt zu werfen; der Aufrufer entscheidet. Der Netzname kommt
  aus `LLM_PROXY_K3D_NETWORK` mit Vorgabe `k3d-mentolder-dev`. Der zweite Parameter ist einspritzbar,
  damit der Test ohne installiertes Docker läuft — der Offline-Job der CI stellt keines.
- `withBearerAuth(handler, token)` — umschließt einen Node-HTTP-Handler. Fehlt der Header
  `authorization` oder trägt er nicht exakt `Bearer <token>`, antwortet der Wrapper mit HTTP 401
  und dem Rumpf `{ error: { code: 'unauthorized' } }`; der innere Handler wird nicht aufgerufen.
  Der Vergleich läuft über `crypto.timingSafeEqual` auf gleich langen Puffern, mit einem
  Längenvergleich davor.
- `startListeners(handler, port, opts)` — öffnet immer den Loopback-Listener und zusätzlich den
  Bridge-Listener, sobald **beide** Bedingungen erfüllt sind: eine Adresse ist bekannt
  (`opts.bindOverride` oder Discovery) und ein Token ist gesetzt. Gibt ein Array der gestarteten
  Server zurück und protokolliert je eine Zeile pro Listener.

Die drei Fälle, die genau so protokolliert werden müssen, weil sie sonst als stiller Ausfall
erscheinen:

| Lage | Ergebnis | Logzeile |
|---|---|---|
| Adresse gefunden, Token gesetzt | beide Listener | nennt beide Adressen |
| keine Adresse ermittelbar | nur Loopback | nennt den Grund der Discovery |
| Adresse gefunden, Token fehlt | nur Loopback | nennt das fehlende `LLM_PROXY_ADMIN_TOKEN` |

Der dritte Fall ist die wichtigste Regel des Moduls: ein offener, unauthentifizierter
GPU-Steuerungsendpunkt ist ein schlechteres Ergebnis als ein unerreichbares Cockpit. Niemals einen
Bridge-Listener ohne Token öffnen.

## 2. `scripts/llm-proxy/server.mjs` umbauen

- Den an `http.createServer` übergebenen Callback als benannte Konstante `requestHandler`
  herausziehen. Der Rumpf bleibt unverändert.
- Zeile 730 (`server.listen(PORT, '127.0.0.1', …)`) durch den Aufruf von `startListeners` ersetzen:

```js
import { startListeners } from './listeners.mjs';

const listeners = startListeners(requestHandler, PORT, {
  bindOverride: process.env.LLM_PROXY_HOST_BIND || null,
  token: process.env.LLM_PROXY_ADMIN_TOKEN || null,
  network: process.env.LLM_PROXY_K3D_NETWORK || 'k3d-mentolder-dev',
});
```

- `shutdown()` schließt alle Einträge aus `listeners`, bevor es `process.exit` erreicht.
- `/admin/state` (Zeile 530) um drei Felder erweitern: `port` (der Wert von `PORT`), `uptimeSec`
  (`Math.floor(process.uptime())`) und `version` (aus `package.json` gelesen oder, falls dort keine
  passende Angabe steht, aus einer Konstante im Modul). Damit hört das Cockpit auf, `Port — ·
  Uptime — · v—` bei laufendem Proxy anzuzeigen.
- `/admin` und `/admin/` (Zeile 543): den `readFileSync` auf `./ui/index.html` entfernen und
  stattdessen mit HTTP 410 und einem kurzen Textrumpf antworten, der das Cockpit als
  Administrationsoberfläche nennt. Der Text darf keine Brand-Domain enthalten (S3) — er nennt den
  Pfad im Cockpit, nicht eine vollständige URL.

Erwarteter Nettozuwachs: der Wegfall des Datei-Lesens gibt Zeilen zurück, die Erweiterung von
`/admin/state` kostet vier. Nach der Änderung `wc -l scripts/llm-proxy/server.mjs` prüfen — der Wert
muss unter 800 bleiben.

## 3. `scripts/llm-proxy/ui/index.html` löschen

`git rm scripts/llm-proxy/ui/index.html`. Anschließend prüfen, dass keine Referenz zurückbleibt:

```bash
grep -rn "ui/index.html" scripts/ taskfiles/ docs/ --include='*.mjs' --include='*.yml' --include='*.md'
```

Bleiben Treffer, gehören sie im selben Schritt entfernt oder umgeschrieben — S4 wertet ein
verwaistes Skript wie ein verwaistes Manifest.

## 4. `scripts/llm-proxy/llm-proxy.service` ergänzen

Der Kommentarblock zu `EnvironmentFile` erklärt bereits, warum `BGE_MCP_TOKEN` dort hineingehört
und nicht optional ist. `LLM_PROXY_ADMIN_TOKEN` bekommt daneben denselben Rang, mit dem Unterschied,
dass sein Fehlen keinen harten Ausfall erzeugt, sondern den Bridge-Listener geschlossen lässt —
genau das gehört in den Kommentar, damit niemand den geschlossenen Listener später als Defekt sucht.
Erzeugungsbefehl mitschreiben:

```bash
printf 'LLM_PROXY_ADMIN_TOKEN=%s\n' "$(openssl rand -hex 32)" >> ~/.config/llm-proxy/proxy.env
```

Die Datei ist untracked und bleibt es; kein Tokenwert wandert in ein verfolgtes File.

## 5. `taskfiles/Taskfile.llm.yml` anpassen

Der Status-Task nennt bislang nur den Loopback-Port. Er soll beide Listener ausweisen, damit ein
geschlossener Bridge-Listener sichtbar ist, ohne die Logs zu lesen. Die Ausgabe darf keine IP
hartkodieren, sondern liest sie aus `/admin/state` beziehungsweise dem Discovery-Ergebnis.

## Definition of Done

- `node -e "import('./scripts/llm-proxy/listeners.mjs').then(m => console.log(Object.keys(m)))"`
  listet die drei Exporte.
- Der Proxy startet ohne laufenden k3d-Cluster und protokolliert den Grund.
- `wc -l scripts/llm-proxy/server.mjs` liegt unter 800.
- `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18235/admin` liefert 410.
