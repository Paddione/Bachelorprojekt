# p4-ui — Zustände benennen und die Loadout-Verwaltung im Cockpit

_Rolle: impl · Ticket: T013909_

Das Panel zeigt heute genau zwei Lagen: geladen oder `Proxy offline — Start: task llm:proxy:start`.
Die zweite ist der Grund für dieses Ticket — sie war die einzige Erklärung für einen Proxy, der
lief. Dazu kommt die Loadout-Verwaltung, die es im Cockpit bisher gar nicht gab.

## 1. `LlmProxyPanel.svelte` — Zustände trennen

`isOffline` (`$derived(state?.proxy === 'offline')`) wird durch eine Auswertung des vom
Statusendpunkt gelieferten `kind` ersetzt. Drei Darstellungen statt einer:

| `kind` | Text | Angebotene Handlung |
|---|---|---|
| `unreachable` | benennt, dass das Cockpit den Proxy unter der genannten Adresse nicht erreicht | keine — insbesondere kein Startbefehl |
| `unauthorized` | benennt, dass die Adresse steht, das Token aber abgelehnt wurde | Hinweis auf den Abgleich zwischen `proxy.env` und dem Cluster-Secret |
| `error` | gibt die Meldung des Proxy wieder | keine |

Die Adresse stammt aus der Antwort, nicht aus einer Konstante im Panel — S3 verbietet Host-Literale
in `components/website/src`, und eine fest notierte Adresse wäre nach einem Cluster-Neuaufbau
falsch, ohne dass es auffällt.

Der Startbefehl verschwindet ersatzlos. Er war nie eine Abhilfe für den Fall, in dem er angezeigt
wurde: der Proxy lief bereits.

## 2. `LlmProxyPanel.svelte` — Identität anzeigen

Die Statuszeile (heute Zeile 108) zeigt `Port {state.port ?? '—'}`, `Uptime` und `v{state.version}`.
Alle drei Felder blieben leer, weil `/admin/state` sie nicht lieferte. Mit der Erweiterung aus p1
sind sie vorhanden; die Zeile funktioniert dann unverändert. Zu prüfen ist nur, dass die
Feldnamen übereinstimmen, und dass `uptimeSec` weiterhin in Minuten gerundet dargestellt wird.

Das TypeScript-Interface `ProxyState` im Panel wird an die neue Antwortform angeglichen:
`proxy: 'online' | 'unreachable' | 'unauthorized' | 'error'`, dazu die optionalen Felder `address`
und `message`. Kein `any`.

## 3. `LlmLoadoutPanel.svelte` anlegen

Eine eigene Komponente statt einer Erweiterung des bestehenden Panels: das Backend-Panel steht bei
168 Zeilen mit 932 Zeilen Budget, aber die Loadout-Verwaltung ist ein eigener Gegenstand mit eigenem
Ladezustand. Zwei Verantwortlichkeiten in einer Datei würden hier keine Zeilen sparen, sondern nur
die Zuständigkeit verwischen.

Inhalt, abgeleitet aus dem, was die entfallende Proxy-Seite bot:

- Eine Tabelle der konfigurierten Loadouts mit Laufzustand und Gesundheit aus
  `/sdlc/api/llm-proxy/loadouts/status`.
- Je Zeile eine Start- und eine Stopp-Schaltfläche gegen
  `/sdlc/api/llm-proxy/loadouts/[slug]/[action]`, während der Anfrage gesperrt.
- Der Pin-Zustand aus `/sdlc/api/llm-proxy/loadouts/pin`, les- und setzbar.
- Der Modellkatalog aus `/sdlc/api/llm-proxy/models` als Auswahlgrundlage.

Die Komponente übernimmt die Fehlerdarstellung des Backend-Panels: dieselben drei Zustände,
dieselbe Regel, dass in keinem davon eine schreibende Schaltfläche angeboten wird. Sie wird dort
eingebunden, wo `LlmProxyPanel` bereits eingebunden ist, damit beide Teile derselben Oberfläche
sind.

Ein Startvorgang kann Minuten dauern — der Proxy lädt ein Modell auf die GPU. Die Schaltfläche
zeigt für diese Zeit einen laufenden Zustand und pollt `/loadouts/status`, statt auf eine einzelne
Antwort zu warten und in einen Timeout zu laufen.

## Definition of Done

```bash
cd components/website && npx vitest run --changed
```

- Bei laufendem Proxy zeigt die Statuszeile Port, Laufzeit und Version statt Gedankenstrichen.
- Bei angehaltenem Bridge-Listener nennt das Panel die versuchte Adresse und bietet keinen
  Startbefehl an.
- Ein Loadout lässt sich aus dem Cockpit starten und stoppen, und die Tabelle folgt dem Zustand
  ohne Neuladen der Seite.
