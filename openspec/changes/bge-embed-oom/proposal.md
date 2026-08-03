# bge-embed-oom — Proposal

## Problem

Der `bge-embed`-Container (llama.cpp-Server, Modell `bge-m3-Q8_0.gguf`) läuft
wiederholt in `OOMKilled` und startet neu. Das Deployment `k3d/llm-gpu.yaml`
setzt `limits.memory: 2Gi` bei `requests.memory: 1Gi`. Der Server ist mit
`-b 8192 -ub 8192 -np 4 --embeddings` konfiguriert: vier parallele Slots à
Batch-Größe 8192 Tokens. Unter Batch-Last (64 Embeddings) übersteigt die
RSS-Verbrauchsspitze offenbar das 2Gi-Limit → OOMKilled → Restart-Schleife.

Warum jetzt: T002572 (Benchmark) braucht stabile Latenz-/Durchsatzwerte —
Restart-Schleifen verfälschen jede Messung.

## Lösung

1. **Messen statt raten:** Peak-RSS unter realer 64er-Batch-Last via
   `kubectl top pod --containers` erfassen.
2. **Limit begründet anheben:** `limits.memory` auf
   `max(3Gi, Peak + 1Gi Headroom)` setzen. Damit bleibt `-np 4 -ub 8192`
   (Durchsatz für den Benchmark) erhalten. Nur wenn der gemessene Peak mit
   vier Slots über 3Gi liegt, werden zusätzlich `-np 2`/`-ub 4096` gesenkt —
   dies wird explizit dokumentiert, nicht stillschweigend gewählt.
3. **Guard-Test:** Die gewählte Kombination (Kommentar + Limit + Args) wird in
   `tests/spec/llm-pipeline.bats` statisch gegen das Manifest abgesichert —
   damit kann eine künftige Senkung des Limits oder eine arglose Änderung der
   Batch-Parameter nicht unbemerkt durchrutschen.

## Verworfen

- **Nur `-np` senken, Limit lassen:** schränkt den Durchsatz dauerhaft ein,
  obwohl die Nodes (T002551) genug RAM haben — das Limit ist die falsche
  Stellschraube, wenn der Bedarf real ist.
- **Nur CPU/Requests anpassen:** adressiert das OOM-Problem nicht (RSS hängt
  an Kontext-/Batch-Puffer, nicht an CPU-Requests).
- **Bench-Skript (T002572) vorziehen:** wäre Scope-Creep in ein gehaltenes
  Ticket.

## Erfolgskriterium

`bge-embed` übersteht eine 64er-Batch-Last ohne OOMKilled; der Guard-Test
dokumentiert Limit + Batch-Parameter; `kubectl get pods` zeigt keine
`OOMKilled`-Events mehr in `kubectl get events --field-selector reason=OOMKilled`.
