---
title: opencode-Provider llamacpp-mtp routet auf Bonsai-Port statt Gemma
ticket_id: T002159
domains: [infra, test]
status: plan_staged
---

# opencode-llamacpp-port-drift — Implementation Plan

Behebt die Doppeldefinition des opencode-Providers `llamacpp-mtp`. Die Projekt-Config
`.opencode/opencode.jsonc` überschreibt den korrekt gesyncten Provider aus
`.opencode/agent-models.jsonc` mit dem Bonsai-Port `8093` — Gemma4-12B ist dadurch
unerreichbar, und sobald der Bonsai-Server läuft, liefert derselbe Provider stillschweigend
Antworten eines anderen Modells. Design-Spec und Live-Verifikation:
`openspec/changes/opencode-llamacpp-port-drift/design.md`.

## File Structure

| Datei | Art der Änderung |
|---|---|
| `.opencode/opencode.jsonc` | Provider-Block `llamacpp-mtp` ersatzlos entfernen |
| `.opencode/agent-models.jsonc` | `limit.context` 4096 → 16384; `name`-Beschreibung an die realen Skript-Flags angleichen |
| `tests/spec/llm-local-dev.bats` | fünf neue `@test`-Blöcke als Regressionsschutz (bereits im Stage-Commit enthalten) |

Keine dieser Dateien ist S1-überwacht — die Extensions `.jsonc` und `.bats` stehen nicht in
`docs/code-quality/gates.yaml → s1.limits`, und keine ist in `docs/code-quality/baseline.json`
eingetragen. Es gibt daher kein Zeilenbudget zu beachten. S2 (Import-Zyklen), S3 (Brand-Domains)
und CQ02 (`any`-Typen) sind nicht berührt: es wird kein TypeScript und kein Code unter
`website/src/` angefasst.

<!-- vitest: kein neuer Test nötig, weil ausschließlich JSONC-Konfiguration und BATS-Tests
     geändert werden — kein Code unter website/src/lib oder website/src/pages/api. -->

## Task 1 — RED-Nachweis der Regressionstests

Die fünf Tests liegen bereits in `tests/spec/llm-local-dev.bats` (Stage-Commit). Dieser Task
bestätigt vor jeder Config-Änderung, dass sie den Bug tatsächlich fangen.

```bash
bats tests/spec/llm-local-dev.bats
```

expected: FAIL — genau drei Tests müssen rot sein:

- `opencode.jsonc defines no duplicate llamacpp-mtp provider` — rot, weil der Block noch existiert.
- `no .opencode config points a baseURL at the Bonsai port 8093` — rot wegen `opencode.jsonc:71`.
- `agent-models.jsonc declares the full 16384 context for Gemma4` — rot, weil dort noch `4096` steht.

Grün sein müssen dagegen bereits jetzt die beiden Guards, die verhindern, dass Task 2 zu viel
entfernt:

- `agent-models.jsonc still defines the llamacpp-mtp provider`
- `agent-models.jsonc points llamacpp-mtp at the Gemma port 8091`

Ist dieses Muster nicht exakt so, stimmt die Diagnose nicht mehr mit dem Repo-Stand überein —
dann zuerst die Design-Spec gegen den Ist-Zustand abgleichen, nicht die Tests anpassen.

## Task 2 — Duplikat-Provider aus `.opencode/opencode.jsonc` entfernen

Den kompletten `"llamacpp-mtp"`-Eintrag aus dem `provider`-Objekt streichen (aktuell Zeilen 68–84,
vom Key bis zur schließenden Klammer inklusive des trennenden Kommas zum folgenden
`"lmstudio"`-Eintrag).

Randbedingungen:

- Der `"lmstudio"`-Block (`:1234`, leere `models`) bleibt unverändert — er ist kein Duplikat aus
  `agent-models.jsonc`.
- Das umschließende `"provider"`-Objekt bleibt bestehen; es darf nicht leer zurückbleiben, da
  `lmstudio` darin verbleibt.
- Die Datei ist JSONC mit Kommentaren. Änderung ausschließlich per Texteditor-Edit vornehmen —
  **kein** `jq`-Roundtrip, der sämtliche Kommentare verwerfen würde.

Nach dem Entfernen stammt der Provider-Key ausschließlich aus `agent-models.jsonc` und wird über
`Taskfile.yml:223` → `scripts/opencode-sync-agents.sh` in `~/.config/opencode/opencode.jsonc`
gespiegelt.

Syntax-Prüfung (JSONC-Kommentare vorher strippen, damit `jq` parsen kann):

```bash
node -e "const s=require('fs').readFileSync('.opencode/opencode.jsonc','utf8'); \
  const j=s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); \
  const o=JSON.parse(j); \
  if ('llamacpp-mtp' in o.provider) { console.error('FAIL: provider still present'); process.exit(1); } \
  if (!('lmstudio' in o.provider)) { console.error('FAIL: lmstudio was removed too'); process.exit(1); } \
  console.log('OK: valid JSON, llamacpp-mtp gone, lmstudio intact');"
```

## Task 3 — Kontext und Beschreibung in `.opencode/agent-models.jsonc` korrigieren

Im Modell-Eintrag `gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` (aktuell Zeilen 10–16):

- `"context": 4096` → `"context": 16384`. Belegt durch `GET http://127.0.0.1:8091/props` →
  `n_ctx: 16384`; das Startskript setzt kein `-np`, der volle Kontext gehört einem Slot.
- `"output"` bleibt bei `4096` — das ist ein Generierungslimit, kein Fenster, und vom Befund
  nicht betroffen.
- Den `name`-Text an die tatsächlichen Flags des Startskripts angleichen. Zu entfernen sind die
  Angaben `-np 4 parallel slots`, `4096 ctx/slot`, `Q8_0 KV cache`, `-fit auto-VRAM-fit`,
  `auto-sleeps GPU after 20min idle` und `--spec-draft-n-max 6`; keines dieser Flags steht im
  Skript. Zu nennen sind stattdessen `--spec-type draft-mtp`, `--spec-draft-n-max 2`, `-ngl 999`,
  `-c 16384`, `--jinja`.
- Den Startverweis `start via Desktop\\start-gemma4-mtp-server.bat first` durch den tatsächlich
  verwendeten Pfad ersetzen: `C:\\Users\\PatrickKorczewski\\.lmstudio\\start-gemma4-12b-mtp.ps1`.

Der `baseURL`-Wert `http://127.0.0.1:8091/v1` bleibt unverändert — er war von Anfang an korrekt.

Syntax-Prüfung:

```bash
node -e "const s=require('fs').readFileSync('.opencode/agent-models.jsonc','utf8'); \
  const j=s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,''); \
  const o=JSON.parse(j); \
  const m=o.provider['llamacpp-mtp'].models['gemma-4-12B-it-qat-UD-Q4_K_XL.gguf']; \
  if (m.limit.context !== 16384) { console.error('FAIL: context is '+m.limit.context); process.exit(1); } \
  console.log('OK: valid JSON, context 16384');"
```

## Task 4 — GRÜN-Nachweis und Sync-Parität

Erst die Spec-Tests, dann die Parität zwischen Sync-Quelle und globaler Config prüfen.

```bash
bats tests/spec/llm-local-dev.bats
bats tests/spec/opencode-local-model-runner.bats
```

Alle 18 Tests in `llm-local-dev.bats` müssen grün sein.
`opencode-local-model-runner.bats` pinnt die Modell-Referenz in
`.github/workflows/opencode.yml` und darf durch diese Änderung nicht rot werden — der
Provider-Key `llamacpp-mtp` bleibt ja bestehen.

Anschließend die Sync-Pipeline einmal fahren und verifizieren, dass die globale Config danach
den Gemma-Port trägt:

```bash
bash scripts/opencode-sync-agents.sh
grep -A4 '"llamacpp-mtp"' ~/.config/opencode/opencode.jsonc | grep 8091
```

Findet der `grep` nichts, hat die Sync-Pipeline den Provider nicht übertragen — dann ist der
Fix unvollständig, weil opencode ohne Projekt-Definition ausschließlich auf die globale Config
zurückfällt.

## Task 5 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` wurde beim Stagen bereits ausgeführt und ließ
`website/src/data/test-inventory.json` unverändert bei 360 Einträgen — das Inventar indexiert
Test-IDs, nicht jeden rohen `@test`-Namen, sodass die fünf neuen Blöcke keinen neuen Eintrag
erzeugen. `task freshness:regenerate` bleibt trotzdem Pflichtschritt: es aktualisiert die übrigen
Freshness-Artefakte, und der Inventory-Check in `.github/workflows/ci.yml` vergleicht gegen den
committeten Stand. Ändert der Lauf doch eine Datei, wird sie mitcommittet.

Zu erwarten ist außerdem, dass `.github/workflows/ci.yml:191` bei dieser PR anschlägt: dort ist
ein eigener Check auf Änderungen an `.opencode/agent-models.jsonc` verdrahtet. Das ist gewollt
und kein Fehlersignal.

Manuelle Abnahme nach dem Merge (nicht CI-automatisierbar, da ein laufender Windows-Server nötig
ist): mit gestartetem `start-gemma4-12b-mtp.ps1` in opencode das Modell
`llamacpp-mtp/gemma-4-12B-it-qat-UD-Q4_K_XL.gguf` auswählen und eine Antwort erzeugen.
