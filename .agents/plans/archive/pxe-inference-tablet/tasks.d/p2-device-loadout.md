---
title: "p2-device-loadout — Geräte-Loadout und Apply vom Dev-Rechner"
domains: [infra, llm]
status: draft
---

# pxe-inference-tablet — Implementation Plan

Partial p2. Kontext: `../design.md` (D2, D3, D5, Gerätelayout). Ziel-Dateien:
`devmesh/pk-tablet/loadouts.json`, `devmesh/pk-tablet/models.json`,
`devmesh/pk-tablet/llama-build`, `scripts/llm/pk-tablet/render.mjs`,
`scripts/llm/pk-tablet/apply.sh`, `scripts/llm/pk-tablet/run-loadout.sh`,
`scripts/llm/pk-tablet/llama-server@.service`,
`scripts/llm/pk-tablet/cpu-performance.service`, `taskfiles/Taskfile.llm.yml`.

S1: alle Skripte neu; Limits `.mjs` 800, `.sh` 800. Zielgröße je Datei
< 250 Zeilen. `Taskfile.llm.yml` (YAML) hat kein S1-Limit.

## Task 1 — Geräte-Loadout `devmesh/pk-tablet/loadouts.json`

Schema v1 wie `scripts/llm/loadouts.json`; muss `parseLoadouts()` bestehen
und in kanonischer Form vorliegen (`node scripts/llm/loadouts-format.mjs --check devmesh/pk-tablet/loadouts.json`).

- `modelRoots: ["/var/lib/llama/models"]`, `defaults: {host: "0.0.0.0"}`
- Loadout `qwen35-9b-chat`: `model` `unsloth/Qwen3.5-9B-GGUF/Qwen3.5-9B-Q4_K_M.gguf`,
  `port` 1234, `enabled` true, `fit.enabled` false, `args`: `ctx` 32768,
  `ngl` 99, `parallel` 1, `cacheTypeK`/`cacheTypeV` `q4_0`,
  `flashAttention` true, `jinja` true; `extraArgs`:
  `["--alias", "qwen35-9b-chat", "--chat-template-kwargs", "{\"enable_thinking\":false}"]`
  (Werte aus `scripts/llm/pk-devices/pk-tablet-startup.ps1`).
- Loadout `bge-rerank`: `model` `gpustack/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-Q8_0.gguf`,
  `port` 8080, `enabled` true, `fit.enabled` false, `args`: `ngl` 99,
  `parallel` 2; `extraArgs` `["--reranking", "-b", "8192", "-ub", "8192"]`
  (Werte aus `scripts/llm/start-tablet-rerank.ps1`).
- Kein `roles`-Block (die Kette lebt in `scripts/llm/loadouts.json`).

## Task 2 — `devmesh/pk-tablet/models.json` und `llama-build`

- `models.json`: Objekt `{ "<model-relpfad>": { "url": "...", "sha256": "..." } }`
  für beide Modelle. URL-Form `https://huggingface.co/<owner>/<repo>/resolve/main/<datei>`.
  sha256 aus dem HF-LFS-Zeiger ermitteln (z. B. `curl -sI <url>` →
  `x-linked-etag`, oder hf-mcp `hub_repo_details`) und den Befehl im
  Commit-Text notieren (Mess-Konvention T002717).
- `llama-build`: eine Zeile `b11561` (gleicher Build wie `k3d/llm-gpu.yaml`).
  Vor dem Commit prüfen, dass das Release-Asset
  `llama-b11561-bin-ubuntu-vulkan-x64.zip` existiert
  (`gh release view b11561 -R ggml-org/llama.cpp --json assets -q '.assets[].name' | grep ubuntu-vulkan`);
  fehlt es, den nächsten Build mit diesem Asset nehmen und den Grund in
  einer Kommentarzeile darunter notieren.

## Task 3 — `scripts/llm/pk-tablet/render.mjs`

Reine Render-Stufe, kein SSH. Aufruf:
`node scripts/llm/pk-tablet/render.mjs [--loadouts <pfad>] [--models <pfad>] --out <dir>`
(Defaults: die Dateien aus Task 1/2).

- `readLoadouts(path)` aus `scripts/llm-proxy/loadouts.mjs`, `isLoadoutEnabled()`.
- Je aktivem Loadout: `buildServerArgv(l, path.posix.join(doc.modelRoots[0], l.model), doc.defaults)`
  aus `scripts/llm-proxy/runner.mjs` → `<out>/<slug>.argv`, ein Argument je Zeile.
  Enthält ein Argument `\n`, Abbruch mit Exit 1 und Slug im Text.
- `<out>/enabled.list`: aktive Slugs, eine Zeile je Slug, sortiert.
- `<out>/ports.list`: `<slug> <port>` je aktivem Loadout.
- `<out>/models.list`: `<relpfad> <sha256> <url>` je von aktiven Loadouts
  referenziertem Modell; fehlt ein Eintrag in `models.json` → Exit 1 mit
  Modellpfad im Text.
- stdout: Zusammenfassung (`render: <n> loadouts aktiv: <slugs>`).

## Task 4 — Geräteseitige Dateien

- `run-loadout.sh`: `#!/usr/bin/env bash`, `set -euo pipefail`;
  `mapfile -t argv < "/etc/llama/$1.argv"`; `exec /opt/llama/current/llama-server "${argv[@]}"`.
  Fehlende Datei → Exit 1 mit Pfad.
- `llama-server@.service`: `ExecStart=/opt/llama/run-loadout.sh %i`,
  `User=llama`, `Group=llama`, `SupplementaryGroups=render video`,
  `Restart=on-failure`, `RestartSec=5`, `Environment=LD_LIBRARY_PATH=/opt/llama/current`,
  `WantedBy=multi-user.target`.
- `cpu-performance.service`: oneshot, schreibt `performance` in
  `/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor` (fehlende Dateien
  tolerieren), `WantedBy=multi-user.target`.

## Task 5 — `scripts/llm/pk-tablet/apply.sh`

Aufruf: `apply.sh [--host pk-tablet] [--loadouts <pfad>] [--dry-run]`.
SSH-Ziel über `~/.ssh/config`-Alias (Default `pk-tablet`, Benutzer
`clusteradmin`, sudo auf dem Gerät).

Ablauf:
1. `node render.mjs --out "$TMP"`; Abbruch bei Exit ≠ 0.
2. `--dry-run`: Plan ausgeben und Exit 0 ohne SSH — je Zeile eine Aktion:
   `build <b>`, `model keep|fetch <relpfad>`, `prune unbekannte Modelle`,
   `unit enable <slug> port <p>`, `unit disable-others`, `health <slug> <p>`.
3. Sonst über **eine** SSH-Sitzung je Schritt (`ssh -o BatchMode=yes`):
   - Build: fehlt `/opt/llama/<build>`, Zip von GitHub-Release laden,
     entpacken, `llama-server` liegt danach direkt in `/opt/llama/<build>/`
     (Layout des Zips beim Umsetzen prüfen und `--strip`-Logik anpassen),
     `ln -sfn` auf `current`.
   - Dateien kopieren (`scp` nach `/tmp`, dann `sudo install`):
     `run-loadout.sh` → `/opt/llama/`, beide Units → `/etc/systemd/system/`,
     `*.argv` → `/etc/llama/` (alte `*.argv` vorher entfernen),
     `systemctl daemon-reload`, `enable --now cpu-performance.service`.
   - Modelle: je Zeile aus `models.list` Datei prüfen (`sha256sum`), sonst
     `curl -fL --retry 3 -o <ziel>.part`, sha256 prüfen, `mv`. Abweichung →
     `.part` löschen, Exit 1.
   - Prune: alle `*.gguf` unter `/var/lib/llama/models`, die nicht in
     `models.list` stehen, löschen; leere Verzeichnisse entfernen.
   - Units: laufende `llama-server@*.service`, deren Slug nicht in
     `enabled.list` steht, `disable --now`; aktive `enable` + `restart`.
   - ufw: Regeln mit Kommentar `llama-*` löschen, dann je Port
     `ufw allow in on tailscale0 to any port <p> proto tcp comment llama-<slug>`
     und dasselbe für das WireGuard-Interface `wg0`.
   - Health: je Port `curl -fsS http://127.0.0.1:<p>/health` bis 180 s;
     Timeout → `journalctl -u llama-server@<slug> -n 50` ausgeben, Exit 1.
4. Abschluss: `apply ok: <slugs>`.

Zusätzlich `apply.sh --bootstrap --wg-conf <datei>` (D5): kopiert die
WireGuard-Config nach `/etc/wireguard/wg0.conf` (Modus 600),
`systemctl enable --now wg-quick@wg0`, installiert Tailscale über das
offizielle apt-Repo und ruft `sudo tailscale up --hostname pk-tablet` auf
(Login-URL erscheint im Terminal). Die WG-Config erzeugt
`bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name pk-tablet --private-key <PRIV>`
(siehe `scripts/llm/README-laptop-bge.md`); sie wird nie committet.

## Task 6 — Taskfile

In `taskfiles/Taskfile.llm.yml`:
- `tablet:render` → `node scripts/llm/pk-tablet/render.mjs --out .tmp/pk-tablet`
- `tablet:apply` → `bash scripts/llm/pk-tablet/apply.sh {{.CLI_ARGS}}`
- `tablet:bootstrap` → `bash scripts/llm/pk-tablet/apply.sh --bootstrap --wg-conf "{{.WG_CONF}}"`
  mit `requires: vars: [WG_CONF]`
- `loadouts:check` zusätzlich gegen `devmesh/pk-tablet/loadouts.json`
  laufen lassen (zweiter `cmds`-Eintrag).

Damit sind alle neuen Skripte von Taskfile erreichbar (S4).
