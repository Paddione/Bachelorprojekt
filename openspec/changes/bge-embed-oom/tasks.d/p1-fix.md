# Partial p1 — Messung & Manifest-Fix

## Scope

Alle Infrastruktur-Änderungen für den bge-embed-OOM-Fix in einem Schritt:
Peak-RSS unter Batch-Last messen, Memory-Limit begründet anheben (nur falls
nötig `-np`/`-ub` senken) und im Manifest dokumentieren.

## Task List

### 1. Peak-RSS unter Batch-Last messen

- [ ] **1.1** Pod identifizieren:
      `kubectl --context fleet -n workspace get pods -l app=bge-embed -o name`
      (bei unklarem Label: `kubectl --context fleet -n workspace get pods -o name | grep bge-embed`)
- [ ] **1.2** Batch-Last erzeugen: Service lokal tunneln
      (`kubectl --context fleet -n workspace port-forward svc/bge-embed 8081:8081`),
      dann 64 Embedding-Requests à ~200 Zeichen Text an `http://localhost:8081/embedding`
      feuern (kleine Schleife mit `curl` im Terminal: 64 Iterationen, jeweils
      `POST /embedding` mit `{"content": "<variabler Text>"}`). Ein 200er pro
      Request gilt als Erfolg, Fehler werden protokolliert, nicht abgebrochen.
- [ ] **1.3** Während der Last laufend messen:
      `kubectl --context fleet -n workspace top pod <pod> --containers`
      und den höchsten beobachteten RSS-Wert des `llama-cpp`-Containers notieren.

### 2. Entscheidung + Manifest-Änderung (`k3d/llm-gpu.yaml`)

- [ ] **2.1** Entscheidungsregel anwenden:
      - Peak-RSS ≤ 1.5Gi → `-np 4 -ub 8192` beibehalten, `limits.memory` auf
        `3Gi` anheben (Headroom für parallele Requests; konsistent mit den
        CPU-Nodes aus T002551).
      - Peak-RSS > 1.5Gi → zusätzlich `-np` auf `2` und `-ub` auf `4096` senken.
      - Das Memory-Limit wird immer auf `max(3Gi, Peak-RSS + 1Gi)` gesetzt.
- [ ] **2.2** Im `bge-embed`-Container (ca. Zeilen 100–112) `limits.memory`
      auf den gewählten Wert ändern. `requests.memory` (1Gi), CPU-Werte und
      `-ngl 0` unverändert lassen.
- [ ] **2.3** Direkt über dem `resources:`-Block des `bge-embed`-Containers
      einen Kommentar einfügen, der die Messung dokumentiert, z.B.:
      `# bge-embed peak RSS <WERT> (64er-Batch, -np 4 -ub 8192) → limit <WERT>`
      — Datum und gemessener Wert gehören in den Kommentar.
- [ ] **2.4** Validieren: `task workspace:validate` (Kustomize-Dry-Run) — muss
      ohne Fehler durchlaufen. `bge-rerank` dabei nur beobachten (kleineres
      Q4-Modell, kein OOM-Befund), nicht ändern.

### 3. Keine weiteren Änderungen

- [ ] **3.1** Keine Änderung an `scripts/llm/start-gemma-server.ps1`, an
      `tests/spec/llm-pipeline.bats` (gehört zu p2) oder an
      `website/src/lib/bge-router.ts`.
