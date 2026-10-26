---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-26
---

# pk-tablet-inference-followup — Design

## Symptome (Fakt) und Ursachen (belegt)

| Symptom | Ursache | Beleg |
|---|---|---|
| `llama-server@*` startet nicht, Exit 127 | `ubuntu-server-minimal` enthält kein `libgomp1` | Journal PK-Tablet 2026-10-26 03:11: `libgomp.so.1: cannot open shared object file` |
| WLAN-Latenz 100–300 ms, SSH-Timeouts | Powersave aktiv, `iw` fehlt im Minimal-Image | Ping vor/nach `iw dev wlp1s0 set power_save off`: 108–290 ms → 10–28 ms |
| `apply.sh --bootstrap` verlangt `--wg-conf`, ufw öffnet `wg0` | Entwurf setzte das WireGuard-Mesh voraus | ADR-014: `192.168.100.0/24` und `generate-wg-conf.sh` entfernt |
| Rerank-Rückfall zeigt auf `http://192.168.100.12:8080` | dasselbe, tote Mesh-Adresse | `scripts/llm/loadouts.json` roles.rerank |
| Tablet nicht in der aktiven Proxy-Registry | Migration ließ `pk-tablet-rerank` wegen damaliger ACL aus | `scripts/migrations/2026-09-16-devmesh-llm-proxy-backends.sql` Kopf; Policy erlaubt heute `*`→`*` |
| USB-NIC hängt unter Last, Hub-Resets (`err -110`) | RTL8153 hinter USB-C-Dock-Hub | dmesg-Foto 02:58; Offload-Abschaltung half nicht |

## Entscheidungen (User, 2026-10-26)

- D1 Rerank primär auf dem Tablet: Registry-Backend `tablet-rerank`, Priorität 5 (vor `cluster-rerank` 10).
- D2 Embedding primär im Cluster, Tablet als Rückfall: `tablet-embed`, Priorität 15 (zwischen `cluster-embed` 10 und `lmstudio` 20).
- D3 Embedding auf der GTX 970 von gpu-metal ist zurückgestellt (VRAM belegt durch `qwen35-4b-instruct`, parallele lfm-embed-Arbeit einer anderen Session).
- D4 Erreichbarkeit über Tailscale: Gerät `pk-tablet-linux`, Adresse `100.94.91.65`. Selector-loser Service `llm-gateway-tablet` + EndpointSlice nach dem Muster von `dev-local/core/gpu-endpoint.yaml`, Ports `rerank` 8080, `embed` 8081.
- D5 Betrieb über das eingebaute WLAN; der USB-Adapter dient nur dem PXE-Boot. WLAN-Zugangsdaten gehören nicht ins Repo.
- D6 Dual-Boot: Windows bleibt auf dem QLC-Teil (eigene ESP), Ubuntu auf dem Optane-Teil.
