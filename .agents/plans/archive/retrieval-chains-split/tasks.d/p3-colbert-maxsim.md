# p3 — MaxSim als Cluster-Dienst

## Task 1: Deployment und Dienst anlegen

**Files:** `llm-retrieval-maxsim.yaml`

Neue Datei `k3d/llm-retrieval-maxsim.yaml` nach dem Muster von
`llm-retrieval-gpu.yaml` (Abschnitt `lfm-colbert`): Deployment
`colbert-maxsim` (CPU, kein GPU-Bedarf — die Einbettungen liefert
`llm-gateway-lfm-colbert`), Readiness auf `/health`, Strategie Recreate,
Image-Pin mit Digest (kein Rolling-Tag). Dazu Service
`llm-gateway-colbert-maxsim` auf Port 8081. Der Dienst übernimmt die
MaxSim-Logik aus `scripts/colbert_rerank.py` (Desktop-Stand) und dient
kanonisch `/v1/colbert/rerank` (kompatibel weiter `/v1/rerank`); Upstream
ist `http://llm-gateway-lfm-colbert:8081`, nie `127.0.0.1`.

Verify: `kubectl --context devmesh -n workspace get deploy,colsvc`
zeigt Deployment und Dienst; `curl` auf `/health` antwortet 200; ein
Probe-Rerank gegen Cluster-ColBERT liefert sortierte Ergebnisse.

## Task 2: Kustomization und gpu-Kommentar nachziehen

**Files:** `kustomization.yaml`, `llm-retrieval-gpu.yaml`

Die neue Manifestdatei in `k3d/kustomization.yaml` referenzieren
(S4-Orphan-Gate). Den Kopfkommentar in `k3d/llm-retrieval-gpu.yaml`
(`:8093` bleibt lokal, `:8097`-Weiterleitung) auf die neue Lage
umschreiben: MaxSim lebt im Cluster, Desktop-Dienste entfallen (siehe p4).

Verify: `task workspace:validate` grün; kein Verweis auf die neue Datei
fehlt (`grep` nach Dateiname in `kustomization.yaml` trifft).

Commit: `feat(infra): ColBERT-MaxSim als Cluster-Dienst`
