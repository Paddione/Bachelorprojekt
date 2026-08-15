# local-llm-proxy — Delta-Spec

## Purpose

T006143 (S1 Topologie-Umbau): Die bge-Rollenketten führen künftig die GPU-beschleunigten
Laptop-/Tablet-Upstreams als Erstglieder — `embed` → LM Studio auf PK-L-1 (`:1234`) vor dem
Cluster-Forward, `rerank` → llama-server auf dem PK-Tablet (`192.168.100.12:8080`, WireGuard-Mesh)
vor dem Cluster-Forward vor dem on-demand Desktop-CPU-Loadout. Der SSOT-Satz „shipped default
puts the local CPU loadout first" wird ersetzt; Failover-Mechanik, Vertrag und
`bge-routes.mjs` bleiben unverändert (E1/E2 des Design-Docs).

## MODIFIED Requirements

### Requirement: bge reaches the proxy through role-based routes

| | Before | After |
|---|---|---|
| Chain order (shipped default) | the shipped default puts the local CPU loadout first and the cluster port-forward second | the shipped default puts the GPU-enabled laptop/tablet upstreams first: `embed` → `[http://127.0.0.1:1234 (LM Studio on PK-L-1), http://127.0.0.1:8081 (cluster port-forward)]`; `rerank` → `[http://192.168.100.12:8080 (llama-server on PK-Tablet), http://127.0.0.1:8093 (cluster port-forward), loadout:bge-rerank-cpu]` — the cluster remains the always-on second link, the on-demand desktop CPU loadout stays last |

#### Scenario: The shipped default chains put the laptop upstreams first

- **GIVEN** the shipped default role chains in `scripts/llm/loadouts.json`
- **WHEN** they are read for the roles `embed` and `rerank`
- **THEN** the `embed` chain leads with `http://127.0.0.1:1234` (LM Studio on PK-L-1) and the
  `rerank` chain leads with `http://192.168.100.12:8080` (llama-server on PK-Tablet), each
  followed by its cluster port-forward link, with the on-demand desktop CPU loadout last in the
  `rerank` chain

## ADDED Requirements

### Requirement: Laptop bge upstreams are WireGuard mesh nodes

The system SHALL register the two laptop bge upstream hosts as WireGuard mesh nodes: `pk-l-1`
at `192.168.100.11` (embed, LM Studio via LM Link) and `pk-tablet` at `192.168.100.12` (rerank,
llama-server). Both SHALL use the home-NAT pattern (empty endpoint, outbound initiation,
PersistentKeepalive); their private keys SHALL be provisioned as sealed secrets following the
`WG_MESH_WSL2_GPU_*` pattern, with schema keys `WG_MESH_PKL1_*` / `WG_MESH_PKT_*`.

#### Scenario: The mesh registry lists both laptops with fixed wg_ips

- **GIVEN** the WireGuard mesh registry `wireguard/wg-mesh-nodes.yaml`
- **WHEN** it is read
- **THEN** it contains node `pk-l-1` with `wg_ip` `192.168.100.11` and node `pk-tablet` with
  `wg_ip` `192.168.100.12`, both with an empty endpoint

### Requirement: Tablet rerank runs as a native llama-server on port 8080

The system SHALL provide `scripts/llm/start-tablet-rerank.ps1` (pure ASCII, no BOM) that starts
`llama-server.exe` with `--reranking` on port 8080 serving `bge-reranker-v2-m3-Q8_0.gguf` from the
LM Studio model directory, with Vulkan GPU offload (`-ngl`) and cluster-mirrored flags
(`-b 8192 -ub 8192 -np 2`). Rerank SHALL NOT run through LM Studio (no `/v1/rerank` endpoint).

#### Scenario: The start script carries the rerank contract

- **GIVEN** the tablet service script `scripts/llm/start-tablet-rerank.ps1`
- **WHEN** it is inspected
- **THEN** it references `--reranking`, port `8080`, the model file and the LM Studio model
  directory

### Requirement: bge-m3 autoload is bound to PK-L-1

The system SHALL keep the bge-m3 embed model resident on PK-L-1 only: when the `lms` CLI exposes
a device flag, `scripts/lm-studio/lmstudio-bge-autoload.sh` SHALL pin the load to the PK-L-1
device; otherwise the script header SHALL document the device-neutrality constraint (load on
PK-L-1, never on PK-Tablet).

#### Scenario: Autoload target is unambiguous

- **GIVEN** `scripts/lm-studio/lmstudio-bge-autoload.sh`
- **WHEN** it is inspected
- **THEN** it either pins the bge-m3 load to PK-L-1 via a device flag or documents the
  device-neutrality constraint in its header
