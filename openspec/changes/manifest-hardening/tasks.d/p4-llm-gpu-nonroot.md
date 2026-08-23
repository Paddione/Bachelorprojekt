---
title: "p4-llm-gpu-nonroot"
ticket_id: T014553
domains: [infra, security, llm]
status: active
---

# Partial p4 — LLM-GPU-Deployments auf Non-Root (GR-06)

Implementiert den llm-gpu-Teil von GR-06 aus
`openspec/changes/manifest-hardening/proposal.md`. Delta-Spec:
`specs/llm-pipeline.md`.

Ist-Zustand (`k3d/llm-gpu.yaml`): Deployments `bge-embed` (Pod-Spec-Zeile 75) und
`bge-rerank` (Zeile 229) haben jeweils nur `securityContext.fsGroup: 101`. Die
Init-Container `model-download` (curlimages/curl) laufen bereits als uid 100
(curl_user, gid 101). Containername des Servers in beiden Deployments: `llama-cpp`.

Design-Entscheidung: `runAsNonRoot: true` kommt auf Pod-Ebene (reine Prüfung,
kein UID-Override); die expliziten UIDs kommen auf Container-Ebene, weil ein
Pod-Level-`runAsUser` auch die Init-Container überschreiben würde und curl dann
seine gid-101-Semantik verliert.

### Task 1: bge-embed härten

**Files:** `k3d/llm-gpu.yaml`

Pod-Spec (bei bestehendem Block, Kommentar erhalten):

```yaml
      securityContext:
        runAsNonRoot: true
        fsGroup: 101
```

Init-Container `model-download` ergänzen:

```yaml
          securityContext:
            runAsNonRoot: true
            runAsUser: 100
            allowPrivilegeEscalation: false
```

Container `llama-cpp` ergänzen:

```yaml
          securityContext:
            runAsNonRoot: true
            runAsUser: 10001
            allowPrivilegeEscalation: false
```

Modell-Lesezugriff bleibt gegeben: `fsGroup: 101` gilt pod-weit und wird von
Kubernetes als Supplemental Group in jeden Container injiziert — llama-cpp als
uid 10001 liest `/models` über die Gruppe. Port ist unprivilegiert; GPU-Geräte-
Zugriff läuft über den NVIDIA-Container-Runtime-Cgroup-Mechanismus, nicht über
UIDs. Risiko (im Plan bewusst benannt): falls der Runtime-Pfad im Live-Cluster
doch root erfordert, scheitert der Pod beim Ausrollen — Rollback ist das simple
Entfernen der securityContext-Ergänzungen; Verifikation erfolgt live nach Deploy.

### Task 2: bge-rerank identisch härten

**Files:** `k3d/llm-gpu.yaml`

Identische Ergänzungen wie Task 1 am zweiten Deployment (`bge-rerank`, Pod-Spec
mit `fsGroup: 101` gegen Zeile 229, Init-Container `model-download`, Container
`llama-cpp`). Der vorhandene Kommentar zum fsGroup-Ursprung (CrashLoopBackOff
2026-08-02) bleibt unverändert stehen.

## Verify

```bash
task workspace:validate
```
