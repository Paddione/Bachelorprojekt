---
title: "factory-model-routing-fix — Implementation Plan"
ticket_id: T002582
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-model-routing-fix — Implementation Plan

_Ticket: T002582_

## File Structure

```
NEU:
  tests/spec/local-llm-proxy/gateway-consumer-lint.bats   der in der SSOT zugesagte, nie gebaute Lint

UMBENANNT:
  scripts/factory/provider-register-bonsai.sh -> scripts/factory/provider-register-local.sh

GEAENDERT:
  scripts/factory/route-provider.sh    OPUS_FALLBACK + Emergency-Fallback auf Gateway/FACTORY_MODEL_ID
  scripts/factory/pipeline.mjs         Tier 'flash' vom toten LM-Studio-Chatmodell auf das Gateway
  Taskfile.llm.yml                     toten Task 'start-bonsai' entfernt (Skript existiert nicht)

AUSSERHALB DES REPOS (dokumentiert, nicht versioniert):
  ~/.config/factory/autopilot.env      ANTHROPIC_*_MODEL + CLAUDE_CODE_SUBAGENT_MODEL
  tickets.factory_model_slots          model_id je Phase
```

## Ausgangslage

`bash scripts/llm/routing-check.sh` meldete am 2026-08-02 sechsmal `FEHLT`. Jede
Modellreferenz der Factory zeigte auf einen Namen, den kein Backend serviert:

| Stelle | zeigte auf | Realitaet |
|---|---|---|
| `autopilot.env:16-19` | `gemma-4-12b` | Gateway `:18235` serviert `gemma26-factory` |
| `autopilot.env:20` | `ternary-bonsai-27b` | `:8093` serviert seit T002551 den bge-Reranker |
| `factory_model_slots` (3 Phasen) | `gemma-4-12b` | dito |
| `provider-register-bonsai.sh` | `ternary-bonsai-27b` @ `:8093` | wuerde Implement/Review auf einen Reranker leiten |
| `route-provider.sh:49` | `gemma-4-12b` @ `:18235` | Name loest nicht auf |
| `route-provider.sh:154` | `gemma-4-12b` @ `:1234` | LM Studio serviert dort NUR Embedding/Reranker |
| `pipeline.mjs:22` | `qwythos-9b-v2` @ `:1234` | dito — Tier `flash` war unbesetzt |
| `Taskfile.llm.yml:272` | `start-bonsai-server.ps1` | Datei existiert nicht |

Zwei Befunde ueber die reine Drift hinaus:

1. `provider-register-bonsai.sh` verletzte seine **eigene** SSOT. `openspec/specs/software-factory.md`
   verlangt das Gateway und „never a backend port directly"; das Skript schrieb `:8093`.
2. Der in `openspec/specs/local-llm-proxy.md` beschriebene statische Lint war **nie
   implementiert**. Der einzige `:8093`-Test prueft die Ausgabe von `route-provider.sh`,
   nicht den Inhalt der Dateien — die vier Literale fing niemand ab.

## Task 1 — RED: den zugesagten Lint bauen

`tests/spec/local-llm-proxy/gateway-consumer-lint.bats`, vier Tests:
Positiv-Anker (jede ueberwachte Datei existiert — sonst waeren die Negativaussagen
vakuos), Backend-Port-Literale, zurueckgezogene Modell-IDs, und `.ps1`-Verweise aus
`Taskfile.llm.yml`. Kommentarzeilen sind ausgenommen, damit die Drift dokumentierbar
bleibt. Prueflauf gegen den Ist-Stand muss 3 von 4 rot zeigen.

## Task 2 — GREEN: die Routing-Flaechen korrigieren

Skript umbenennen und modellneutral machen (`FACTORY_MODEL_ID`, Default
`gemma26-factory`, `base_url` immer das Gateway). `route-provider.sh` und
`pipeline.mjs` auf denselben Regler ziehen. Toten Taskfile-Eintrag entfernen.

`.opencode/agent-models.jsonc` bleibt beim Modell-ID-Lint **aussen vor** und ist nur
vom Port-Lint erfasst: die Datei ist ein Auswahlkatalog fuer den opencode-Modellwaehler,
keine Route. Ein veralteter Eintrag dort erzeugt einen sichtbaren Auswahlfehler, nicht
die stille Fehlleitung, gegen die dieser Lint gebaut ist. Ihre Bereinigung ist eine
Praeferenzentscheidung und gehoert nicht in einen Bugfix.

## Task 3 — Mutationstest des Lints

Eine echte Verletzung in `route-provider.sh` einschleusen, Lint muss rot werden,
danach zurueckrollen. Ohne diesen Schritt belegt ein gruener Lint nichts.

## Task 4 — Laufzeit nachziehen (ausserhalb des Repos)

`~/.config/factory/autopilot.env` und `tickets.factory_model_slots` auf
`gemma26-factory` setzen. Nachweis: `bash scripts/llm/routing-check.sh` meldet kein
`FEHLT` mehr.

## Task 5 — Final Verification

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/local-llm-proxy/
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy.bats
task test:changed
task openspec:validate
bash scripts/llm/routing-check.sh
```
