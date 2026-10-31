---
title: Gemessenen CPU- und Vulkan-Pool fuer EmbeddingGemma bereitstellen
domains: [infra, embeddings]
status: staged
---
# embeddinggemma-hybrid-vulkan — Implementation Plan

## File Structure

| Datei | Aenderung |
|---|---|
| `k3d/llm-gemma-igpu.yaml` | Neuer gepinnter Vulkan-Worker mit Intel-Device-Plugin-Ressource und beschreibbarem Cache |
| `k3d/kustomization.yaml` | Vulkan-Manifest geparkt registrieren |
| `dev-local/core/kustomization.yaml` | Vulkan-Ressource und devmesh-Patch referenzieren |
| `dev-local/core/gemma-hybrid.yaml` | Nur devmesh: CPU kalibrieren, iGPU aktivieren, beide Worker an RWO-Node binden |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_bge_bulk_pool.py` | Rendering-Vertrag fuer Hybrid-Pool erweitern |
| `docs/runbooks/embeddinggemma-hybrid.md` | Betrieb, Messgrenzen und Rollback |

## Entscheidungen

Der Nutzer hat die Empfehlung CPU plus Vulkan und anschliessende getrennte
Fine-Tuning-Evaluation angenommen. Die Implementierung aendert keine Gewichte.
Messbasis ist `/tmp/hd530-calibration-20261027/summary.json`: auf gpu-cluster2
1,258 Dokumente/s im 60-Sekunden-Hybridtest bei etwa 508 Tokens und 2,2 CPU-Kernen.
Ein Service verteilt Verbindungen; diese Messung ist keine Durchsatzgarantie.

Nur auf devmesh werden CPU und iGPU auf gpu-cluster2 gemeinsam an den vorhandenen RWO-PVC
gebunden. Der immutable CPU-Deployment-Selektor bleibt unveraendert; der neue
Worker verwendet den etablierten Bulk-Ansatz mit eigenem Pool-Selektor.
Das bereits laufende Intel-Device-Plugin ist Voraussetzung, wird nicht ersetzt.
Die gemeinsame k3d-Basis parkt die iGPU bei null Replikaten; dev-local/core
aktiviert sie. Auch CPU-Argumente und Speicherlimits bleiben in der
Basis unveraendert und werden nur im devmesh-Patch kalibriert. Der devmesh-Renderer konsumiert dieses Profil direkt und nicht
k3d/kustomization.yaml; beide Ressourcenlisten muessen deshalb referenzieren.

S1: Die bestehenden YAML-Dateien und Markdown sind nicht zeilenbegrenzt.
Der bestehende pytest-Test umfasst 187 Zeilen, ist nicht baselined und hat
gegen das 800-Zeilen-Limit ein Budget von 613 Zeilen. Keine neuen any-Typen,
Importzyklen, Brand-Domain-Literale oder Baseline-Eintraege.

## Task 1: Rendering-Vertrag rot bestaetigen

- [ ] Bestehenden pytest-Test um GPU-Ressource, Pins, Sicherheit, Cache,
  Speicher, Service-Mitgliedschaft und identische RWO-Platzierung erweitern.
- [ ] `python3 -m pytest tests/py/spec/native_ported/spec/llm-pipeline/test_bge_bulk_pool.py -q`
  gegen die unveraenderten Manifeste ausfuehren: expected: FAIL fuer neue Hybrid-Assertions.

## Task 2: Hybrid-Profil und Runbook implementieren

- [ ] CPU mit `--device none --no-op-offload --no-kv-offload`, einem Slot,
  2048 Kontext und 2Gi Limit konfigurieren; bestehende Image-Unterstuetzung
  wurde mit dem produktiven `llama-server --help` bestaetigt.
- [ ] Vulkan-Image per Digest pinnen, `gpu.intel.com/i915: 1`, UID/GID 10001,
  Cache unter `/tmp`, 1Gi RAM-Request und 2Gi Limit setzen. Keine Privilegien
  oder HostPath-Freigabe hinzufuegen.
- [ ] Beide Worker nur im devmesh-Patch auf gpu-cluster2 setzen, bestehende Modelldatei und Service
  erhalten; neues Manifest in der Kustomization referenzieren.
- [ ] Runbook nennt Readiness, Vektordimension, Slot-/UMA-Grenzen, Durchsatz-
  Einschraenkung, getrennten CPU-Fallback und GitOps-Rollback.

## Task 3: Finale Verifikation

- [ ] Gezielten pytest-Test erneut ausfuehren: expected: PASS.
- [ ] `task workspace:validate` und `./tests/runner.sh local SA-01` ausfuehren.
- [ ] `task test:inventory`, `task test:changed` und `task freshness:regenerate`
  ausfuehren; generierte Artefakte gezielt committen.
- [ ] `task freshness:check`, `git diff --check` und
  `python3 /home/patrick/scripts/agent-workspace.py check` bestaetigen.
- [ ] Implementierung und Befunde als PR liefern. Root uebernimmt Merge,
  30-Minuten-Stabilitaetsgate und Live-Rollout; kein vorzeitiges Live-Apply.
