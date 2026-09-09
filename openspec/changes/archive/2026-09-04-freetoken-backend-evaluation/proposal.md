# Proposal: freetoken-backend-evaluation

## Why

Die Entscheidung für FreeToken (T014028/T014105) fiel gegen einen ungeeigneten
Vergleichspartner. Gemessen wurde die Offload-MoE-Engine gegen ein **dichtes**
Modell — `qwen38-220k` (Qwen3.8-27B UD-IQ3_XXS) bei 30–43 t/s. Gegen ein
vollständig GPU-residentes **MoE** kehrt sich das Bild um; alle Werte auf
derselben RTX 5070 Ti bei `np=1`:

| Backend | Modell | Kontext | Decode |
|---|---|---|---|
| llama.cpp `gemma26-throughput` | Gemma 4 26B A4B QAT-Q4_K_XL (MoE, 4B aktiv) | 118.016 | 159–169 t/s |
| llama.cpp `gemma4` | Gemma 4 26B A4B UD-IQ4_XS (MoE, 4B aktiv) | 177.920 | 126–128 t/s |
| FreeToken `qwen-200k` | Qwen3.6-35B-A3B-NVFP4 (MoE, 3B aktiv, Offload) | 200.000 | 115 t/s |
| llama.cpp `qwen38-220k` | Qwen3.8-27B UD-IQ3_XXS (dicht/hybrid) | 131.072 | 30–43 t/s |

Quelle: `scripts/llm/loadouts.json` (`notes`) und `docs/runbooks/freetoken-native.md`.

Diese vier Zeilen reichen **nicht** als Entscheidungsgrundlage: verschiedene
Modelle, Quants, Kontexte, Build-Stände und Messtage. Sie darauf zu stützen wäre
genau die Klasse Entscheidung, gegen die die Mess-Konvention (T002717)
geschrieben wurde.

Erschwerend kommt eine strukturelle Beobachtungslücke hinzu — der eigentliche
Kernbefund der Vorrecherche: `scripts/llm-proxy/` enthält **null** Referenzen auf
FreeToken, und `.opencode/agent-models.jsonc:74` verdrahtet den Provider direkt
auf `http://127.0.0.1:1919/v1`, also am mitschneidenden Proxy (`:18235`) vorbei.
`tickets.llm_proxy_request_log` enthält deshalb keine einzige FreeToken-Zeile.
Es existieren weder Nutzungsdaten zu `active-thinking` gegenüber `active-fast`
noch Messwerte zu realen Prompt-Größen. Seit T014028 hat der gesamte lokale
LLM-Verkehr den Beobachtungspfad verlassen — diese Lücke trifft jede künftige
Backend-Entscheidung, nicht nur diese.

Zwei konkrete Annahmen im Repo sind zudem nachweislich überholt:

- `start-gptoss-server.ps1` begründet die Modellwahl mit „Qwen3.6-27B … passt
  aber nur als IQ3_XXS ins VRAM". `ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF`
  (arXiv [2604.18556](https://arxiv.org/abs/2604.18556) GSQ /
  [2605.00649](https://arxiv.org/abs/2605.00649) RCO) liefert bei IQ3_S/11,8 GB
  ein gegen BF16 task-lossless Modell (AIME25 100,00 = BF16; LiveCodeBench v6
  85,71 = BF16; GPQA-Diamond 89,39 vs. 89,90) und schlägt UD-IQ3_S gleicher
  Größe um +3,33 AIME25 und +1,71 LCB.
- Die Notiz zu `gemma26-throughput` nennt 15,2 GB für QAT-UD-Q4_K_XL; die Datei
  ist 14,25 GB groß.

## What

Dieser Change erzeugt die **Messgrundlage** und eine begründete Empfehlung. Die
Migration ist ausdrücklich **nicht** Teil dieses Changes: kein Requirement wird
umgehängt, kein Guard invertiert, kein Routing geändert. Fällt die Empfehlung für
llama.cpp aus, folgt ein eigener Change mit eigenen Spec-Deltas.

**Entwurfsentscheidung — Messung ohne `loadouts.json`.** `gemma26-throughput` auf
`enabled:true` zu setzen verletzt `tests/spec/freetoken-local-backend/routing.bats`
und kollidiert mit dem offenen Change `decommission-orphaned-loadouts-T014339` in
derselben Datei. Gemessen wird deshalb mit direkten `llama-server`-Aufrufen auf
Scratch-Ports. Das ist kein Notbehelf: die vorhandene qwen38-Messung in
`loadouts.json` ist exakt so dokumentiert (`llama-server -m … --port 8194 …`).
`scripts/llm/loadouts.json` bleibt in diesem Change unangetastet.

1. **Vorarbeit (blockierend).** Der VRAM-Check in `start-gptoss-server.ps1` und
   `start-gemma-server.ps1` bricht seit dem Einbau der zweiten GPU ab —
   `[int](& nvidia-smi --query-gpu=memory.free …).Trim()` liefert zwei Zeilen und
   wirft „Cannot convert System.Object[] to Int32" (verifiziert). Beiden fehlt
   zusätzlich die explizite Kartenwahl; `CUDA_VISIBLE_DEVICES` wird per **UUID**
   gesetzt, weil CUDA nicht wie `nvidia-smi` sortiert. Ohne diesen Fix läuft
   keine Messung.
2. **Alias-Telemetrie** in `.opencode/plugin/freetoken-active.ts`. Das Plugin
   verzweigt bereits auf `body.model === THINKING_MODEL`; daneben entsteht ein
   Append-Only-JSONL-Satz mit Zeitstempel, Alias und Prompt-Größe. Das ist der
   einzige Punkt im System, der den echten Request-Body sieht, seit der Verkehr
   am Proxy vorbeigeht — und beantwortet beide offenen Fragen an der Quelle.
3. **Offline-Kontextmessung** über `scripts/factory/eval-context.cjs` und die
   acht Fixtures in `tests/factory-eval/fixtures/`. Liefert sofort eine Zahl,
   ohne auf Live-Verkehr zu warten; ergänzt (2), ersetzt es nicht.
4. **Stufe 1 — Engine-Isolation.** `gpt-oss-20b` auf beiden Engines mit
   identischen Prompts: FreeToken `:1919` (Profil `gptoss-65k`) gegen
   `llama-server` mit `gpt-oss-20b-MXFP4.gguf`. Beide Artefakte liegen bereits
   auf Platte, Download null. Trennt Engine-Effekt von Modell-Effekt — der
   Confounder, an dem die bisherige Entscheidung krankt.
5. **Stufe 2 — Modellvergleich.** Gemma 4 26B A4B QAT-Q4_K_XL + MTP-Head gegen
   Qwen3.8-27B GSQ-RCO IQ3_S-mtp gegen den FreeToken-Amtsinhaber, je Durchsatz
   und Schema-Treue (~26 GB Download).
6. **`scripts/llm/bench-ifstruct.sh`** gegen `LiquidAI/ifstruct-v1.0` (2.000
   Prompts, binäre Wertung, ohne constrained decoding) — misst reine
   JSON/YAML-Schema-Treue, also den Fehlermodus, an dem die Factory scheitert
   (`tool_calls`). Handwerkzeug im Muster der fünf bestehenden `bench-*.sh`:
   kein Taskfile-Target, kein CI-Bezug, damit keine Pipeline-Abhängigkeit vom
   externen Liquid4All-Validator entsteht.

**Abbruchpunkte** — Ergebnisse, keine Fehlschläge, und als solche zu berichten:

- Zeigt (3) einen Kontextbedarf nahe 200.000 Tokens, entfällt das Hauptargument
  gegen FreeToken und (5) schrumpft entsprechend.
- Verliert llama.cpp bereits bei identischen Gewichten (4), ist (5) hinfällig
  und die 26 GB Download entfallen.

**Ergebnis** ist ein Messbericht unter
`scripts/llm/measurements/2026-09-04-freetoken-vs-llamacpp.md`. Jede Zahl trägt
den ausführbaren Befehl und den Commit-Stand, gegen den gemessen wurde (T002717).

**Offene Risiken, bewusst nicht geglättet:** Die Planung hat die ursprüngliche
Annahme hinter (3) widerlegt. `scripts/factory/eval-context.cjs` baut **nicht**
den Dispatch-Prompt; die realen `contextHints` entstehen getrennt davon zur
Laufzeit (`scripts/factory/provision.js:120`, `pipeline-decompose.cjs:64`) und
sind laut Quellkommentar „a COMPACT list of context labels … NEVER a raw dump".
Die acht Fixtures liefern damit eine **Untergrenze einer einzelnen Komponente**,
nicht den Prompt. Eine Untergrenze entscheidet nur in eine Richtung: sie kann
zeigen, dass der Bedarf ein Fenster sprengt, aber nicht, dass er klein ist. Der
Nachweis, dass die 200.000 Tokens ungenutzt bleiben, kann deshalb nur aus (2)
kommen. (3) bleibt im Change, weil eine sofort verfügbare Untergrenze mit
deklariertem Fehlerbalken mehr wert ist als die unbelegte Zahl „31–37k", die
heute in zwei Startskripten steht — aber die Beweislast liegt bei (2).

Und der Dynamic Thinking Pool (`enable_thinking` pro Request, 200k/85k)
ist eine FreeToken-Fähigkeit, die llama.cpp nur über einen Serverneustart
nachbildet; ob das ein K.-o.-Kriterium darstellt, entscheidet die
Nutzungsmessung aus (2) — nicht dieser Change im Voraus.

_Ticket: T900087_
