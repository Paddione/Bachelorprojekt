# Partial p3 — bench-devprod (T901676, tests, depends_on p1, p2)

Bench-Läufe dev → prod auf dem GPU-Host plus Report. Schreibt nur
`docs/runbooks/e2e-vision-agents.md` (Brett-Sektion; `.md` steht nicht
in `s1.limits`, kein S1-Budget nötig). JSONL-Ergebnisse unter
`tests/e2e/results/` werden nicht committet.

## Task 1: Env-Reachability prüfen (fail-closed)

Steps:
1. `/healthz` auf Dev-Basis und Prod-Basis per `curl` prüfen
   (URLs aus Env, je mit Timeout).
2. Unerreichbares Env: alle Läufe dorthin überspringen und im Report
   als Lücke benennen — nie als Erfolg werten.

Verify:
- `curl -sm 10 "$BRETT_DEV_URL/healthz"; echo "dev=$?"`
- `curl -sm 10 "$BRETT_URL/healthz"; echo "prod=$?"`
- Negativ-Probe (fail-closed-Nachweis): `cd tests/e2e && BRETT_URL=http://127.0.0.1:9 npx playwright test brett-replay` — expected: FAIL (Suite muss bei totem Env rot gehen, nie falsch-grün)

## Task 2: Modell 1 benchen (dev, dann prod)

Steps:
1. FreeToken stoppen (VRAM exklusiv), `llama-server` mit
   Unsloth-E4B-GGUF plus mmproj auf Port 1931 starten, Visionsprobe
   mit einem Screenshot-Prompt (Antwort muss Bildbezug zeigen).
2. Bench dev: Runner mit `curated-brett.json`-Brett-Datei,
   `AGENT_BASE_URL` = Dev-Basis, Reps laut Bench-Protokoll, Out
   `tests/e2e/results/bench-brett-dev-unsloth.jsonl`.
3. Bench prod: gleiche Datei, `AGENT_BASE_URL` = Prod-Basis, Out
   `tests/e2e/results/bench-brett-prod-unsloth.jsonl`.
4. Serve stoppen, FreeToken-Zustand wie vorgefunden hinterlassen.

Verify:
- `node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated-brett.json --reps 1 --out /tmp/probe.jsonl --max-turns 2` (Probe gegen Dev, danach echte Reps)

## Task 3: Modell 2 benchen (dev, dann prod)

Steps:
1. `llama-server` mit Hauhau-E4B-GGUF plus mmproj auf Port 1931,
   Visionsprobe wie in Task 2.
2. Bench dev und prod analog, Out-Dateien mit `-hauhau`-Suffix.
3. Serve stoppen, Vorzustand wiederherstellen.

Verify:
- JSONL-Zeilen je Lauf mit `flow`, `rep`, `pass`, `turns`,
  `protocol_errors`, `wall_ms`, `tokens`, Orakel-Ergebnis (Schema
  aus Bench-Protokoll einhalten).

## Task 4: Qwen-Fähigkeitsprobe

Steps:
1. `qwen3.5-4b-quasar` auf Visionfähigkeit prüfen (mmproj oder
   nativer Vision-Pfad).
2. Bei Text-only: aus der Matrix streichen, Streichung im Report mit
   einer Zeile begründen. Bei Vision: wie Task 2/3 benchen.

Verify:
- Entscheider-Zeile im Report (drin oder draußen, mit Grund).

## Task 5: Report und Runbook

Steps:
1. Kennzahlen je Flow, Modell und Env aus den JSONL-Dateien
   zusammenfassen: Erfolgsrate, Steps bis `done`, JSON-Quote,
   Grounding-Treffer, Tokens pro Flow.
2. `docs/runbooks/e2e-vision-agents.md` um die Brett-Sektion
   ergänzen: Flow-Tabelle, Serve-Matrix, Env-Ablauf, Report-Zahlen,
   bekannte Lücken (unerreichbare Envs, Qwen-Entscheid).
3. JSONL-Dateien bleiben unter `tests/e2e/results/` (kein Commit).

Verify:
- `grep -c "brett-" docs/runbooks/e2e-vision-agents.md` (größer 0)
