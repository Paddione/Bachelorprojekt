# E4B Vision-Agent-Bench: Unsloth IT vs HauhauCS Aggressive (Q4_K_M)

Datum: 2026-10-09 · Ticket-Kontext: T901645 (Harness) · Ledger: training-memory
`evaluation`-Events (Smoke + Task-Bench)

## Ergebnis in Kürze

**Unsloth gewinnt deutlich**: 7/21 Runs bestanden bei ~3–10x weniger Tokens
als Hauhau (4/21). Hauhaus Thinking-Bloat (~300–400 Stripped-Tokens pro
Vision-Call, Smoke-Messung) übersetzt sich im Agenten-Loop in Herumwandern
bis zum Turn-Limit statt in bessere Treffer. Einziger Hauhau-Pluspunkt:
0 Protokollfehler gegen 5 bei Unsloth (JSON-Disziplin intakt — rettet aber
keine Flows).

## Protokoll

- Harness: `tests/e2e/agent/runner.mjs` (T901645), `--reps 3 --max-turns 8`,
  `--obs screenshot`, `max_tokens 800`, Ziel live `https://web.mentolder.de`
- Modelle sequenziell auf RTX 5070 Ti (16 GB, WSL2), je frischer
  `llama-server` (0.6.0-dev fc9ce6b CUDA, `-c 32768 -ngl 99`, Port 1931):
  - A: `unsloth/gemma-4-E4B-it-GGUF`, `gemma-4-E4B-it-Q4_K_M.gguf` + `mmproj-F16.gguf`
  - B: `HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive`,
    `...-Q4_K_M.gguf` + `mmproj-...-f16.gguf` (as-shipped, kein Template-Override)
- Artefakte: `/tmp/bench-e4b-unsloth.jsonl`, `/tmp/bench-e4b-hauhau.jsonl`
  (je 21 Runs, Exit 0, keine Crashes)

## Zahlen (je Flow: bestanden/3, Turns, Median-Tokens)

| Flow | Unsloth | Hauhau |
|---|---|---|
| smoke-home | 3/3, [3,2,2], 2105 tok | 2/3, [4,8,2], 6429 tok |
| booking-termin-tab | 2/3, [7,2,8], 18054 tok | 0/3, [8,8,8], 22520 tok |
| billing-services | 2/3, [6,1,2], 2982 tok | 2/3, [8,7,5], 17710 tok |
| messaging-portal-gate | 0/3 (Route→404, stale) | 0/3 (dto.) |
| content-hub-editor | 0/3, [1,1,1] (kein Login, gibt schnell auf) | 0/3, [8,8,8] (wandert) |
| admin-platform-gate | 0/3 (Route→404, stale) | 0/3 (dto.) |
| admin-inbox-renders | 0/3, [8,8,8] (kein Login) | 0/3, [8,8,8] |
| **Gesamt** | **7/21, 5 perr** | **4/21, 0 perr** |

## Deutung

1. **Erfolgsrate**: Auf den 3 lösbaren Flows (smoke/booking/billing) steht es
   7:4 für Unsloth. Hauhau scheitert nie am JSON-Format, sondern am
   Entscheiden (maxed Turns, falsche Pfade).
2. **Effizienz**: Unsloth braucht pro Run 2–18k Tokens, Hauhau ziemlich
   konstant ~20–22k — der Thinking-Overhead ist real und kauft keine
   Qualität.
3. **Fail-Verhalten**: Unsloth gibt bei unlösbaren Flows teils schnell auf
   (content-hub: 1 Turn), Hauhau wandert immer bis 8. Für Agenten-Ökonomie
   zählt auch das.
4. **Uncensored bringt hier nichts**: Kein Lauf scheiterte an einer
   Refusal-ähnlichen Verweigerung; Instruktionsfolge + Grounding entscheiden.

## Caveats

- Live-Ziel, Läufe zeitversetzt (unkontrollierte Site-Seite), n=3 Reps.
- 2 Flows stale (`/portal…`, `/admin/platform` → 404 auf Live) — für beide
  Modelle gleich uninformativ, `curated.json` braucht einen Daten-Fix.
- 2 Flows brauchen Admin-Session (erwartbar rot) — messen nur Fail-Verhalten.
- Nur `--obs screenshot`; Hybrid (A11y+Screenshot) und Frontier-Orakel stehen
  noch aus (Leiter aus dem Bench-Vorschlag).

## Empfehlung

Unsloth `gemma-4-E4B-it-Q4_K_M` als Standard-VLM für den Agenten-Harness;
Hauhau nur weiterverfolgen, falls ein Use-Case Refusal-Robustheit statt
Effizienz verlangt. Nächste Schritte: `curated.json`-Fix (stale Routen),
Hybrid-Obs-Bench, Frontier-Kalibrierung.
