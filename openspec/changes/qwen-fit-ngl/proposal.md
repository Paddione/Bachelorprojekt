# Proposal: qwen-fit-ngl

## Why

Symptom (beobachtet, 2026-09-15): Die RTX 3060 Ti, an der der Windows-Desktop haengt, ist mit 7944 von 8192 MiB belegt, waehrend die RTX 5070 Ti rund 4 GB frei hat. Das Qwen-27B-Dual-GPU-Loadout soll die 3060 Ti nur fuer zusaetzlichen Kontext nutzen und ihr eine Reserve von 1500 MiB lassen.

Ursache (per Log belegt, keine Hypothese): `scripts/llm/start-qwen-server.ps1` uebergibt immer `-ngl 999` neben `-fit on`. llama.cpp b10881 bricht `-fit` dann ab:

```
W common_fit_params: failed to fit params to free device memory: n_gpu_layers already set by user to 999, abort
```

Ohne `-fit` gilt `-fitt 256,1500` nicht. Die Layer werden im Verhaeltnis des freien VRAM verteilt, der KV-Cache fuer 188k Kontext waechst auf beiden Karten mit. Die Anhebung der Reserve auf 2048 MiB (T900170) war aus demselben Grund wirkungslos.

Reproducer: dasselbe Skript ohne die `-ngl`-Zeile. Die Warnung verschwindet, `n_ctx_slot = 205056`, frei danach 1752 MiB (3060 Ti) und 2782 MiB (5070 Ti), Decode 31,6 und 30,8 t/s.

## What

- `-ngl 999` wird nur noch auf dem Pfad mit festem Kontext (`-Ctx`, `-fit off`) gesetzt. Mit `-fit on` waehlt llama.cpp die Layer-Zahl selbst.
- Die Reserve bleibt `256,1500`.
- Ein verzeichnisweiter BATS-Guard verhindert `-ngl` im unbedingten Argumentblock eines Startskripts mit `-fit on`.

_Ticket: T900171_
