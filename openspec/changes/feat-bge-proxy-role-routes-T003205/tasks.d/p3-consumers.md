# P3 — Konsumenten auf den Proxy umhängen

**Rolle:** impl · **Zieldateien:** `scripts/bge-mcp/bge-mcp.service`,
`scripts/openspec-embed-local.sh` · **depends_on:** P2

Beide Konsumenten sind bereits env- bzw. default-gesteuert; die Umstellung ist je eine Adresse.
Der Aufwand steckt in den **Begleitzeilen** — Startbedingung und Fehlertext —, die heute den
Cluster-Forward voraussetzen und nach der Umstellung falsch wären.

## Tasks

- [ ] **`bge-mcp.service`: Upstreams auf den Proxy.** `Environment=LLM_RERANKER_URL` (Z. 54) und
      das zugehörige `LLM_EMBED_URL` auf `http://127.0.0.1:18235` setzen. Der Shim ruft
      unverändert `/v1/embeddings` und `/v1/rerank` — die Pfade stimmen bereits, nur die Basis
      ändert sich.

- [ ] **`bge-mcp.service`: Startbedingung auf den Proxy.** `ExecStart` (Z. 43) wartet heute per
      `/dev/tcp` erst auf `:8081`, dann auf `:8093`, bevor node startet — je bis zu 60 Sekunden.
      Diese doppelte Warteschleife durch **eine** auf `:18235` ersetzen. Damit startet `bge-mcp`
      auch ohne Cluster; das ist der dritte belegte Auslöser des Tickets, und er wird genau hier
      geschlossen, nicht durch das Routing.

- [ ] **Kommentarblock der Unit nachziehen.** Die Zeilen 23–40 beschreiben die alte Topologie
      („8093 → svc/llm-gateway-rerank") als Startvoraussetzung. Nach der Umstellung sind die
      Forwards zweites Kettenglied, keine Vorbedingung. Der Block wird umgeschrieben statt
      gelöscht: er hält fest, warum das ExecStart überhaupt wartet, und diese Begründung gilt
      weiter — nur das Ziel wechselt.

- [ ] **`openspec-embed-local.sh:50`: Default umstellen.**
      `EMBED_URL="${LLM_EMBED_URL:-http://127.0.0.1:8081}"` → `:18235`. Die Überschreibbarkeit
      per `LLM_EMBED_URL` bleibt, damit ein gezielter Direktzugriff weiter möglich ist.

- [ ] **`openspec-embed-local.sh:53-60`: Fehlertext berichtigen.** Er weist heute an, einen
      `kubectl port-forward` zu starten. Nach der Umstellung ist das der falsche Rat — die
      richtige Diagnose lautet dann „läuft der llm-proxy?" mit dem passenden `systemctl --user
      status llm-proxy.service`. Ein Fehlertext, der in die falsche Richtung schickt, kostet mehr
      Zeit als gar keiner; das ist derselbe Befund wie in `bge-mcp/server.mjs:100-103`.

- [ ] **Kopfkommentar Z. 15 nachziehen.** Dort steht `LLM_EMBED_URL: Default
      http://127.0.0.1:8081 — der kubectl port-forward`. Die Zeile beschreibt nach der Änderung
      etwas, das es nicht mehr gibt.

- [ ] **Forward-Units bewusst behalten.** `bge-forward-embed.service` und
      `bge-forward-rerank.service` werden **nicht** entfernt — sie sind das zweite Kettenglied.
      Ihr `--context fleet`-Pin bleibt unverändert; die Umgehung per Drop-in für lokale Cluster
      bleibt damit weiter möglich.

- [ ] **Gegenprobe auf ungewollte Reichweite.** `grep -rn 'LLM_EMBED_URL\|LLM_RERANKER_URL'` und
      sicherstellen, dass `environments/*.yaml`, `k3d/website.yaml` und
      `k3d/knowledge-ingest-cronjob.yaml` **unverändert** bleiben. Das sind In-Cluster-Konsumenten;
      ein Proxy auf dem WSL-Host ist für sie nicht erreichbar. Diese Trennung ist die Grenze des
      Tickets und der wahrscheinlichste Weg, sie versehentlich zu überschreiten.
