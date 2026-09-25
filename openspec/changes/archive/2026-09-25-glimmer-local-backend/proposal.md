# Proposal: glimmer-local-backend

## Why

Der opencode-`orchestrator` plant auf Muse Spark 1.3; der lokale Executor auf `:1919` ist Qwen3.8-27B.
Muse Glimmer 30B ist aus Muse Spark destilliert und für genau die Teilaufgaben gebaut, die der
Orchestrator an den lokalen Agenten delegiert. Mit Glimmer sprechen Planer und Ausführer dieselbe
Modellfamilie: gleicher Tokenizer, gleiche Tool-Call- und Kanal-Konventionen, gleiches
`Reasoning strength`-Vokabular.

Gemessen am 2026-09-25 (Details in `design.md`) bringt der Tausch auf derselben RTX 5070 Ti:

- bei langem Kontext deutlich mehr Decode (84–89 statt 55,7 tok/s bei ~120k) und rund 30 % mehr Prefill,
- `q8_0`-KV statt `q4_0` bei gleichem VRAM-Budget (15,09 GB), was Tool-Call-Argumente schützt.

Die Kosten: kurzer Decode etwas langsamer (~79 statt ~96 tok/s) und das Kontextfenster sinkt von 153600
auf 131072, das Architekturmaximum von Glimmer.

## What

- Neue systemd-User-Unit `scripts/llm/glimmer.service`: Muse Glimmer 30B `UD-IQ3_XXS` plus
  DFlash2-Drafter `Q4_K_M` auf der 5070 Ti, `--spec-draft-n-max 4`, `-c 131072`, `q8_0`-KV, Alias
  `Muse-Glimmer-30B`, Sampling nach Modellkarte. Setzt llama.cpp ab `e85e15cf6` voraus (DFlash2).
  `qwen38-gsq.service` entfällt.
- opencode: Katalog-Key `Muse-Glimmer-30B` (131072 Kontext), Default-Modell, Primary `glimmer-primary`
  statt `qwen38-primary`, Compaction-Trigger 97472, DCP 40 %/70 %.
- Factory, brain-ingest, plan-qa und die MCP-Server: Default-Modell-ID `Muse-Glimmer-30B`.
- Alle Aufrufer, die Reasoning mit `enable_thinking: false` abschalten, setzen zusätzlich
  `reasoning_strength: "low"`, denn Glimmers Template kennt nur diesen Schalter.
- Registries und Doku (Loadouts, devmesh-Proxy-Registry, Agent-Registry, AGENTS.md, Goals) und die
  BATS-Guards ziehen nach.

Nicht Teil: Vision (`mmproj`), Dual-GPU-Split, Apache-Spark-Anbindung. Begründung in `design.md`.

_Ticket: T900365_
