# Proposal: unterstuetzermodelle-limits-e4b

## Why

T006842 (Geraete-Inbetriebnahme) ist via Merge-Abschluss-Konvention `done` (Script-PRs #4614/#4619/#4622). Die K3-Messungen liegen vor (Belege in den T006842-Kommentaren, Mess-Konvention T002717):

- Qwen3.5-4B **UD-Q4_K_XL** auf PK-L-1: ~7,8-9,5 tok/s Decode (CPU; Vulkan-Offload auf der Iris Xe strukturell nicht moeglich — GUI-Log „No live GPU info available", kein dedizierter VRAM), Thinking nicht abschaltbar (100 % Reasoning-Overhead)
- Gemma-4-12B haengt auf dem PK-Tablet (12B + 32k-Kontext ueberfordern das Geraet)

Die SSOT-Spec (`local-llm-proxy.md`) verlangt noch die konservativen Limits (32768/8192) „until the Vulkan measurement replaces them with measured values" — genau dieser Austausch steht aus. Ausserdem referenziert die Spec den Tablet-Slot noch als `gemma-4-12b@ud-iq3_xxs`.

## What

1. **Limits pinnen** in `.opencode/agent-models.jsonc`: `limit.context` 32768 (verifiziert lauffaehig), `limit.output` 4096 (bei ~9,5 tok/s + Thinking-Overhead waere 8192 = 14-17 Min/Request), mit Kommentar (Messlauf, Werte, Datum) nach der Datei-Konvention (Z. 26)
2. **Tablet-Slot ersetzen**: `gemma-4-12b@ud-iq3_xxs` → `gemma-4-e4b@ud-q4_k_xl` (Gemma 4 E4B, Googles On-Device-Modell der Familie; lief auf PK-L-1 bereits problemlos)
3. **Guard P2.5** in `tests/spec/local-llm-proxy/support-model-slots.bats` (Reviewer-Findings aus T006840): Test 3 skip nur bei exakter D1-Baseline (deepseek-IDs), Limits-Pinning im Test 1, `bash -c`-Quote-Konstrukt auf Argument-Uebergabe umstellen
4. **Delta-Spec**: harte 32768/8192 → gemessene 32768/4096, Slot-Liste auf E4B aktualisieren
5. **Proxy-Alias-Ummap** in `tickets.llm_proxy_backends` (lmstudio-Backend): `gemma-4-12b@ud-iq3_xxs` → `gemma-4-e4b@ud-q4_k_xl` (Ziel `gemma-4-e4b-it`)

Nicht in diesem Change (Geraete-Folgetask): E4B-Datei aufs Tablet, `lms load` mit `--identifier gemma-4-e4b@ud-q4_k_xl`, K3-Messung Tablet → Limits nachjustieren.

_Ticket: T007033_
