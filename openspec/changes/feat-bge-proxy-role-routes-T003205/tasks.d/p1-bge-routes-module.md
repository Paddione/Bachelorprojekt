# P1 — Rollenmodul `scripts/llm-proxy/bge-routes.mjs`

**Rolle:** impl · **Zieldateien:** `scripts/llm-proxy/bge-routes.mjs` (neu) · **depends_on:** —

Das Modul kapselt Rollenauflösung, Kettenabarbeitung und Failover. Es kennt den HTTP-Server
nicht — es bekommt Konfiguration und einen Request-Body herein und liefert ein Ergebnis heraus.
Diese Grenze ist der Grund, warum die Failover-Semantik überhaupt gegen Stubs prüfbar ist.

## Tasks

- [ ] **Konfiguration lesen.** `loadRoles(doc)` liest den Top-Level-Schlüssel `roles` aus dem
      bereits geparsten `loadouts.json`-Dokument (das Einlesen selbst macht `loadouts.mjs`,
      hier wird nichts zusätzlich von der Platte gelesen). Rückgabe: Map Rolle → Kette aus
      Einträgen. Ein Eintrag ist entweder `{kind: 'loadout', slug}` (Präfix `loadout:`) oder
      `{kind: 'url', baseUrl}`. Unbekannte Präfixe und leere Ketten werfen mit nennendem Text,
      damit ein Konfigurationsfehler beim Start auffällt und nicht beim ersten Request.

- [ ] **Rolle aus dem Pfad ableiten.** `roleForPath(path)` bildet `/v1/embeddings` → `embed`
      und `/v1/rerank` → `rerank`, alles andere → `null`. Ausdrücklich **keine** Ableitung aus
      dem `model`-Feld des Requests: die Trennung von der Chat-Modellauflösung ist der Zweck
      dieses Moduls, und ein Blick ins `model`-Feld würde sie wieder einreißen.

- [ ] **Einen Upstream ansprechen.** `callEntry(entry, path, body, timeoutMs)` löst einen
      Loadout-Eintrag über seinen Port zu `http://127.0.0.1:<port>` auf, setzt den Request per
      `fetch` mit `AbortSignal.timeout(timeoutMs)` ab und klassifiziert das Ergebnis in genau
      vier Fälle: `ok` (2xx), `client_error` (4xx), `server_error` (5xx), `unreachable`
      (Verbindungsfehler **oder** `TimeoutError`). Timeout und Verbindungsfehler getrennt
      benennen — „nicht erreichbar" und „hat angenommen, aber nicht geantwortet" führen zu
      verschiedenen Diagnosen (dasselbe Argument steht in `scripts/bge-mcp/server.mjs:128-130`).

- [ ] **Loadout-Eintrag bei Bedarf starten.** Ist der Eintrag ein Loadout und nicht aktiv,
      über die vorhandene Start-Maschinerie aus `loadouts.mjs`/`runner.mjs` starten und
      höchstens `LOADOUT_START_BUDGET_MS = 20000` auf Bereitschaft warten. Die Grenze ist
      bewusst kleiner als der Request-Timeout: Start **plus** Cluster-Rückfall müssen zusammen
      unter der 30-s-Schranke des Shims bleiben, sonst bricht der Aufrufer ab, während der Proxy
      noch beim Rückfall ist. Scheitert Start oder Wartezeit, gilt der Eintrag als
      `unreachable` — ein nicht startendes Loadout darf den Request nicht verschlucken.

- [ ] **Kette abarbeiten.** `routeRequest({role, path, body, chain})` geht die Kette der Reihe
      nach durch:
      `ok` → sofort zurückgeben, zusammen mit dem Namen des Eintrags;
      `client_error` → **sofort zurückgeben, ohne weiteren Eintrag** — ein Fehler des Aufrufers
      wird durchgereicht, weil ein Wiederholen über die Kette aus einem sofortigen Fehler eine
      Hängepartie über mehrere Timeouts macht;
      `server_error` und `unreachable` → nächster Eintrag;
      Kette erschöpft → `503` mit **je Eintrag** einem Grund, nicht einer Sammelmeldung.

- [ ] **Header setzen.** Das Ergebnis trägt den Namen des bedienenden Eintrags, damit der
      Server ihn als `x-llm-proxy-bge-upstream` setzen kann. Der Header ist die einzige
      Möglichkeit, Failover von außen nachzuweisen, ohne an einer Fehlerformulierung zu hängen
      (T002716: Semantik statt Darstellung).

- [ ] **Keine Health-Probe einbauen.** Ausdrücklich festgehalten, weil es der naheliegende
      Reflex ist: die Auswahl geschieht **nur** über den Ausgang der weitergeleiteten Anfrage.
      Am 2026-08-09 lieferte `/health` des Cluster-Endpunkts durchgehend `200`, während er über
      60 s nicht antwortete (`scripts/bge-mcp/server.mjs:105-111`, T002838). Eine Probe würde
      genau in diesem Fall den falschen Upstream wählen.

- [ ] **S1 im Blick behalten.** `.mjs`-Limit ist 800 Zeilen. Bleibt das Modul darunter, ist der
      Zuschnitt richtig; nähert es sich der Grenze, gehört die Kettenabarbeitung in eine eigene
      Datei, nicht in `server.mjs`.
