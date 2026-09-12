# Design: freetoken-config-consolidation

## Root Cause

T900163 (PR #5615) entfernte FreeToken nur auf der Agent-Routing-Ebene
(`.opencode/agent-models.jsonc`, `.opencode/plugin/freetoken-active.ts`). Der zugehörige
OpenSpec-Change `ssot-consolidation-stale-cleanup` blieb dabei selbst auf `plan_staged`
stehen (0/15 Tasks) — Partial 2–4 des eigenen Plans wurden nie ausgeführt, obwohl der Merge
sie suggeriert.

Drei weitere Stellen zeigen FreeToken deshalb weiterhin als aktiv, obwohl der Prozess
(Windows-nativ, Port 1919) laut Betreiber nicht mehr läuft:

1. `.opencode/opencode.jsonc` — Projekt-Default `"model": "freetoken-local/active"`,
   begründet mit einem inzwischen falschen Kommentar ("`:18235` ist stillgelegt" — tatsächlich
   bedient `:18235` bereits alle re-routeten Agenten aus `agent-models.jsonc`).
2. `scripts/llm/loadouts.json` — `factory.model = "freetoken-local"` plus eigener
   `freetoken-local`-Loadout-Eintrag; `scripts/factory/route-provider.sh` und
   `scripts/llm/routing-check.sh` verdrahten denselben `:1919`-Endpoint als
   Fallback/Health-Probe. Das SDLC-Dashboard (`/admin/state`) liest `loadouts.json` — das
   sichtbare Symptom, das den Bug meldete.
3. `docs/agent-guide/registry/agents.yaml` — Mirror von `agent-models.jsonc`, 11 Agent-Einträge
   noch auf `freetoken-local/active*`, obwohl die Quelle bereits `llamacpp-local/qwen38-220k`
   trägt.

## Fix-Ansatz

Denselben Zielzustand, den T900163 für Agent-Routing bereits gewählt hat
(`llamacpp-local/qwen38-220k`, Port 18235, `enabled:true` in `loadouts.json`), auf die drei
verbleibenden Ebenen übertragen:

- `.opencode/opencode.jsonc`: Default auf `llamacpp-local/qwen38-220k`, Kommentar korrigieren.
- `scripts/llm/loadouts.json`: `factory.model` auf `qwen38-220k`, `freetoken-local`-Loadout-Eintrag
  entfernen.
- `scripts/factory/route-provider.sh`, `scripts/llm/routing-check.sh`: `:1919`-Referenzen durch
  den `llamacpp-local`/`:18235`-Pfad ersetzen bzw. entfernen.
- `scripts/llm/measure-factory-context.mjs`: toten Pfad-Kommentar auf `freetoken-active.ts`
  entfernen.
- `docs/agent-guide/registry/agents.yaml`: Mirror nachziehen.
- `openspec/specs/llm-local-dev.md`: Requirement "Project Default Model Targets the FreeToken
  Alias" MODIFIED auf den neuen Zielzustand (das ist die Requirement, die den jetzt falschen
  `.opencode/opencode.jsonc`-Wert vorschreibt).
- `openspec/changes/freetoken-local-backend/` archivieren (Feature komplett entfernt, nie
  implementiert).

## Betroffene Subsysteme

Agent-Routing (bereits sauber), Factory-Proxy-Default, Health-Check-Tooling, SDLC-Dashboard
(liest `loadouts.json` indirekt über den Proxy), OpenSpec-SSOT.

## Edge Cases

- `route-provider.sh`'s `factory_model_pin`-Locked-Pfad (`PIN_LOCKED == "1"`) emittiert aktuell
  hart `FT_LOCAL_PROVIDER`/`FT_LOCAL_BASEURL` — muss ebenfalls auf den neuen Provider/BaseURL
  wechseln, sonst bleibt der gesperrte Pfad tot, während der ungesperrte Pfad schon repariert ist.
- `routing-check.sh` darf nach Entfernen von `:1919` nicht fail-closed werden, wenn gar kein
  lokales Backend erreichbar ist (bestehendes Verhalten: Exit 0 mit Hinweis) — nur der
  `:1919`-Eintrag aus der Probe-Liste entfernen, die Fail-Soft-Logik bleibt unverändert.

## Bewusst außerhalb des Scopes (Verworfene Alternative: alles in einem Ticket)

`openspec/specs/llm-local-dev.md` enthält zusätzlich ~10 weitere FreeToken-spezifische
Requirements (Dynamic Thinking Pool, Measured Context Limits, Alias Usage Telemetry, Engine
Auto-Swap, Plugin-Sync — Zeilen 171–556), die die ehemalige Plugin-Architektur beschreiben und
ebenfalls stale sind. Diese vollständig mit-zuräumen würde das Risiko dieses Fixes erheblich
vergrößern (kaskadierende Scenario-Änderungen über mehrere Requirements, keine unmittelbare
Betriebsgefahr wie bei den Routing-Skripten). Empfehlung: separates Ticket für die
Requirement-Konsolidierung in `llm-local-dev.md`, ebenso für die offenen Partials 2–4 aus
`ssot-consolidation-stale-cleanup` (Script-/Taskfile-Cleanup, Micro-Spec-Konsolidierung — inhaltlich
nicht FreeToken-spezifisch).
