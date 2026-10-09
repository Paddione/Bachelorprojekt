# E2E Vision Agents — Serve & Bench (T901645)

Harness: `tests/e2e/agent/runner.mjs` (Agent-Loop) + `oracle.mjs`
(deterministische Checks) + `curated.json` (SSOT, 7 Flows aus existierenden
Specs). Der Runner spricht den VLM-Endpunkt über `AGENT_MODEL_URL` (Default
`http://127.0.0.1:1931`) an, das Bench-Ziel über `AGENT_BASE_URL` (Default
`http://localhost:4321`, lokale Dev-Instanz).

## Serve

Serve-Pfad ist `llama-server`, weil FreeToken über HTTP grundsätzlich kein
Vision kann — für kein Modell und mit keinem Checkpoint
(`docs/runbooks/freetoken-native.md`, Vision-Einschränkung T900009). Start
mit `--mmproj` (Modell-/mmproj-Paare folgen dem `mmprojPath`-Feld in
`scripts/llm/loadouts.json`):

```bash
llama-server -m ~/models/gemma4-e4b-unsloth/gemma-4-E4B-it-Q4_K_M.gguf \
  --mmproj ~/models/gemma4-e4b-unsloth/mmproj-F16.gguf \
  --port 1931 -c 32768 -ngl 99
```

(Pfade als Beispiel der verifizierten E4B-Ablage; Port 1931 aus
`AGENT_MODEL_URL`. NICHT den Eintrag `gemma12-vision` als Beispiel nehmen —
decommissioned, GGUF entfernt.) Hinweis: FreeToken vorher stoppen, VRAM ist
exklusiv.

## Thinking-Bloat-Budget

Der Runner setzt `max_tokens >= 800` pro VLM-Call, weil das Hauhau-E4B ca.
300–400 Thinking-Tokens vor der Antwort erzeugt und ein enges Fenster sonst
eine leere Antwort liefert (Beleg: Vision-Smoke-Messung 2026-10-09,
Training-Memory-Ledger).

## Bench-Protokoll

Läufe sequenziell: ein Modell, ein Flow zur Zeit. Flags angelehnt an
`scripts/llm/bench-orchestration.mjs`:

```bash
node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated.json \
  --model "$AGENT_MODEL_URL" --reps 3 --out bench-<label>.jsonl
```

Metriken pro Flow: Erfolgsrate, Steps bis `done`, JSON-Quote (valide
Aktionen ohne Repair), Grounding-Treffer (Klick landet auf dem
Zielelement), Tokens pro Flow. Die JSONL-Records tragen je Lauf `flow`,
`rep`, `pass`, `turns`, `protocol_errors`, `wall_ms`, `tokens`, `error` und
das Orakel-Ergebnis.

## Auth

Der Runner loggt sich nie selbst ein und kennt keine Credentials. Flows mit
`"auth": true` in `curated.json` (`content-hub-editor`, `admin-inbox-renders`)
brauchen einen fertigen Playwright-`storageState`:

```bash
# 1. State erzeugen (bestehendes Setup-Projekt, braucht CRON_SECRET)
cd tests/e2e && CRON_SECRET=... WEBSITE_URL=https://web.mentolder.de \
  npx playwright test --project mentolder-setup
# 2. Runner damit starten (Flag oder Env AGENT_AUTH_STATE)
node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated.json \
  --auth tests/e2e/.auth/mentolder-website-admin.json --out bench-auth.jsonl
```

- Ohne `--auth` brechen Auth-Flows mit `error: "auth-required"` nach 0 Turns
  ab (fail-closed, kein anonymes Herumwandern). Eine fehlende oder ungueltige
  State-Datei bricht den Start ab, bevor ein Browser startet.
- State-Dateien enthalten Session-Cookies und werden nie committet. Beleg:
  `git check-ignore -v tests/e2e/.auth/user.json` (Regel `e2e/.auth/` in
  `tests/.gitignore`).
- Jede JSONL-Zeile traegt `authUsed`. Laeufe mit und ohne Auth getrennt
  auswerten.
- GitHub Actions: `e2e.yml` erzeugt den State bereits ueber das Secret
  `CRON_SECRET` (Schritt `mentolder-setup`). Ein Agent-Lauf in CI braucht
  keine neuen Secrets, aber einen erreichbaren VLM-Endpunkt (`AGENT_MODEL_URL`);
  den gibt es auf GitHub-Runnern nicht. Deshalb laeuft der Agent weiter lokal
  oder auf dem GPU-Host.

## Leitplanke

Agenten-Läufe laufen nightly und advisory; die scripted Specs in
`tests/e2e/specs/` bleiben das CI-Gate. Kein Modellvergleich als Code,
keine CI-Integration im MVP (`proposal.md`, Nicht-Ziele).
