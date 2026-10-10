# Vision-Bench P1: Unsloth E4B Hybrid MIT Admin-Auth (14/21-Basis + Auth-State)

Datum: 2026-10-10 · Plan: `.agents/plans/vision-bench-train` (P1) ·
Ledger-Vorgänger: `a73a1078` (Hybrid ohne Auth: 14/21)

## Protokoll

- Harness: `tests/e2e/agent/runner.mjs` `--reps 3 --max-turns 8 --obs hybrid`
  (`max_tokens 800`), Ziel live `https://web.mentolder.de`, sequenziell
- Modell: `unsloth/gemma-4-E4B-it-GGUF` `gemma-4-E4B-it-Q4_K_M.gguf`
  (sha256 `85a896a0…`, Q4_K_M) + `mmproj-F16.gguf`, frischer `llama-server`
  (0.6.0-dev, `-c 32768 -ngl 99`, Port 1931, exklusiv GPU1 RTX 5070 Ti)
- Auth: Playwright-`storageState` via Setup-Projekt `mentolder-setup`
  (2 passed), `tests/e2e/.auth/mentolder-website-admin.json` (1 Cookie,
  nie committet); alle 21 Läufe mit `authUsed=true`
- Testset: `tests/e2e/agent/curated.json` (7 Flows, sha16 `fc9bcbb781c92186`)
- Artefakt: `/tmp/opencode/bench-p1-hybrid.jsonl` (21 Runs, Exit 0)

## Zahlen (bestanden/3, Turns, Median-Tokens)

| Flow | P1 mit Auth | Vorgänger ohne Auth (`a73a1078`) |
|---|---|---|
| smoke-home | 3/3, [1,1,1], 1798 tok | 3/3 |
| booking-termin-tab | 3/3, [1,1,1], 2158 tok | 3/3 |
| billing-services | 3/3, [1,2,5], 5891 tok | 3/3 |
| messaging-portal-gate | 1/3, [2,6,7], 24314 tok | 2/3 |
| content-hub-editor | 0/3, [2,4,6], 20440 tok, 1 perr | 0/3 |
| admin-platform-gate | 1/3, [1,2,3], 4792 tok | 3/3 |
| admin-inbox-renders | 2/3, [1,1,8], 1534 tok, 1 perr | 0/3 |
| **Gesamt** | **13/21, 2 perr** | **14/21, 5 perr** |

## Deutung

1. **Auth wirkt wo es soll**: Inbox 0/3 → 2/3 (Rendern mit Session
   gelingt, 1 Turn). Öffentliche Flows 9/9, fast alles im 1. Turn —
   Hybrid-Obs + E4B sind auf lösbaren Seiten stark und billig.
2. **Gate-Paradox**: Mit aktiver Session fällt das Gate weg — der Agent
   muss dann Portal-Nachrichten *nutzen* statt das Gate zu *beobachten*
   (messaging 2/3 → 1/3). Gate-Checks und Auth-Modus passen nicht
   zusammen; künftig Gate-Flows ohne Auth fahren.
3. **Site-Drift**: `/admin/platform` landet aktuell auf
   `/sdlc/platform` mit „Wartungsarbeiten" (Beleg: Korpus-Screenshot
   `admin-platform-gate.png`, 2026-10-10) — 3/3 → 1/3 ist kein
   Modellregress, sondern Zieländerung. Live-Bench braucht Drift-Notiz.
4. **Editor bleibt hart**: content-hub 0/3 trotz funktionierender Session
   (wandert bis 6 Turns) — Kandidat für P2-Trainingsfokus und
   Follow-up (Zielstruktur des Editors für den Agenten unklar).
5. **Protokoll besser**: 2 statt 5 Fehler — Auth-Kontext stabilisiert
   das JSON-Verhalten mit.

## Caveats

- Live-Ziel, Läufe zeitversetzt, n=3 Reps; Site-Seite unkontrolliert
  (Wartungsseite belegt).
- `admin-inbox-anon`-Screenshot im Korpus ist blank (zu früh erfasst) —
  aus Korpus v0 ausgeschlossen, Capture-Timing prüfen.
- Nur Unsloth-Modell; Hauhau nicht re-gefahren (Vorlauf 4/21, verworfen).

## Empfehlung

P1-Gate erfüllt (reproduzierbar, reportiert). Unsloth E4B bleibt
Standard-VLM. Nächste: P2-Seed-SFT (Korpus v0 steht), danach Eval im
gleichen Protokoll; Gate-Flows künftig ohne Auth messen.
