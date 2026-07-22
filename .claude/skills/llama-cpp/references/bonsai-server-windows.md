# Bonsai-Server (Windows) — repo-spezifische llama.cpp-Referenz

Ternary-Bonsai-27B läuft als OpenAI-kompatibler `llama-server` auf dem Windows-Host
(nicht in k8s). Er ist das physische Substrat der parallelen Partialplan-Pipeline
(T002074): Implement- und Review-Partials routen auf dieses Modell.

> Das Server-Setup ist bereits erledigt (2026-07-22). Diese Referenz dokumentiert
> nur Zugriff, Health-Checks und die Slot-Budget-Konvention — sie richtet nichts ein.

## Zugriff (aus WSL)

Der Server läuft auf dem Windows-Host; aus WSL via `powershell.exe` steuerbar.
Reboot/Neustart des Servers:

```bash
powershell.exe -NoProfile -File 'C:\Users\PatrickKorczewski\.lmstudio\start-bonsai-server.ps1'
```

Das PS1-Skript entfernt den Vision-Tower (`--mmproj`), setzt `-c 262144` (voller
kv-Pool, `--kv-unified`) und `-np 4` (Slot-Parallelität). Log-Pfade schreibt das
Skript neben sich ins `.lmstudio`-Verzeichnis (`start-bonsai-server*.log`).

## Port & Base-URL

- Port `8093`, OpenAI-kompatibel.
- Base-URL: `http://127.0.0.1:8093/v1`
- `networkingMode=mirrored` (WSL teilt den Windows-Netzstack) → der Windows-Listener
  ist direkt auf WSL-`localhost` erreichbar.

## Health-/Props-Checks

```bash
curl -s http://127.0.0.1:8093/health
curl -s http://127.0.0.1:8093/props | jq '.default_generation_settings.n_ctx'   # erwartet: 262144
```

## Slot-Budget-Konvention (Design Entscheidung 5)

`-np 4` am Server = **3 Factory-Worker + 1 Orchestrator**:

- Die 3 Worker sind der Factory-DB-Pool (`FACTORY_SLOTS_PER_BRAND=3`,
  `provider_config.max_concurrent=3`).
- Der 4. Slot bleibt dem Orchestrator (opencode-Hauptsession: Scout/Decompose/
  Eskalation) vorbehalten, damit er nicht mit den Workern um Slots konkurriert.

Registrierung der DB-Provider-Zeilen (idempotent, beide Brands):

```bash
bash scripts/factory/provider-register-bonsai.sh
```

Das Skript upsertet `tickets.provider_config` (`factory-implement`/`factory-review`
→ `llamacpp @ http://127.0.0.1:8093/v1`, `max_concurrent=3`) und pinnt
`tickets.factory_model_slots` für `implement`/`verify`. `route-provider.sh` bevorzugt
`factory_model_slots` (phase-pin) vor `provider_config` — kein weiterer Code-Eingriff.

## Risiko: kv-unified-Kontention

Vier gleichzeitig sehr lange Sequenzen drosseln die effektive Kontextlänge pro Slot
(gemeinsamer 262k-Pool). Das 3+1-Slot-Budget mildert das; bei ~37k-Factory-Prompts
mit 4 parallelen Läufen ist die effektive Länge pro Slot der begrenzende Faktor.
