# Proposal: brett-vision-training

Ticket: T901676 · Slug: `brett-vision-training` · Pfad: feature

## WARUM

T901645 hat den Vision-Agent-Harness geliefert (Runner, Orakel,
`curated.json` mit 7 Website-/Portal-/Admin-Flows, Bench-Runbook). Das Brett
(`components/brett`, 3D-Systembrett) und das Nextcloud-Whiteboard
(`board.`-Service) sind darin nicht vertreten: 0 kuratierte Flows, obwohl das
Brett mit 3D-Canvas, Figuren-Grounding und Session-Lifecycle das reichste
Navigationstrainingsgelände im Repo ist. Gleichzeitig hat die scripted Suite
Lücken: das Replay-Flag (`window.__brettFeatures['replay']`, dark-launch)
hat 0 Specs, `fa-24-whiteboard.spec.ts` prüft nur Erreichbarkeit.

## Request + Q&A-Ergebnis (2026-10-09)

User-Request: Vision-Modelle am Webinterface trainieren lassen (üben, kein
Fine-Tuning), gründlich E2E testen, dev → prod. Entschieden per Q&A:

1. Ziel-UI: Whiteboard-App (Brett primär, Nextcloud-Whiteboard sekundär).
2. Trainieren = Üben via E2E-Läufe (Screenshots, Bench-Protokoll), kein
   GPU-Fine-Tuning.
3. Scope = Playwright + Vision kombiniert (scripted Suite bleibt CI-Gate,
   Vision-Bench ergänzt Exploration).

## Brainstorming-Entscheidungen

- **E1 Primär/Sekundär:** Brett ist das Trainingsgelände (tiefe
  Interaktion, REST-Snapshots als Orakel); Nextcloud-Whiteboard bekommt
  funktionale scripted E2E (Upstream-Container, kein Vision-Schwerpunkt).
- **E2 Leitplanke T901645 bleibt:** scripted Specs = CI-Gate, Agent-Bench
  nightly/advisory auf GPU-Host (kein VLM auf GitHub-Runnern).
  Modellvergleich nur als Bench-Report (JSONL), nicht als Code.
- **E3 Eigene Flow-SSOT:** `tests/e2e/agent/curated-brett.json` (neu),
  weil der Runner genau eine `AGENT_BASE_URL` pro Lauf kennt und
  Brett-Flows eine andere Basis brauchen als Website-Flows. Kein
  Runner-Umbau, gleiche Schema-Validierung via `oracle.mjs`.
- **E4 Orakel ohne neue Check-Typen:** `apiEquals` gegen Brett-REST-
  Snapshots verifiziert Figuren-Grounding (Klick → Snapshot-Diff);
  `urlContains`/`textContains` für Navigation. Reicht der Typ nicht,
  meldet Execute das als Befund statt still zu erweitern.
- **E5 Modelle sequenziell:** `gemma4-e4b-unsloth` und
  `gemma4-e4b-hauhau` (beide mit mmproj verifiziert), je Flow Reps laut
  Bench-Protokoll, ein Modell und ein Flow zur Zeit. `qwen3.5-4b-quasar`
  nur falls visionfähig, sonst gestrichen mit Notiz.
- **E6 Auth via Setup-State:** Auth-Flows nutzen Playwright-`storageState`
  aus dem bestehenden Setup-Projekt (`brett-mentolder-setup`), analog zum
  Runbook-Abschnitt Auth. Runner loggt sich nie selbst ein.
- **E7 Bestehende Specs erweitern:** Brett-Audit-Lücken landen in den
  passenden `brett-*.spec.ts`-Dateien (Budget vorher per
  `residual_budget` prüfen); nur Replay bekommt eine neue Datei, weil es
  keine passende gibt.

## WAS (Schnitt, entschieden)

1. **p1 scripted Lücken:** `brett-replay.spec.ts` (neu, flag-sensitiv),
   `fa-24-whiteboard.spec.ts` funktional erweitern, Brett-Audit plus
   Erweiterung bestehender Specs.
2. **p2 kuratierte Brett-Flows:** 5 Flows in `curated-brett.json`, jeder
   mit `source_spec` (scripted Nachweis).
3. **p3 Bench dev → prod:** Serve beider Modelle, Reachability-Probe,
   Bench-Läufe dev dann prod, Report + Runbook-Ergänzung.

## Nicht-Ziele

Kein Fine-Tuning, keine CI-Integration des Agent-Laufs, keine
Runner-/Orakel-Kernänderung, keine Whiteboard-Upstream-Änderung, kein
Korczewski-CI-Matrix-Eintrag (Brand frozen, T002602).

## Risiken

- VRAM exklusiv: FreeToken muss vor `llama-server` stoppen (Runbook).
- Port 1931-Serve ist Handarbeit auf dem GPU-Host, nicht CI-fähig.
- Unerreichbares Env wird übersprungen und als Lücke berichtet, nie
  als Erfolg gewertet (fail-closed).
- `qwen3.5-4b-quasar` ohne mmproj-Nachweis: Fähigkeitsprobe in p3,
  bei Text-only Streichung.
