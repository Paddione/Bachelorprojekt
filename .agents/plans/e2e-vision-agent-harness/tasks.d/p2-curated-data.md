# Partial p2 — curated-data (T901645, impl, depends_on p1)

SSOT `tests/e2e/agent/curated.json` mit 7 Flows aus existierenden Specs plus
Runbook `docs/runbooks/e2e-vision-agents.md` (Serve + Bench-Protokoll).
Beide Dateien neu; `.json`/`.md` stehen nicht in `s1.limits`
(`docs/code-quality/gates.yaml`), daher kein S1-Budget nötig.
Schema-Validierung von `curated.json` liegt im Runner aus p1.
Korczewski bleibt außen vor (Brand frozen, T002602): alle Flows laufen
gegen `AGENT_BASE_URL` (Default `http://localhost:4321`).

## Task 1: curated.json mit 7 Flows aus existierenden Specs anlegen

Steps:
- Lege `tests/e2e/agent/curated.json` an: Array `flows`, je Eintrag mit
  `id`, `start_url`, `goal_checks` (Liste aus `type` + `value`), `source_spec`
  (Pfad der Quell-Spec). Check-`type`-Namen exakt wie im p1-Orakel
  (`urlContains`, `urlMatches`, `textContains`, `textMatches`, `apiEquals` —
  camelCase, kein snake_case).
- Übernimm genau diese 7 Flows (Tags per grep in `tests/e2e/specs/` verifiziert):
  - `smoke-home` ab `/`, Quell-Spec `tests/e2e/specs/fa-10-website.spec.ts` (`@smoke`)
  - `booking-termin-tab` ab `/termin`, Quell-Spec `tests/e2e/specs/fa-16-booking.spec.ts` (`@booking`)
  - `billing-services` ab `/leistungen`, Quell-Spec `tests/e2e/specs/fa-21-billing.spec.ts` (`@billing`)
  - `messaging-portal-gate` ab `/portal?section=nachrichten`, Quell-Spec `tests/e2e/specs/fa-01-messaging.spec.ts` (`@messaging`)
  - `content-hub-editor` ab `/admin/inhalte`, Quell-Spec `tests/e2e/specs/fa-content-hub-editor.spec.ts` (`@content-hub`)
  - `admin-platform-gate` ab `/admin/platform`, Quell-Spec `tests/e2e/specs/fa-41-admin-hub.spec.ts` (`@admin`)
  - `admin-inbox-renders` ab `/admin/inbox`, Quell-Spec `tests/e2e/specs/fa-admin-inbox.spec.ts` (`@admin`, `@messaging`)
- Leite jedes `goal_checks`-Paar aus der genannten Quell-Spec ab (dortige
  `toHaveURL`-/Sichtbarkeits-Assertions, z. B. Redirect `/termin` nach
  `/kontakt`, `[data-testid="inbox-app"]` in der Inbox-Spec).
- Halte alle URLs relativ; Basis kommt aus `AGENT_BASE_URL` (S3: keine
  Brand-Domain als Literal in Daten oder Runbook).
Verify:
- `jq -e '.flows | length == 7' tests/e2e/agent/curated.json`
- `jq -e '[.flows[] | select(.id and .start_url and .goal_checks and .source_spec)] | length == 7' tests/e2e/agent/curated.json`
- `for f in $(jq -r '.flows[].source_spec' tests/e2e/agent/curated.json); do test -f "$f"; done && echo "alle Quell-Specs vorhanden"`

## Task 2: Runbook mit Serve-Befehlen und Bench-Protokoll schreiben

Steps:
- Lege `docs/runbooks/e2e-vision-agents.md` an mit den Abschnitten
  Serve, Thinking-Bloat-Budget, Bench-Protokoll, Leitplanke.
- Abschnitt Serve: `llama-server` ist der Serve-Pfad, weil FreeToken über
  HTTP grundsätzlich kein Vision kann (`docs/runbooks/freetoken-native.md`,
  Vision-Einschränkung T900009). Dokumentiere Start mit `--mmproj`:
```bash
llama-server -m ~/models/gemma4-e4b-unsloth/gemma-4-E4B-it-Q4_K_M.gguf \
  --mmproj ~/models/gemma4-e4b-unsloth/mmproj-F16.gguf \
  --port 1931 -c 32768 -ngl 99
```
  (Pfade als Beispiel der verifizierten E4B-Ablage; Muster für
  Modell-/mmproj-Paare: `mmprojPath`-Feld in `scripts/llm/loadouts.json`.
  NICHT den Eintrag `gemma12-vision` als Beispiel nehmen — decommissioned,
  GGUF entfernt.) Port 1931 aus `AGENT_MODEL_URL` (`design.md`). Hinweis:
  FreeToken vorher stoppen (VRAM exklusiv).
- Thinking-Bloat-Budget: Runner setzt `max_tokens >= 800` pro VLM-Call,
  weil das Hauhau-E4B ca. 300–400 Thinking-Tokens vor der Antwort
  erzeugt und ein enges Fenster sonst eine leere Antwort liefert (Beleg:
  Vision-Smoke-Messung 2026-10-09, Training-Memory-Ledger).
- Bench-Protokoll: Läufe sequenziell (ein Modell, ein Flow zur Zeit),
  `--reps 3`, Flags angelehnt an `scripts/llm/bench-orchestration.mjs`
  (`--reps`, `--out bench-<label>.jsonl`). Metriken pro Flow:
  Erfolgsrate, Steps bis `done`, JSON-Quote (valide Aktionen ohne
  Repair), Grounding-Treffer (Klick landet auf dem Zielelement),
  Tokens pro Flow.
- Leitplanke: Agenten-Läufe laufen nightly und advisory; die scripted
  Specs in `tests/e2e/specs/` bleiben das CI-Gate. Kein Modellvergleich
  als Code, keine CI-Integration im MVP (`proposal.md`, Nicht-Ziele).
Verify:
- `grep -c 'llama-server\|max_tokens >= 800\|advisory' docs/runbooks/e2e-vision-agents.md`
- `node tests/e2e/agent/runner.mjs --flows tests/e2e/agent/curated.json --help` zeigt die Flags aus dem Runbook
- Commit als `docs(agents): vision-agent runbook and curated flows` (Scope aus der erlaubten Liste — `e2e` wird von validate-commit-msg abgelehnt)
