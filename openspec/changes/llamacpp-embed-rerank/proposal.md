# Proposal: llamacpp-embed-rerank

## Why

Die Embedding- und Rerank-Schicht der Plattform ist in einen Zustand gedriftet, den niemand so
entworfen hat und den niemand bemerkt hat:

- `bge-m3` läuft als TEI-Docker-Container auf **CPU mit float32** — auf einem Host mit einer
  RTX 5070 Ti, von der 9075 MiB ungenutzt frei sind.
- `bge-reranker-v2-m3` läuft **überhaupt nicht**. `tei-rerank.service` ist tot, `:9083` antwortet
  nicht, während `LLM_RERANK_ENABLED=true` gesetzt bleibt.
- Der Ausfall blieb unbemerkt, weil `website/src/lib/rerank.ts` jeden Fehler verschluckt und
  stillschweigend `score: 0` für alle Dokumente liefert. Die Suche funktioniert weiter, nur ohne
  Reranking — und nichts im System meldet das.
- LM Studio auf `:1234` existiert nicht mehr, `lmstudio-socat.service` forwarded seit unbekannter
  Zeit ins Leere, und `environments/*.yaml` verweist weiterhin auf diesen toten Endpunkt.
- Es existiert **kein Autostart** für irgendeinen LLM-Server auf dem Host: kein Scheduled Task,
  kein Dienst, kein Startskript. Der laufende Bonsai-Server ist ein handgestarteter Prozess.

Die gemeinsame Ursache ist Kettenlänge ohne Beobachtbarkeit: `Docker → socat → K8s-Endpoint`, an
jedem Glied ein stiller Ausfallpunkt, am Ende ein Client, der Fehler verschluckt.

## What

Beide Modelle werden als bereits vorhandene Q8_0-GGUFs auf zwei persistente
`llama-server`-Instanzen mit GPU-Offload überführt (`:8095` Embedding, `:8096` Reranking, beide
`0.0.0.0`, direkt über wg-gpu erreichbar). Die gesamte Docker-plus-socat-Zwischenschicht entfällt.

- **Persistenz:** versionierte PS1-Startskripte unter `scripts/llm/` plus Registrierung als
  Windows Scheduled Task (`At system startup`, `RunAs SYSTEM`, Restart-on-failure) — auch für den
  bisher ungeschützten Bonsai-Server. `LLM_EMBED_NGL=0` als bewusster VRAM-Notausstieg auf CPU-RAM.
- **Vektor-Äquivalenz als Gate:** float32-ONNX → Q8_0-GGUF ist nicht vektor-neutral. Vor dem
  Cutover wird die mittlere Kosinus-Ähnlichkeit gegen den alten TEI-Endpunkt gemessen; **≥ 0.99**
  erlaubt den Cutover, darunter endet der Change mit dem Messergebnis und einem Folgeticket für
  den pgvector-Reindex. Der alte TEI-Container wird erst nach bestandener Messung abgeschaltet.
- **`rerank.ts` auf llama.cpp-Dialekt:** `POST /v1/rerank` mit `{model, query, documents}`,
  Antwort `{results:[{index, relevance_score}]}`. Damit deckt sich die Implementierung erstmals
  mit dem, was der SSOT-Spec ohnehin schon beschreibt. Graceful Degradation bleibt, wird aber
  über `logger.warn` sichtbar.
- **Vierter Subagenten-Slot:** Der Bonsai-Server geht von `-np 1` auf `-np 4`. Da llama.cpp `-c`
  auf die Slots aufteilt, wird `-c` mitangehoben — der Zielwert wird gemessen, nicht geschätzt.
- **Aufräumen:** tote LM-Studio- und TEI-Pfade aus `environments/*.yaml`, `environments/schema.yaml`
  und `k3d/llm-gpu.yaml`.

**Abhängigkeit:** T002109 (`fix/k3d-dev-llm-bridge`, `in_review`) ändert dieselben Dateien und
stellt dev auf wg-mesh um, worauf dieser Change aufbaut — Execute erst nach dessen Merge.

**Out of scope:** pgvector-Reindex (Folgeticket), `llm-proxy`-Bind-Änderung, Ablösung des
Bonsai-Modells selbst, `nomic-embed-text-v1.5` (kein GGUF im Bestand, kein aktiver Consumer).

_Ticket: T002110_
