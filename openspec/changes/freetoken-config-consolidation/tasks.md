---
title: FreeToken-Config-Konsolidierung: Projekt-Default, Factory-Proxy, Routing-Skripte
ticket_id: T900164
domains: [ops, sdlc]
status: plan_staged
---

# freetoken-config-consolidation — Implementation Plan

## File Structure
- `.opencode/opencode.jsonc` (mod: Projekt-Default `model` von `freetoken-local/active` auf
  `llamacpp-local/qwen38-220k`, Kommentar korrigieren)
- `scripts/llm/loadouts.json` (mod: `factory.model` von `freetoken-local` auf `qwen38-220k`,
  `freetoken-local`-Loadout-Eintrag entfernen)
- `scripts/factory/route-provider.sh` (mod: `FT_LOCAL_PROVIDER`/`FT_LOCAL_BASEURL` und den
  gesperrten Pin-Pfad auf `llamacpp-local`/`http://127.0.0.1:18235/v1` umstellen)
- `scripts/llm/routing-check.sh` (mod: `:1919` aus der Probe-URL-Liste entfernen, Kommentar
  korrigieren)
- `scripts/llm/measure-factory-context.mjs` (mod: toten Kommentar-Verweis auf
  `.opencode/plugin/freetoken-active.ts` entfernen)
- `docs/agent-guide/registry/agents.yaml` (mod: 11 Agent-Eintraege von `freetoken-local/active*`
  auf `llamacpp-local/qwen38-220k` nachziehen, analog zu `agent-models.jsonc`)
- `openspec/specs/llm-local-dev.md` (mod: Requirement "Project Default Model Targets the
  FreeToken Alias" MODIFIED-Delta anwenden)
- `openspec/changes/freetoken-local-backend/` (mod: archivieren — Feature entfernt, nie
  implementiert; `status: abandoned` statt `archived`, da nicht umgesetzt)
- `tests/spec/local-llm-proxy/factory-default-not-freetoken.bats` (bereits vorhanden, RED —
  siehe Task 1)

## Tasks

### Task 1 — Failing Test bestaetigen (bereits geschrieben, RED)
- [x] `tests/spec/local-llm-proxy/factory-default-not-freetoken.bats` existiert und ist RED:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/factory-default-not-freetoken.bats
  ```
  expected: FAIL (5 von 5 Tests rot — Projekt-Default, Factory-Default, freetoken-local-Loadout,
  route-provider.sh-Fallback, routing-check.sh-Probe zeigen alle noch auf FreeToken).

### Task 2 — Projekt-Default umstellen
- [ ] `.opencode/opencode.jsonc`: `"model": "freetoken-local/active"` →
  `"model": "llamacpp-local/qwen38-220k"`.
- [ ] Begleitkommentar (Zeilen 3-8) korrigieren: nicht mehr "der alte llama.cpp-Stack (:18235)
  ist stillgelegt", sondern dass `:18235` (llm-proxy) der aktive Pfad ist.

### Task 3 — Factory-Proxy-Default und toten Loadout-Eintrag entfernen
- [ ] `scripts/llm/loadouts.json`: `factory.model` von `"freetoken-local"` auf `"qwen38-220k"`.
- [ ] Den `freetoken-local`-Loadout-Eintrag (slug `freetoken-local`, Port 1919, `managed:
  external`) vollstaendig entfernen.
- [ ] `task llm:loadouts:check` (falls vorhanden) bzw. `jq empty scripts/llm/loadouts.json`
  gegen valides JSON pruefen.

### Task 4 — Routing-Skripte von :1919 befreien
- [ ] `scripts/factory/route-provider.sh`: `FT_LOCAL_PROVIDER="freetoken"` →
  `FT_LOCAL_PROVIDER="llamacpp-local"`, `FT_LOCAL_BASEURL="http://127.0.0.1:1919/v1"` →
  `FT_LOCAL_BASEURL="http://127.0.0.1:18235/v1"`. Kommentarzeilen 19-20 entsprechend anpassen.
  Variablennamen `FT_LOCAL_*` bleiben (Umbenennung ist Kosmetik, kein Scope dieses Fixes).
- [ ] `scripts/llm/routing-check.sh`: `http://127.0.0.1:1919` aus der `for url in ...`-Probe-Liste
  entfernen; Kommentar (Zeilen 27-30) korrigieren. Fail-Soft-Verhalten (Exit 0 ohne erreichbares
  Backend) unveraendert lassen.
- [ ] `scripts/llm/measure-factory-context.mjs`: Kommentarzeile 11 (Verweis auf geloeschtes
  `.opencode/plugin/freetoken-active.ts`) entfernen oder auf den tatsaechlichen
  Telemetrie-Ersatz (falls vorhanden) korrigieren.

### Task 5 — Mirror und Spec-Delta nachziehen
- [ ] `docs/agent-guide/registry/agents.yaml`: alle 11 `model: freetoken-local/active*`-Eintraege
  auf `model: llamacpp-local/qwen38-220k` umstellen (Abgleich mit `agent-models.jsonc`, das diese
  Umstellung fuer dieselben Agenten bereits in T900163 vollzogen hat).
- [ ] `openspec/specs/llm-local-dev.md`: MODIFIED-Delta aus
  `openspec/changes/freetoken-config-consolidation/specs/llm-local-dev.md` einarbeiten
  (Requirement "Project Default Model Targets the FreeToken Alias").

### Task 6 — Obsoleten Change archivieren
- [ ] `openspec/changes/freetoken-local-backend/` archivieren (Feature vollstaendig entfernt,
  nie implementiert — `bash scripts/openspec.sh archive freetoken-local-backend` bzw. manuelles
  Verschieben nach `openspec/changes/archive/` je nach Tool-Konvention fuer nicht umgesetzte
  Changes).

### Task 7 — Verifikation
- [ ] `tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/factory-default-not-freetoken.bats`
  läuft jetzt GRUEN (5/5).
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
