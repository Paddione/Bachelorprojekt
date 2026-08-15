# Proposal: unterstuetzermodelle-inbetriebnahme

## Why

Die bge-Schicht läuft seit dem S1-Merge (PR #4560) mit ihren Erstgliedern auf den Laptops:
Embedding auf PK-L-1 (LM Studio/LM Link), Rerank auf dem PK-Tablet (llama-server). Das Design
`2026-08-15-laptop-bge-topologie` weist jedem Gerät zusätzlich ein **Unterstützermodell** zu
(E6): Gemma-4-12B UD-IQ3_XXS (~4,64 GB) auf dem Tablet, Qwen3.5-4B Q6_K (~3,3 GB) auf PK-L-1 —
zusammen mit der jeweiligen bge-Rolle innerhalb des 6,5-GB-Budgets der Intel-Iris-Geräte.
Die Modelle sind bisher nirgends registriert: opencode kennt sie nicht, der llm-proxy exponiert
sie nur dann, wenn LM Studio sie lädt, und die Vulkan-Performance auf Iris ist ungemessen
(die ~10 tok/s im Design sind ausdrücklich Annahme, kein Messwert).

## What

Die beiden Stock-Modelle als **benannte Slots** im bestehenden `lmstudio`-Provider-Block von
`.opencode/agent-models.jsonc` registrieren (Muster `name@quant` wie `qwen3-14b@q4_k_m`):
`gemma-4-12b@ud-iq3_xxs` (PK-Tablet) und `qwen3.5-4b@q6_k` (PK-L-1). **Kein Subagent wird
umgehängt** — Umhängen folgt nach der Vulkan-Messung (Entscheidung 2026-08-15). Die
`limit`-Werte starten konservativ (32768/8192) und werden nach der Messung auf GEMESSEN-Werte
nachgezogen.

Dazu: Device-Schritte (iGPU/Vulkan in LM Studio aktivieren, Modelle laden, LM Link fürs
Tablet) als verifizierbare Plan-Tasks, ein Vulkan-Messschritt als User-Task mit ausführbarem
Befehl (Mess-Konvention T002717), und Guards, dass die Slots deklariert sind, über den
llm-proxy (:18235) erreichbar sind und kein Backend-Port-Literal in die tracked surfaces
gelangt.

**Abgrenzung:** S3 (Feintuning auf Factory-Traces, Registry, Stock-Austausch) läuft als
T006361 — dort wird der exportierte Adapter registriert und das Stock-Modell ersetzt.

_Ticket: T006840_
