---
title: "p2-devmesh-registry — Tablet im llm-proxy des devmesh"
domains: [infra, llm]
status: draft
---

# pk-tablet-inference-followup — Implementation Plan

Partial p2. Kontext: `../design.md` (D1, D2, D4). Ziel-Dateien:
`dev-local/components/llm-services/tablet-endpoint.yaml` (neu),
`dev-local/components/llm-services/kustomization.yaml`,
`dev-local/components/llm-services/deployment.yaml`, `scripts/llm/loadouts.json`,
`devmesh/inventory.yaml`.

S1: nur YAML/JSON, kein S1-Limit.

## Task 1 — Service + EndpointSlice

`tablet-endpoint.yaml` nach dem Muster von `dev-local/core/gpu-endpoint.yaml`, aber mit
fester Adresse (kein render-stack-Platzhalter): Service `llm-gateway-tablet` ohne Selector,
Ports `rerank` 8080 und `embed` 8081 (TCP); EndpointSlice `llm-gateway-tablet` mit Label
`kubernetes.io/service-name: llm-gateway-tablet`, `addressType: IPv4`, Adresse
`100.94.91.65`, gleiche benannte Ports. Kopfkommentar: Tailnet-Gerät `pk-tablet-linux`,
Runbook-Verweis, Ausfall = Proxy fällt auf das nächste Kettenglied. In
`kustomization.yaml` unter `resources` eintragen.
Akzeptanz: `test_tablet_service_und_endpointslice` grün.

## Task 2 — Registry

In `LLM_PROXY_BACKENDS_JSON` (deployment.yaml) zwei Einträge ergänzen:
- `{"name":"tablet-rerank","kind":"llamacpp","baseUrl":"http://llm-gateway-tablet:8080","apiKeyEnv":null,"enabled":true,"priority":5,"fixups":[],"modelAliases":{},"maxInflight":2,"roles":["rerank"]}`
- `{"name":"tablet-embed","kind":"llamacpp","baseUrl":"http://llm-gateway-tablet:8081","apiKeyEnv":null,"enabled":true,"priority":15,"fixups":[],"modelAliases":{},"maxInflight":2,"roles":["embed"]}`
JSON bleibt einzeilig; mit `python3 -c 'import json,yaml,...'` validieren.
Akzeptanz: `test_rerank_kette_tablet_zuerst`, `test_embed_kette_cluster_zuerst_tablet_als_rueckfall` grün.

## Task 3 — Rückfall in loadouts.json

`roles.rerank.chain`: `http://192.168.100.12:8080` → `http://100.94.91.65:8080`;
`roles.embed.chain`: `http://100.94.91.65:8081` anhängen. Danach
`node scripts/llm/loadouts-format.mjs --write` und `--check`.
Akzeptanz: `test_loadouts_rueckfall_ohne_wireguard_adresse` grün.

## Task 4 — Inventar

`devmesh/inventory.yaml`: Peer `pk-tablet-linux` (`role: client`, `tag: null`,
`lan_ip: null`, `tailnet_name: pk-tablet-linux`) mit Kommentar (Ubuntu-Teil des Tablets,
Windows-Teil bleibt `pk-tablet`). Vorher prüfen, dass die Guards, die das Inventar lesen
(`git grep -l 'devmesh/inventory.yaml' tests/ scripts/`), einen Client-Peer ohne `k3s_role`
akzeptieren.

## Task 5 — Egress-Freigabe

In `tablet-endpoint.yaml` NetworkPolicy `allow-llm-tablet-egress`: podSelector `app: llm-services`, Egress zu `100.94.91.65/32` auf 8080/8081.
