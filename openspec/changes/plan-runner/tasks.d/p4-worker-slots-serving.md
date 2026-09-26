---
title: "p4 — 4B-Slots messen, Serving-Konfiguration anpassen"
ticket_id: T900504
domains: [llm-local-dev]
status: active
---

# p4 — 4B-Slots messen, Serving-Konfiguration anpassen

Files: `scripts/llm/qwen35-mtp.service`, `.opencode/agent-models.jsonc`,
`scripts/llm/measurements/2026-09-27-qwen35-4b-slots.md` (neu). Disjunkt zu p1–p3, p5.

## Task 4.1: Slots auf der RTX 3060 Ti messen

Gegen Qwen3.5-4B-MTP (`qwen35-mtp.service`, 8 GB) je Konfiguration VRAM, `n_ctx_slot`, Einzelstrom
und Gesamtdurchsatz messen — Methode wie `2026-09-26-qwen38-gsq-iq2s-mtp.md` (Abschnitt 3 und 4 Slots):

| Konfiguration | Messen |
|---|---|
| `-np 1 -c 131072` (heute) | Referenz |
| `-np 2 -kvu` mit groesstem Kontext unter ~7.600 MiB | 1/2 Stroeme |
| `-np 4 -kvu` mit groesstem Kontext unter ~7.600 MiB | 1/2/4 Stroeme |

Grenze 7.600 MiB, weil auf der 3060 Ti der Desktop haengt (vgl. Reserve-Begruendung im Loadout
`qwen38-220k`). Jede Konfiguration zusaetzlich mit einem Prompt nahe dem Kontextende pruefen
(Prefill-Einbruch = Spill). Ergebnis und Befehle in die neue Messdatei (Mess-Konvention T002717).

## Task 4.2: Default setzen

Nur wenn eine Mehr-Slot-Konfiguration den Gesamtdurchsatz um mindestens 25 % hebt und je Slot noch
mindestens 32k Kontext bleibt: `-np`/`-kvu`/`-c` in `scripts/llm/qwen35-mtp.service` umstellen und
die Slot-Zahl als Default fuer `--4b-slots` im Runbook nennen. Sonst bleibt die Unit unveraendert und
die Messdatei begruendet das.

## Task 4.3: `local` umbeschriften

In `.opencode/agent-models.jsonc` Provider-Label, `local`-Beschreibung und Kontextangabe auf
Qwen3.8-27B GSQ-RCO IQ2_S-mtp (196k, `:1919`) umstellen. `limit.context` des Providers auf 196608
setzen (= served KV, vgl. Regel aus der FreeToken-Zeit: Limit = konfigurierter Kontext). Die Modell-ID
bleibt ein Alias, den llama-server ignoriert; Konsumenten brechen nicht.

Akzeptanz: Messdatei mit Befehlen vorhanden; `opencode run --agent local "Say OK"` antwortet gegen `:1919`.
