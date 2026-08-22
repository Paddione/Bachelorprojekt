# p3-routes — Gemeinsamer Proxy-Client und die fehlenden Cockpit-Routen

_Rolle: impl · Ticket: T013909_

Vier Stellen im Cockpit sprechen den Proxy heute je einzeln an und tragen dieselbe Konstante
`process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235'` viermal: `status.ts`, `reload.ts`,
`lib/sdlc/llm-proxy-factory.ts`, `lib/sdlc/model-catalog.ts`. Keine davon kennt ein Token. Käme das
Token an nur drei von vier Stellen an, wäre die vierte ein schwer auffindbarer 401.

## 1. `components/website/src/lib/sdlc/llm-proxy-client.ts` anlegen

Ein Modul, das jede Proxy-Anfrage des Cockpits kapselt. Keine Abhängigkeit auf DB- oder
API-Schichten (S2).

- `proxyFetch(path, init)` — setzt die Basis-URL aus `LLM_PROXY_URL`, hängt
  `Authorization: Bearer ${LLM_PROXY_ADMIN_TOKEN}` an, sofern die Variable gesetzt ist, und legt
  ein `AbortSignal` mit 1500 ms an, wie es `status.ts` heute schon tut.
- `classifyProxyError(err)` — bildet einen Fehler auf einen der drei Zustände ab. Genau diese
  Unterscheidung ist der Kern der Änderung:

| Beobachtung | Zustand | Bedeutung |
|---|---|---|
| DNS scheitert, `ECONNREFUSED`, `EHOSTUNREACH`, Abbruch durch Timeout | `unreachable` | kein Netzwerkpfad — ein Prozessstart ändert nichts |
| HTTP 401 oder 403 | `unauthorized` | Pfad steht, das Token stimmt nicht |
| Antwort kommt, aber kein 2xx | `error` | der Proxy antwortet und lehnt ab |

Der Zustand „Proxy läuft nicht" ist vom Cockpit aus **nicht** von `unreachable` unterscheidbar,
solange der Cockpit-Pod nur den Bridge-Listener sieht. Der Client behauptet deshalb nie, der Proxy
sei gestoppt. Er meldet `unreachable` samt der Adresse, die er versucht hat, und überlässt die
Formulierung der Oberfläche (p4).

- Ein exportierter Typ `ProxyFailure = { kind: 'unreachable' | 'unauthorized' | 'error'; address: string; message: string }`.
  Kein `any` — die `any`-Zählung in `components/website/src` steht bei 0 und bleibt dort.

## 2. `status.ts` auf den Client umstellen

Der `catch`-Zweig gibt statt `{ proxy: 'offline' }` künftig `{ proxy: <kind>, address, message }`
plus weiterhin die DB-gestützte Backend-Liste zurück. Der Erfolgsfall setzt `proxy: 'online'` statt
`'ok'` — das Panel-Interface typisiert bereits `'online'`, und der abweichende Wert war folgenlos
nur, weil ausschließlich auf `'offline'` verglichen wurde. Der Kommentar im Zweig wird auf die neue
Semantik gezogen; er beschreibt heute richtig, warum der Fallback existiert, aber nennt den Fall
„Pod erreicht Host-Proxy nicht" als Randnotiz statt als den Regelfall, der er ist.

## 3. Die fehlenden Routen anlegen

Alle nach dem Muster von `catalog.ts`: `prerender = false`, `getSession` plus `isAdmin` vor jeder
Weiterleitung, JSON-Antworten über denselben lokalen `json`-Helfer.

| Datei | Methode | Proxy-Route |
|---|---|---|
| `loadouts.ts` | GET, PUT | `/admin/loadouts` |
| `loadouts/status.ts` | GET | `/admin/loadouts/status` |
| `loadouts/pin.ts` | GET, PUT | `/admin/loadouts/pin` |
| `loadouts/[slug]/[action].ts` | POST | `/admin/loadouts/<slug>/start` und `/stop` |
| `models.ts` | GET | `/admin/models` |

Die dynamische Route validiert `action` gegen die Menge `start` und `stop` und antwortet auf alles
andere mit HTTP 400, bevor sie den Proxy erreicht. `slug` wird gegen dasselbe Muster geprüft, das
`server.mjs:663` verwendet (`[a-z0-9-]+`); ein durchgereichter Pfad ohne Prüfung wäre eine offene
Weiterleitung in die Admin-Fläche des Proxy.

`PUT /admin/loadouts` trägt wie `factory.ts` einen optimistischen Sperrwert. Der Proxy antwortet auf
einen veralteten Schreibzugriff mit 409; diese Antwort wird als unterscheidbarer Konflikt
weitergereicht, nicht als allgemeiner Fehlschlag — dieselbe Regel, die `FactoryWriteConflictError`
bereits umsetzt.

## 4. `llm-proxy-factory.ts` und `model-catalog.ts` umstellen

Beide ersetzen ihre lokale `PROXY_URL`-Konstante durch `proxyFetch`. Verhalten und Signaturen
bleiben unverändert; `FactoryProxyOfflineError` bleibt bestehen, wird aber aus
`classifyProxyError` gespeist, damit ein 401 nicht mehr als „offline" durchgeht.

Nach der Umstellung darf die Zeichenkette `127.0.0.1:18235` in `components/website/src` nur noch als
Vorgabewert innerhalb von `llm-proxy-client.ts` vorkommen:

```bash
grep -rn "18235" components/website/src --include='*.ts' --include='*.svelte'
```

## Definition of Done

```bash
cd components/website && npx vitest run src/lib/sdlc/__tests__/llm-proxy-client.test.ts
```

- Der Grep oben liefert genau einen Treffer.
- `grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' | wc -l` bleibt 0.
- Jede neue Route antwortet ohne Admin-Session mit 401 beziehungsweise 403, bevor der Proxy
  kontaktiert wird.
