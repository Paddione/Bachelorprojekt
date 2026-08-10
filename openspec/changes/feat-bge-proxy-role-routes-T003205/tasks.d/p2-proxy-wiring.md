# P2 — Routen anschließen und Ketten konfigurieren

**Rolle:** impl · **Zieldateien:** `scripts/llm-proxy/server.mjs`, `scripts/llm/loadouts.json`
· **depends_on:** P1

`server.mjs` bekommt hier nur die beiden Weiterleitungen — die Logik bleibt in `bge-routes.mjs`.
Budget: 183 Zeilen bis zur S1-Grenze; der geplante Zuwachs liegt im niedrigen zweistelligen
Bereich.

## Tasks

- [ ] **Ketten in `loadouts.json` deklarieren.** Neuer Top-Level-Schlüssel `roles`, geschwisterlich
      zu `loadouts` und `modelRoots`:

```jsonc
"roles": {
  "embed":  { "chain": ["loadout:bge-embed-cpu",  "http://127.0.0.1:8081"] },
  "rerank": { "chain": ["loadout:bge-rerank-cpu", "http://127.0.0.1:8093"] }
}
```

      Lokal zuerst, Cluster als Rückfall — vom Operator entschieden, weil der Cluster-Ausfall
      der real erlebte Fall ist. Die zweiten Glieder sind genau die Ports, die
      `bge-forward-embed.service` (`:8081`) und `bge-forward-rerank.service` (`:8093`) halten.

- [ ] **`notes` der beiden bge-Loadouts korrigieren.** Sie widersprechen sich heute:
      `bge-rerank-cpu` behauptet „der reguläre lokale Weg", `bge-embed-cpu` sagt „der lokale
      Ersatzweg", während tatsächlich beides über den Cluster lief. Nach diesem Change ist die
      Aussage für beide dieselbe und stimmt: erstes Glied der Rollenkette, vom Proxy bei Bedarf
      gestartet. Eine `notes`-Zeile, die den Betriebszustand falsch beschreibt, ist die Quelle,
      aus der die nächste Fehlannahme entsteht.

- [ ] **Schema-Guard mitziehen.** `tests/spec/local-llm-proxy/loadouts-format.bats` prüft die
      Struktur von `loadouts.json`. Prüfen, ob der neue Schlüssel dort durchfällt, und den Guard
      um `roles` erweitern statt ihn zu umgehen. Der Guard ist der Grund, warum die Konfiguration
      überhaupt in diese Datei gehört.

- [ ] **Routen in `server.mjs` anschließen.** Neben den bestehenden Zweigen (`/v1/models`,
      `/healthz`, `/livez`, `/admin/*`) zwei Weiterleitungen ergänzen:

```js
if ((path === '/v1/embeddings' || path === '/v1/rerank') && method === 'POST') {
  const role = roleForPath(path);
  const result = await routeRequest({ role, path, body: await readBody(req), chain: rolesFor(role) });
  if (result.upstream) res.setHeader('x-llm-proxy-bge-upstream', result.upstream);
  return sendJson(res, result.status, result.body);
}
```

- [ ] **`/v1/models` unangetastet lassen.** Ausdrücklicher Prüfpunkt, kein Nebensatz: `aggregateModels()`
      darf kein bge-Modell aufnehmen. Sonst könnte ein Client, der sich das erste Modell der Liste
      greift, `bge-m3` eine Chat-Completion schicken — exakt die Fehlerklasse, die T003203 gerade
      behebt.

- [ ] **Konfigurationsfehler beim Start melden.** Fehlt `roles` oder ist eine Kette leer, soll das
      beim Laden auffallen (Logzeile plus `503` auf den Rollen-Routen), nicht als undefinierter
      Zugriff beim ersten Request. Die Chat-Routen bleiben davon unberührt — ein kaputter
      bge-Block darf den Proxy nicht insgesamt lahmlegen.

- [ ] **Zeilenzuwachs prüfen.** Nach der Änderung `wc -l scripts/llm-proxy/server.mjs`; liegt der
      Wert über 700, ist zu viel Logik in den Server gewandert und gehört zurück nach
      `bge-routes.mjs`.
