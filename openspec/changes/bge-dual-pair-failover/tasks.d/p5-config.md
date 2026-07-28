# p5 — Environment-Variablen, Schema und Cluster-Services

**Rolle:** impl · **depends_on:** p1 · **target_files:**
`environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`,
`environments/korczewski.yaml`, `environments/staging.yaml`, `environments/fleet-mentolder.yaml`,
`environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml`

## Ziel

Die Adressen beider Paare als Environment-Variablen führen, sodass der Router aus p2 sie liest
statt sie hartzukodieren — und die Cluster-Services so ergänzen, dass Pods das Batch-Paar
erreichen.

## Vorgaben

- **`environments/schema.yaml` ist die maßgebliche Liste.** Jede neue Variable wird dort
  eingetragen; `env:validate` läuft fail-closed gegen diese Datei. Eine Variable, die nur in
  einem Brand-YAML steht, fällt beim Validieren durch.
- **Bestandsnamen als Muster.** Heute existieren `LLM_EMBED_URL`, `LLM_RERANKER_URL`,
  `LLM_EMBED_MODEL`, `LLM_RERANK_ENABLED`, `LLM_HOST_IP`. Die neuen Variablen für das Batch-Paar
  folgen derselben Benennung, damit `env-resolve.sh` und die bestehenden Konsumenten nicht
  umgelernt werden müssen.
- **Alle sieben Environment-Dateien werden gepflegt**, nicht nur `dev.yaml`. Ein fehlender
  Eintrag in einem Brand-YAML fällt erst im Prod-Deploy auf.
- **Keine Brand-Domain-Literale.** Hostnamen kommen aus `k3d/configmap-domains.yaml`, nicht als
  Klartext in Manifest oder Environment.
- **`k3d/llm-gpu.yaml`** bekommt die Gateway-Services für die Ports 8085/8086 analog zu den
  bestehenden Einträgen für 8095/8096, damit Cluster-Pods das Batch-Paar über den
  `svc.cluster.local`-Namen erreichen.
- **Die Requirement „LLM_HOST_IP Required When LLM_ENABLED" gilt weiter.** Das Batch-Paar läuft
  auf demselben Host; es entsteht keine zweite Host-Variable.

## Schritte

- [x] Neue Variablen für Embedding- und Rerank-Endpunkt des Batch-Paars in
      `environments/schema.yaml` eintragen, mit Beschreibung und Pflichtstatus.
- [x] Werte in allen sieben Environment-Dateien ergänzen: `dev.yaml`, `mentolder.yaml`,
      `korczewski.yaml`, `staging.yaml`, `fleet-mentolder.yaml`, `fleet-korczewski.yaml`.
- [x] Variablen für die Überlast-Schwellen des Routers ergänzen (Latenzgrenze und
      Queue-Sättigung), damit p2 sie nicht hartkodieren muss.
- [x] `k3d/llm-gpu.yaml` um die beiden Gateway-Services für 8085/8086 erweitern.
- [x] `task env:validate` ausführen und grün bekommen.

## Abgrenzung

Keine Änderung an Startskripten, Router, API-Endpunkten oder MCP-Registrierung. Die Ports werden
hier nicht festgelegt, sondern aus p1 übernommen — 8085 Embedding, 8086 Rerank.
