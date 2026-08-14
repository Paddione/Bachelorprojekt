---
ticket_id: T006143
plan_ref: null
status: active
date: 2026-08-15
---

# Design: bge auf zwei Geräte verteilt — Rerank (PK-Tablet) und Embedding (PK-L-1) als Erstglieder

## Zweck

Die bge-Schicht (Embedding + Rerank) bekommt ihre Erstglieder vom Cluster-CPU-Betrieb auf zwei
lokale Geräte mit GPU-Beschleunigung (Vulkan): **Rerank läuft auf dem PK-Tablet**, **Embedding
auf PK-L-1**. Damit sind drei Operator-Ziele gleichzeitig bedient:

1. **VRAM-Budget:** Jedes Gerät (Intel Iris, 8 GB) trägt eine bge-Rolle (~0,64 GB Modell) und
   behält damit ~6,5 GB für ein Unterstützermodell neben der Gemma26-Familie, die auf dem
   Desktop (RTX 5070 Ti, 16 GB) praktisch den gesamten VRAM belegt.
2. **Host-Redundanz:** Die in T002426 offen als „eigener Vorgang" ausgewiesene Grenze — der
   Host-SPOF der bge-Schicht — wird aufgelöst: Embedding und Rerank verteilen sich auf zwei
   Geräte, der Cluster bleibt dauerhaft verfügbares Zweitglied.
3. **Kein dauerhafter bge-Prozess auf der Desktop-CPU:** Die User-Vorgabe vom 2026-08-14
   bleibt gültig; `bge-rerank-cpu` startet weiterhin nur on-demand als letztes Kettenglied.

Das Feintuning eines Unterstützermodells per Unsloth auf Factory-Traces ist **Folge-Ticket**
(die Pipeline existiert, T002587/T002606); ein Reranker-Finetuning ist bewusst out of scope.

## Ausgangslage (erhoben 2026-08-15)

- **Rollenketten** (`scripts/llm/loadouts.json`, SSOT): `embed → [http://127.0.0.1:8081
  (Cluster-Forward), http://127.0.0.1:1234 (LM Studio)]`, `rerank → [http://127.0.0.1:8093
  (Cluster-Forward), loadout:bge-rerank-cpu (:8096)]`. Mechanik: `scripts/llm-proxy/
  bge-routes.mjs` (Design `2026-08-10-bge-proxy-rollen-routen-design.md`, Vorgang 3/3 der
  LLM-Stack-Konsolidierung) — anfrage-getriebenes Failover, `x-llm-proxy-bge-upstream`-Header.
- **Cluster** (`k3d/llm-gpu.yaml`, T002551): `bge-embed`/`bge-rerank` CPU-only-Deployments
  (Q8_0, `-ngl 0`), Gateway-Services `llm-gateway-embed/-rerank:8081`, seit 12 Tagen live.
  Lokale Port-Forwards: `:8081` (embed), `:8093` (rerank, `scripts/bge-mcp/bge-forward-rerank.service`).
- **PK-L-1**: LM Studio 0.4.21, via LM Link aus WSL auf `127.0.0.1:1234` erreichbar; trägt
  bge heute als Backup-Glied (User-Vorgabe 2026-08-14: „bge läuft ausschließlich auf PK-L-1
  via LM Link").
- **Desktop-CPU-Loadouts**: `bge-embed-cpu` (`:8095`) und `bge-rerank-cpu` (`:8096`) sind
  `enabled: false` (Referenz bzw. letztes Rerank-Glied). Die Windows-Scheduled-Tasks unter
  `\Llama\` sind deaktiviert (T002729, XML-Backups liegen unter
  `C:\Users\PatrickKorczewski\llama-tasks-backup\`).
- **WireGuard-Mesh** (`wireguard/wg-mesh-nodes.yaml`): `192.168.100.0/24`; GPU-Host
  `wsl2-gpu-mentolder` (`.10`) ist drin, Home-NAT-Muster mit leerem Endpoint und
  `PersistentKeepalive` existiert (z. B. `dev-vm`). Die Laptops sind **nicht** im Mesh.
- **Recherche-Fakten (2026-08-15, WebSearch + Hub-API):** LM Studio hat **kein**
  `/v1/rerank` (nur chat/completions/embeddings) — Rerank muss als nativer `llama-server`
  laufen. LM Studio unterstützt Intel Iris über Vulkan, aber die iGPU ist seit 0.4.17
  standardmäßig **deaktiviert** und muss explizit aktiviert werden.
- **Modellgrößen (Hub-API, verifiziert):** `bge-m3-Q8_0.gguf` 0,63 GB,
  `bge-reranker-v2-m3-Q8_0.gguf` 0,64 GB (gpustack-Repos, identisch mit den Cluster-Pins).
  Kandidaten für die ~6,5 GB: Gemma-4-12B `UD-IQ3_XXS` 4,64 GB (unsloth), Qwen3.5-4B
  `Q6_K` ~3,3 GB (unsloth). Qwen3-Coder-8B hat **kein** offizielles GGUF-Repo.

## Zielbild

```
Desktop (RTX 5070 Ti, 16 GB)          PK-L-1 (Iris 8 GB)          PK-Tablet (Iris 8 GB)
├─ Gemma26-Familie (:8090–:8092)      ├─ LM Studio (Vulkan)       ├─ llama-server (Vulkan, Dienst)
├─ Unsloth Studio (:45013)            │   ├─ bge-m3 Embedding     │   └─ bge-reranker-v2-m3 :8080
├─ Finetuning (T002587 ff.)           │   └─ Unterstützermodell   ├─ LM Studio (Vulkan)
└─ bge-rerank-cpu (on-demand)         │       Qwen3.5-4B Q6_K     │   └─ Unterstützermodell
                                      └─ via LM Link → :1234      │       Gemma-4-12B UD-IQ3_XXS
                                                                  └─ via WG-Mesh (192.168.100.12)

Cluster fleet (unverändert): bge-embed / bge-rerank CPU-only-Deployments (T002551)
```

### Neue Rollenketten

| Rolle | Kette (neu) | heute |
|---|---|---|
| `embed` | `[http://127.0.0.1:1234 (LM Studio→PK-L-1), http://127.0.0.1:8081 (Cluster)]` | Cluster zuerst |
| `rerank` | `[http://192.168.100.12:8080 (PK-Tablet), http://127.0.0.1:8093 (Cluster), loadout:bge-rerank-cpu (Desktop-CPU)]` | Cluster zuerst |

## Entscheidungen

### E1 — Ansatz: Ketten-Umbau mit maximaler Wiederverwendung

Gegenprüft wurden drei Ansätze. Gewählt: **Ketten-Umbau pur** — kein Code-Change an
`bge-routes.mjs`, keine neue Mechanik. Verworfen: (a) Loadout-Fernsteuerung über WG/SSH
(on-demand-Start der Geräte-Server durch den Runner — akku-freundlich, aber Remote-Exec-Pfad,
Kaltstart im Erstglied, neue Testfläche) und (b) „alles llama-server" (einheitlicher Stack,
aber ersetzt die funktionierende LM-Link-Schiene und macht die LM-Studio-UI nutzlos). Der
gewählte Ansatz lässt Vertrag, Failover-Mechanik und Tests unangetastet — es ist
Konfiguration, Windows-Dienst und Mesh-Eintrag statt Code.

### E2 — Cluster bleibt Zweitglied (Variante A)

Die CPU-only-Deployments aus T002551 bleiben in Betrieb und rücken vom Erst- aufs
Zweitglied. Sie sind der einzige Always-on-Fallback: Schläft oder roamt das Tablet,
übernimmt der Cluster-Forward, ohne dass ein Prozess hochfahren muss. Entfernen der
Deployments (Umkehrung von T002551) wurde verworfen: der Kaltstart des Desktop-CPU-Loadouts
(10–30 s) läge dann im direkten Fehlerpfad.

### E3 — Transport: WireGuard-Mesh statt direktem LAN

Die Geräte werden als Mesh-Nodes angebunden (`pk-l-1` = `192.168.100.11`, `pk-tablet` =
`192.168.100.12`; beide IPs sind im Subnetz frei). LM Studio/LM Link bleibt der zweite,
unveränderte Weg für Embedding und Chat. Begründung gegen direktes LAN: DHCP-Drift und
Standby der Mobilgeräte machen die LAN-IP zu einem beweglichen Ziel; die Mesh-Adresse ist
stabil, funktioniert unterwegs, und die Mechanik (Registry, Sealed Keys,
`generate-wg-conf.sh`, Home-NAT-Muster) existiert bereits. Die Failover-Kette fängt
Mesh-Ausfälle ohnehin ab — das Mesh ist Robustheit, nicht Lebensader.

### E4 — Rerank läuft als nativer llama-server, nicht über LM Studio

LM Studio hat keinen `/v1/rerank`-Endpoint (Recherche-Fakt). Das Tablet bekommt daher einen
`llama-server.exe` (Windows-Build, Vulkan) mit `--reranking`. LM Studio bleibt auf dem
Tablet installiert und dient als Modell-Downloader (die GGUF liegt im LM-Studio-Modelldir,
der llama-server liest dieselbe Datei) und als Träger des Unterstützermodells.

### E5 — Unsloth-Finetuning zielt auf das Unterstützermodell

Die bestehende Pipeline (`scripts/finetune/`: `collect_factory_traces → measure_corpus →
template_guard → train → export_gguf`, Unsloth/TRL, Chat-Format) feintunt ein
Unterstützermodell auf Factory-Traces. Ein Reranker-/Embedder-Finetuning bräuchte einen
neuen Trainingsmodus (Cross-Encoder-Format) und ist out of scope — eigenes Ticket, falls
je gewollt.

### E6 — Modellwahl (Hub-verifizierte Größen)

| Gerät | Rolle | Modell | Quant | Größe |
|---|---|---|---|---|
| PK-Tablet | Rerank | `bge-reranker-v2-m3-Q8_0.gguf` (gpustack) | Q8_0 | 0,64 GB |
| PK-Tablet | Unterstützermodell | `gemma-4-12b-it-UD-IQ3_XXS.gguf` (unsloth) | UD-IQ3_XXS | 4,64 GB |
| PK-L-1 | Embedding | `bge-m3-Q8_0.gguf` (gpustack) | Q8_0 | 0,63 GB |
| PK-L-1 | Unterstützermodell | Qwen3.5-4B `Q6_K` (unsloth) | Q6_K | ~3,3 GB |

Summen: Tablet ~5,3 GB, PK-L-1 ~4 GB — innerhalb des 6,5-GB-Budgets inkl. KV-Headroom.
Gemma-4-12B ist ein Mini-Geschwister von Gemma26 (gleiche Familie, MTP-Drafter vorhanden);
Iris-TFLOPs lassen ~10 tok/s erwarten — ausreichend für Unterstützungsrollen, gemessen wird
in S2.

## Komponenten

### K1 — Tablet-Rerank-Dienst (Windows, PK-Tablet)

- `llama-server.exe` mit `--reranking`, Modell aus dem LM-Studio-Modelldir, Port **8080**.
- Flags gespiegelt von `k3d/llm-gpu.yaml` (bge-rerank: `-b 8192 -ub 8192`), aber mit
  GPU-Offload und `-np 2` — Iris-RAM ist geteilter Systemspeicher, Parallelität kostet
  direkt Budget.
- Start als **Scheduled Task** (At logon), Enable/Disable dokumentiert nach dem
  T002729-Muster; die deaktivierten Alt-Tasks unter `\Llama\` bleiben unangetastet.
- Firewall: Regel nur fürs WG-Interface bzw. das Mesh-Subnetz (Muster
  `scripts/llm/harden-gpu-firewall.ps1`, angepasst aufs Tablet).

### K2 — WireGuard-Anbindung

- Zwei Node-Einträge in `wireguard/wg-mesh-nodes.yaml`: `pk-l-1` (`.11`), `pk-tablet`
  (`.12`), Endpoint leer (Home-NAT, `PersistentKeepalive`), Schema-Keys `WG_MESH_PKL1` /
  `WG_MESH_PKT`.
- Private Keys als Sealed Secrets (Pfad wie `WG_MESH_WSL2_GPU`); Config aus der Registry
  generieren; auf den Geräten WireGuard für Windows.
- **Neue Betriebsfläche:** bisher sind nur Linux-Nodes im Mesh — Windows-Geräte werden
  hier erstmals aufgenommen; die Provisionierungsschritte gehören als eigener
  Aufgabenblock in den Plan.

### K3 — LM Studio auf beiden Geräten

- PK-Tablet per LM Link anbinden (wie PK-L-1 heute); auf **beiden** Geräten in den
  Hardware-Settings iGPU/Vulkan explizit aktivieren (seit 0.4.17 default-aus).
- Modellzuordnung: `bge-m3` → PK-L-1, Gemma-4-12B → PK-Tablet, Qwen3.5-4B → PK-L-1.
- `scripts/lm-studio/lmstudio-bge-autoload.sh` anpassen: Embed-Autoload unverändert;
  Rerank-Autoload-Versuche entfallen (LM Studio kann kein `/v1/rerank`).

### K4 — llm-proxy

- `roles`-Block in `scripts/llm/loadouts.json` wie im Zielbild — kein Code-Change.
- Unterstützermodelle werden über den bestehenden LM-Studio-Backend-Pfad (`:1234`) im
  llm-proxy sichtbar; Konsumenten (z. B. opencode-Subagenten) referenzieren sie über den
  llm-proxy (`:18235`) wie alle lokalen Modelle.

## Datenfluss & Fehlerbehandlung

- Anfrage → llm-proxy (`:18235/v1/embeddings` bzw. `/v1/rerank`) → Erstglied per
  Health-Check; fällt ein Glied aus (HTTP-Status ≠ 200 — T002574: Status statt
  curl-Exit-Code — oder Latenz-/Queue-Schwelle), übernimmt das nächste Glied;
  `x-llm-proxy-bge-upstream` dokumentiert das aktive Glied.
- Konsumenten unverändert: Website `rerank.ts` degradiert auf `score: 0` mit Warnlog;
  Brain/OpenSpec-Retrieve kennen den Vertrag, nicht die Topologie.
- Neue Fehlerflächen: Tablet offline/schlafend → Cluster übernimmt (kein Alert); Tablet
  hängt bei laufendem Prozess → bestehende Timeout-Schwelle; WG-Tunnel down → wie offline;
  beide Laptop-Glieder weg → Desktop-CPU-Loadout startet on-demand (letzte Instanz,
  Kaltstart 10–30 s).

## Testing

- Bestand: `bge-*.bats`, `llm-pipeline.bats`, `tests/spec/local-llm-proxy/*` bleiben grün
  (Ketten sind Daten, kein Code).
- Neu (Output-Verifikation, T002448-M4): Guard auf die `roles`-Reihenfolge in
  `loadouts.json` (embed: LM Studio vor Cluster; rerank: Tablet-URL vor Cluster vor
  Loadout); Guard auf die WG-Registry-Einträge (`pk-l-1`/`pk-tablet` mit erwarteten IPs);
  Live-Smoke gegen den Tablet-Endpoint über die bestehende `llm_endpoint_healthy`-Helper
  (Skip-Guard, wenn Gerät nicht erreichbar).
- Test-Inventory regenerieren (CI-Gate).

## Scope & Reihenfolge

- **S1 — Topologie-Umbau** (Kern dieses Design-Docs): K1–K4 plus Rollenketten.
- **S2 — Unterstützermodelle in Betrieb** (eigenes Ticket): LM-Studio-Zuordnung,
  llm-proxy-/opencode-Einträge, Vulkan-Performance-Messung auf Iris (die ~10 tok/s sind
  Annahme).
- **S3 — Unsloth-Finetuning** (eigenes Ticket, `finetune-run`-Skill, Pipeline existiert):
  Unterstützermodell auf Factory-Traces feintunen, GGUF exportieren, Stock-Modell auf dem
  Gerät ersetzen.
- **Out of scope:** Reranker-/Embedder-Finetuning (neuer Trainingsmodus).

## Risiken & offene Punkte

- **Vulkan-Performance auf Iris ist Annahme** — bge-Modelle sind klein genug, dass
  selbst mäßiger Offload den Cluster-CPU-Weg schlägt; gemessen wird in S2.
- **Neue Betriebsfläche Windows-Mesh-Nodes** — Provisionierung und Key-Verwaltung auf
  Windows-Geräten ist unerprobt; der Plan enthält dafür einen eigenen Aufgabenblock mit
  Verifikation.
- **LM Link + WG parallel** — zwei Verbindungen pro Gerät; kein Konflikt erwartet,
  Beobachtung während der Einführung.
- **Tablet-Akku** — der Dienst läuft dauerhaft (Ansatz 2 mit on-demand-Start wurde
  verworfen); bei Bedarf ist der Umstieg ein eigenes Ticket, kein Umbau des Vertrags.

## Referenzen

- Design `2026-08-10-bge-proxy-rollen-routen-design.md` (Vorgang 3/3 LLM-Stack-Konsolidierung)
- `openspec/specs/local-llm-proxy.md`, `openspec/specs/llm-pipeline.md` (SSOT)
- T002426 (bge-dual-pair-failover, Host-SPOF-Grenze), T002551 (Cluster-Migration),
  T002729 (Windows-Tasks), T002574 (curl-Exit-Code), T002835 (bge-OOM/-np),
  T003203/T003204 (Konsolidierung), T002587/T002606 (Finetuning-Pipeline)
- `scripts/finetune/README.md`, `scripts/llm-proxy/bge-routes.mjs`,
  `scripts/lm-studio/lmstudio-bge-autoload.sh`, `wireguard/wg-mesh-nodes.yaml`
