---
ticket_id: T001385
plan_ref: openspec/changes/t001385-openspec-delta-spec-dir/tasks.md
status: active
date: 2026-07-01
---

# T001385 — instructions/specs schlägt falsche Verzeichnisstruktur für Delta-Specs vor

## Root Cause

Zwei unabhängige, agentenseitig konsumierte Quellen beschreiben den `propose`-Workflow und
sind beide unvollständig gegenüber der tatsächlich gültigen Konvention:

1. **SSOT-Spec `openspec/specs/openspec-workflow.md`** — Requirement "Propose erstellt
   vollständiges Change-Skeleton" (Zeile 16-27) und die zugehörige Drop-in-Kompatibilitäts-
   Requirement (Zeile 190-206) beschreiben ausschließlich den Default-Pfad: die Delta-Spec
   wird immer unter `specs/<slug>.md` angelegt — `<slug>` = **Change-Slug**. Das ist korrekt
   für neue Capabilities, aber falsch/unvollständig für Sub-Features einer bestehenden
   Capability.
2. **`.claude/skills/openspec-propose/SKILL.md`** (gespiegelt als
   `.claude/commands/opsx/propose.md` und `.opencode/commands/opsx-propose.md`) — der
   upstream-kanonische `/opsx:propose`-Flow. Schritt 4a übernimmt den `outputPath` aus
   `openspec instructions <artifact-id> --change "<name>" --json` unkritisch. Die upstream
   `openspec`-CLI kennt unsere `--target-spec`/Parent-SSOT-Konvention nicht — sie liefert
   für das `specs`-Artefakt immer `outputPath` = `openspec/changes/<name>/specs/<name>.md`
   (Change-Slug). Die Skill-Datei enthält **keinen** Schritt, der prüft, ob der Change ein
   Sub-Feature einer bestehenden Capability ist, und in diesem Fall den Dateinamen auf den
   Parent-SSOT-Slug umbiegt.

Damit produziert **jeder** Agent, der den kanonischen `/opsx:propose`-Pfad nutzt (laut
AGENTS.md der bevorzugte Pfad gegenüber dem `task openspec:*`-Fallback), bei Sub-Features
systematisch eine falsch benannte Delta-Spec-Datei — genau das im Ticket beschriebene
Symptom.

Der Fallback-Skript-Pfad (`scripts/openspec.sh propose <slug> --ticket <id> --target-spec
<parent-slug>`) implementiert die T001304-Konvention bereits korrekt
(`scripts/openspec.sh:91`: `local delta_spec_name="${target_spec:-$slug}"`). Der Bug ist
also rein dokumentarisch/prozessual — kein Code-Bug im Fallback-Skript.

## Was korrigiert wird

1. **`openspec/specs/openspec-workflow.md`**: Requirement "Propose erstellt vollständiges
   Change-Skeleton" und die Scenario-Liste ergänzen um den Sub-Feature-Fall
   (`--target-spec <parent-slug>` → Delta-Spec-Dateiname = Parent-SSOT-Slug, nicht
   Change-Slug). Textreferenz auf CLAUDE.md "Delta-Spec-Konvention (T001304)" aufnehmen,
   damit SSOT und CLAUDE.md sich nicht widersprechen.
2. **`.claude/skills/openspec-propose/SKILL.md`** (kanonisch; `.claude/commands/opsx/propose.md`
   und `.opencode/commands/opsx-propose.md` sind Spiegel/Aliase — geprüft, ob sie den Text
   duplizieren oder nur verlinken, und entsprechend synchron gehalten): Schritt 4a um einen
   Vor-Check ergänzen — bevor das `specs`-Artefakt geschrieben wird, prüfen, ob der Change
   ein Sub-Feature einer **bestehenden** Capability in `openspec/specs/` ist (Component-Map
   `openspec/component-map.yaml` bzw. Nutzerangabe). Falls ja: Ziel-Dateiname für das
   `specs`-Artefakt ist der Parent-SSOT-Slug, NICHT der von `outputPath` gelieferte
   Change-Slug-Name (`outputPath`-Verzeichnis bleibt gültig, nur der Dateiname wird
   überschrieben). Für eine echte neue Capability bleibt `outputPath` unverändert.
3. **Regressionstest** in `tests/spec/openspec-workflow.bats`: ein grep-basierter Test, der
   sicherstellt, dass sowohl die SSOT-Spec als auch die Skill-Datei die
   Parent-SSOT-Slug-Konvention (Stichwort `target-spec` bzw. `Parent-SSOT-Slug`) erwähnen,
   damit ein künftiges Redigieren nicht wieder in den alten, unvollständigen Zustand
   zurückfällt.

## Non-Goals

- Keine Änderung an `scripts/openspec.sh` (Verhalten ist bereits korrekt).
- Keine Änderung am upstream `@fission-ai/openspec`-npm-Paket (liegt außerhalb des Repos).
- Kein Wechsel des kanonischen Propose-Pfads (`/opsx:propose` bleibt bevorzugt gegenüber
  `task openspec:propose`).

## Edge Cases

- Ein Change, der sowohl neue als auch bestehende Capabilities berührt (mehrere
  `specs/*.md`-Dateien) — außerhalb des Scopes dieses Fixes; wird als Folge-Ticket vermerkt,
  falls beim Schreiben der Doku-Korrektur ein konkreter Bedarf auffällt.
- `.opencode/commands/opsx-propose.md` könnte structurally von `.claude/commands/opsx/propose.md`
  abweichen (unterschiedliche Runtime-Konventionen) — beide werden im Plan einzeln geprüft,
  nicht blind gespiegelt.

## Entscheidung

Dokumentations-Fix (kein Verhaltensänderung an lauffähigem Code) — Ticket ist dennoch als
`bug`/`hoch` getickt, da fehlerhafte Agenten-Anleitung zu falsch strukturierten Delta-Specs
führt, die spätere `archive`-Merges brechen (SSOT-Ziel nicht gefunden / falscher Dateiname).
Daher **fix-Pfad** (nicht chore) mit failing-Test-Anforderung, erfüllt durch den
grep-Regressionstest in `tests/spec/openspec-workflow.bats`.
