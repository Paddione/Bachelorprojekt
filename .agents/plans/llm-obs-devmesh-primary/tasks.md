---
title: Plan: LLM primär auf Container-GPU + OBS per Log/File-Nachweis
ticket_id: null
domains: [website, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: LLM primär auf Container-GPU + OBS per Log/File-Nachweis

Eigner-Entscheide: LLM01/02 → Devmesh-/Container-GPU primär (WSL-Host-Pfad umgangen);
OBS01/CAP01/SLO01 → Log-/File-SLO-Nachweis (kein Prometheus auf devmesh).

## Ausgangslage (belegt)

- LLM02 = 5 (Proxy `ready:false`, `degraded=["chat_primary"]`); `:1919` (WSL-Host-Qwen3.8-27B) tot.
  Container-GPU lebt: `:8099` qwen3-1.7B (k3d, `devmesh-qwen17b-forward`), `:8091` bge, `:18336` lfm,
  `:8090` gemma-CPU-Fallback. Router-Default `chat_primary` zeigt auf totes `:1919`.
- LLM01 = 1: einziger aktiver Loadout-Port `:45013` (Unsloth-Studio-Child, down; Studio selbst
  gesund auf `:8888`). Gruppe `chat-gpu` hat kein lebendes Mitglied.
- OBS01/CAP01/SLO01 = n/a: `HG_PROMETHEUS_URL` fehlt (fleet abgebaut). Messfunktionen in
  `scripts/lib/runtime-health-measure.py` nehmen bereits `data`/`--input` — Produzenten fehlen.
- Drift-Risiko: llama.cpp meldet absolute Modell-IDs (`/models/….gguf`), Drift-Vergleich ist
  wörtlich → neuer `:8099`-Eintrag bräuchte Basename-Normierung, sonst G-LLM03 = 1.

## Nicht-Ziele

Kein WSL-Host-GPU-Fix, kein Prometheus-Aufbau, kein neues Modell-Training,
keine Router-Neuarchitektur (nur Default-Umlegung + Label).

## Partial L1 — Loadouts auf Container-GPU (BP)

Zieldatei: `scripts/llm/loadouts.json` (+ `scripts/lib/llm-stack-measure.sh` für Drift-Normierung)

- [ ] Neuer Eintrag `qwen17b-container`, Port `8099`, Gruppe `chat-gpu`,
      `model` so gewählt, dass Drift datenseitig passt (mit Normierung: Basename).
- [ ] `unsloth-studio` (`:45013`): `enabled:false` + Notiz (Studio-Child down; Container primär).
- [ ] Drift-Vergleich auf Basename normieren (llama.cpp meldet absolute Pfade),
      kein Verhalten für bereits passende Einträge ändern.
- [ ] Gate: `server-availability` → 0, `model-drift` → 0 (lokal, live Endpunkte).

## Partial L2 — Proxy-Primary auf Container (dotfiles, eigener PR)

Zieldateien: `~/scripts/devmesh-llm-router.mjs`, `~/tests/unit/devmesh-llm-router.test.ts`

- [ ] Default `chat_primary.baseUrl` `:1919` → `http://127.0.0.1:8099` (Env-Override bleibt).
- [ ] Standby-Label `def` für primary auf Container-Modell aktualisieren (kosmetisch, ehrlich).
- [ ] Danach: Unit-Reload + Router-Restart, `/health` verifizieren (`ready:true`, `degraded:[]`).
- [ ] Gate: `npm test --prefix ~/tests -- devmesh-llm-router` grün; LLM02 → 0.

## Partial O1 — OBS File-Evidenz (BP)

Neue Datei: `scripts/lib/obs-file-evidence.sh`; Doku: `.claude/lib/goals.md` (G-OBS01/CAP01/SLO01)

- [ ] `scrape --targets obs-targets.json --out F`: Targets proben → Prometheus-Vektor-JSON.
- [ ] `capacity --out F`: `kubectl get pvc -o json` → Vektor-Zeilen (Ratio), fail-closed ohne Cluster.
- [ ] `slo-append --log F` (Brand-Proben anhängen) + `slo-window --log F` (7d-Aggregat,
      `insufficient-history`-Fehler statt stiller Werte; inkl. Sample-Count-Regel).
- [ ] `health-goals-measure.sh`: `HG_*_INPUT`-Kette nutzen (existiert) — nur Doku/Verdrahtung,
      kein CI-Pfad-Umbau. Goals-Doku: Messquelle File-Evidenz + n/a-Bedingungen.
- [ ] Gate: hermetische pytest (Stub-Server/Dateien) + `runtime-health-measure.py {scrape,capacity,slo} --input` end-to-end grün.

## Finale Verifikation

1. `server-availability` → 0, `proxy-readiness` → 0, `model-drift` → 0 (live, begründet).
2. `python3 -m pytest tests/py/spec/native_ported/spec/test_llm_obs_devmesh_primary.py -q` grün.
3. Dotfiles: `npm test --prefix ~/tests -- devmesh-llm-router` + `typecheck` grün.
4. `task test:changed` (Repo-Gate) grün; kein generated-Artifact angefasst → freshness unverändert.
5. Commits: BP `feat(...)` + dotfiles PR getrennt; kein PR ohne grüne Gates.
