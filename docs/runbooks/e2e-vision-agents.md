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

## Brett-Vision-Training (T901676)

SSOT: `tests/e2e/agent/curated-brett.json` (5 Flows; eigene Datei, weil der
Runner genau eine `AGENT_BASE_URL` pro Lauf kennt). Auth-Flows brauchen
`--auth` aus dem Setup-Projekt `brett-mentolder-setup`
(`tests/e2e/.auth/mentolder-brett.json`, nie committet).

### Flow-Tabelle

| id | auth | start_url | goal_checks | source_spec |
|----|------|-----------|-------------|-------------|
| brett-smoke-home | nein | `/` | urlMatches, textContains | fa-27-brett.spec.ts |
| brett-guest-share-link | nein | `/share/this-token-does-not-exist` | urlContains, textContains | brett-share-link.spec.ts |
| brett-session-lifecycle | ja | `/?room=e2e-agent-lifecycle` | urlContains, textMatches | brett-session-lifecycle.spec.ts |
| brett-figure-place-move | ja | `/?room=e2e-agent-figures` | apiEquals, textContains | brett-undo-redo.spec.ts |
| brett-undo-redo | ja | `/?room=e2e-agent-undoredo` | apiEquals | brett-undo-redo.spec.ts |

Anonyme Flows beobachten das oauth2-Proxy-Auth-Gate (Pocket ID); die
`apiEquals`-Pfade spiegeln `GET /api/sessions/:room/snapshot`
(`{state:{figures}}`, scripted Beleg fa-27 T24).

### Serve-Matrix

| Modell | GGUF (`~/models/`) | mmproj | Port |
|--------|--------------------|--------|------|
| gemma4-e4b-unsloth | `gemma4-e4b-unsloth/gemma-4-E4B-it-Q4_K_M.gguf` | `mmproj-F16.gguf` | 1931 |
| gemma4-e4b-hauhau | `gemma4-e4b-hauhau/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | `mmproj-Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-f16.gguf` | 1931 |

Sequenziell: ein Modell zur Zeit, VRAM-Hog vorher stoppen (GPU-Host:
`qwen38-gsq-iq3xxs.service` auf :1919 — 2026-10-09 war das der Beleger,
nicht FreeToken), danach Serve stoppen und Vorzustand wiederherstellen.
Start wie oben (`-c 32768 -ngl 99`, GPU per `CUDA_VISIBLE_DEVICES`),
Visionsprobe mit Screenshot-Prompt (Antwort muss Bildbezug zeigen).
`qwen3.5-4b-quasar` ist aus der Matrix gestrichen: text-only (kein
mmproj, 0 Vision-Tower-Tensoren im GGUF).

### Env-Ablauf dev → prod

1. Reachability: `/healthz` auf Dev- und Prod-Basis per `curl` (Timeout).
2. Pro Env zwei Läufe (Datei kennt beide Modi, Auswertung getrennt nach
   `authUsed`): ohne `--auth` (anonyme Flows; Auth-Flows brechen mit
   `auth-required` nach 0 Turns ab) und mit `--auth` (Auth-Flows;
   anonyme Flows sehen dann das Board statt des Gates).
3. Dev-Basis ist die direkte App (`http://brett.dev.mentolder.de`);
   Ergebnisdateien `tests/e2e/results/bench-brett-<dev|prod>-<modell>-<noauth|auth>.jsonl`
   (Laufzeit, kein Commit).

```bash
AGENT_BASE_URL="https://brett.mentolder.de" AGENT_MODEL_URL="http://127.0.0.1:1931" \
node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated-brett.json \
  --reps 3 --auth tests/e2e/.auth/mentolder-brett.json --out bench-brett-prod.jsonl
```

### Bench-Report 2026-10-09 (reps 3, max-turns 12, 120 Läufe)

Prod, jeweils aus dem passenden Auth-Modus (anonyme Flows aus noauth,
Auth-Flows aus auth); Dev 0/60 (Lücke, siehe unten).

| Flow | unsloth | hauhau |
|------|---------|--------|
| brett-smoke-home | 3/3, ~2 Turns, ~4,3k Tok | 2/3, ~7 Turns, ~21k Tok |
| brett-guest-share-link | 3/3, ~2 Turns, ~4,9k Tok | 1/3, ~9 Turns, ~31k Tok |
| brett-session-lifecycle | 3/3, ~6 Turns, ~25k Tok | 2/3, ~9 Turns, ~33k Tok |
| brett-figure-place-move | 0/3 (nur apiEquals rot) | 0/3 (nur apiEquals rot) |
| brett-undo-redo | 0/3 (nur apiEquals rot) | 0/3 (nur apiEquals rot) |

- Messbar (ohne apiEquals): unsloth 9/9, hauhau 5/9. Hauhau scheitert
  bei erfülltem Orakel oft am fehlenden `done` (mehr Turns, höhere
  Token-Kosten).
- JSON-Quote (Aktionen ohne Repair): hauhau ~99 %, unsloth ~90 %.
- Visionsproben: unsloth 3 s ("Sign in to brett" korrekt gelesen),
  hauhau 0,8 s (korrekt, kein Thinking-Bloat in dieser Probe —
  `max_tokens >= 800` bleibt Sicherheitspuffer).
- Grounding-Treffer: nicht instrumentiert (der Runner protokolliert
  keine Klick-Ziele) — Metrik im Protokoll, aber ohne Datenquelle.
- E4-Befund: `readState` liefert immer `apiState: {}`, daher sind
  beide apiEquals-Flows Runner-Fähigkeitsproben (rot bis der Runner
  REST-Snapshots lädt), kein Modellvergleich. Kein Runner-Edit in
  diesem Ticket (Leitplanke); Follow-up-Ticket für `apiState`.

### Bekannte Lücken

- Dev-Brett benchuntauglich: `http` → `/auth/login` liefert
  `{"error":"internal_error"}` (In-App-OIDC defekt); `https` →
  oauth2-Proxy mit nicht existierendem OAuth-Client. Keine
  Session-Möglichkeit ohne `BRETT_OIDC_SECRET` (nicht verfügbar;
  Auth-State nur via Setup-Projekt). Dev-Läufe 0/60 als Gap-Daten.
- Qwen aus der Matrix gestrichen (text-only, siehe Serve-Matrix).
- Template-Guard-Test in brett-roles.spec.ts ohne `BRETT_OIDC_SECRET`
  nicht lauffähig (skip, Handler-quellentreu geschrieben).
