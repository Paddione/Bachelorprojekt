---
title: "p3-tests — Ausgabe-Tests für PXE-Profil und Geräte-Loadout"
domains: [testing]
status: draft
---

# pxe-inference-tablet — Implementation Plan

Partial p3 (Tests-Rolle). Ziel-Dateien:
`tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py`,
`tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py`,
`components/website/src/data/test-inventory.json`,
`tests/evals/golden/task-list-all.txt`.

S1: `test_setup_pxe_guards.py` Ist 80 · nicht gebaselined · Limit 800 →
Budget 720. Neue Testdatei < 250 Zeilen.

Alle Tests prüfen Befehlsausgaben (T002448-M4), nicht Quelltext. Fixtures
`run_cmd`/`repo_root` aus `tests/py/conftest.py`.

## Task 1 — Rotphase

Tests aus Task 2 und 3 zuerst schreiben und gegen den Stand ohne p1/p2
laufen lassen:

```bash
python3 -m pytest -q tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py
```

expected: FAIL (unbekanntes Flag `--profile`, fehlendes `render.mjs`).

## Task 2 — `test_setup_pxe_guards.py` erweitern

Neue Tests mit der vorhandenen `pxe`-Fixture:
- `test_inference_ohne_only_mac_bricht_ab`: `--profile inference --disk /dev/sda` → rc ≠ 0, `only-mac` in Ausgabe.
- `test_inference_ohne_disk_bricht_ab`: `--profile inference --only-mac 84:3a:5b:cb:12:89` → rc ≠ 0, `disk` in Ausgabe.
- `test_unbekanntes_profil`: `--profile foo` → rc ≠ 0, `profile` in Ausgabe.
- `test_only_mac_format`: `--only-mac zz` → rc ≠ 0.
- `test_print_user_data_inference`: `--print-user-data --profile inference --only-mac 84:3A:5B:CB:12:89 --disk /dev/sda` → rc 0; Ausgabe enthält `ubuntu-server-minimal`, `mesa-vulkan-drivers`, `HandleLidSwitch=ignore`, `path: /dev/sda`; enthält NICHT `k3s-join`; Ausgabe ist gültiges YAML (`yaml.safe_load`) mit Schlüssel `autoinstall`.
- `test_print_user_data_cluster_unveraendert`: `--print-user-data` ohne Profil → enthält `k3s-join.sh`, nicht `ubuntu-server-minimal`.
- `test_dnsmasq_only_mac_filter`: `--print-dnsmasq-conf --iface eth0 --server-ip 10.0.0.5 --only-mac 84:3A:5B:CB:12:89` → enthält `dhcp-mac=set:target,84:3a:5b:cb:12:89`; jede `pxe-service=`-Zeile enthält `tag:target`.
- `test_dnsmasq_ohne_filter_ohne_target_tag`: ohne `--only-mac` kommt `tag:target` nicht vor.

## Task 3 — `test_pk_tablet_loadout.py` (neu)

- `test_geraete_loadout_ist_kanonisch`: `node scripts/llm/loadouts-format.mjs --check devmesh/pk-tablet/loadouts.json` rc 0.
- `test_render_schreibt_argv_je_aktivem_loadout`: `node scripts/llm/pk-tablet/render.mjs --out <tmp>` rc 0; `enabled.list` = `bge-rerank`, `qwen35-9b-chat`; `qwen35-9b-chat.argv` enthält Zeilen `--port`, `1234`, `-m` gefolgt von `/var/lib/llama/models/unsloth/Qwen3.5-9B-GGUF/Qwen3.5-9B-Q4_K_M.gguf`; `bge-rerank.argv` enthält `--reranking`.
- `test_models_list_hat_sha_und_url`: jede Zeile in `models.list` hat drei Felder, sha256 ist 64 Hex-Zeichen, URL beginnt mit `https://huggingface.co/`.
- `test_deaktiviertes_loadout_faellt_raus`: Kopie der Loadout-Datei nach tmp, `enabled` von `bge-rerank` auf false, `render.mjs --loadouts <kopie>` → kein `bge-rerank.argv`, Reranker-Modell nicht in `models.list`, `ports.list` nur `qwen35-9b-chat 1234`.
- `test_render_fehlende_modellquelle_bricht_ab`: `--models` auf eine tmp-Datei `{}` → rc ≠ 0, Modellpfad in Ausgabe.
- `test_apply_dry_run_ohne_ssh`: `bash scripts/llm/pk-tablet/apply.sh --dry-run` mit `PATH` ohne `ssh` (tmp-Verzeichnis mit Symlinks auf `node`, `bash`, Coreutils) → rc 0; Ausgabe enthält `unit enable qwen35-9b-chat port 1234` und `health bge-rerank 8080`.

## Task 4 — Grün + Artefakte

Nach p1 und p2:

```bash
python3 -m pytest -q tests/py/spec/remaining_root_specs/workstation_cluster_pxe/test_setup_pxe_guards.py tests/py/spec/native_ported/spec/local-llm-proxy/test_pk_tablet_loadout.py
```

expected: PASS. Dann `task test:inventory` (aktualisiert
`components/website/src/data/test-inventory.json`) und
`task test:evals:update` (neue Tasks in `tests/evals/golden/task-list-all.txt`);
beide Dateien mitcommitten.
