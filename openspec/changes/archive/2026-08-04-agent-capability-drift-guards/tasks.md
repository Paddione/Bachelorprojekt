---
title: "agent-capability-drift-guards — Implementation Plan"
ticket_id: T002651
domains: [agent-behavior, agent-skills, ci-cd]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-capability-drift-guards — Implementation Plan

_Ticket: T002651_

## File Structure

```
tests/spec/agent-behavior/no-tools-allowlist.bats   (neu, bereits im Branch, 80 Z.)
tests/spec/agent-skills/plugin-activation.bats      (neu, bereits im Branch, 197 Z.)
scripts/plugin-doctor.sh                            (neu, Budget 200 Z.)
.claude/agents/bachelorprojekt-ops.md               (89 Z. → ~95 Z., Zeile 10 ersetzt)
docs/agent-guide/registry/agents.yaml               (110 Z. → 109 Z., Zeile 28 entfernt)
docs/agent-guide/maps/agents-map.md                 (generiert, nicht von Hand editieren)
.claude/settings.json                               (221 Z. → ~228 Z., ein SessionStart-Eintrag)
Taskfile.yml                                        (ein Target: agents:plugins:check)
website/src/data/test-inventory.json                (generiert, via task test:inventory)
```

Keine dieser Dateien steht in `docs/code-quality/baseline.json` — die S1-Baseline führt
ausschließlich Dateien unter `website/src/`. Alle bleiben deutlich unter der S1-Schwelle,
das größte Neu-Artefakt ist `scripts/plugin-doctor.sh` mit einem Budget von 200 Zeilen.
Ein Verkleinerungsschritt ist damit nicht erforderlich.

## Kontext für den Implementierer

Beide Einheiten sind unabhängig und können in beliebiger Reihenfolge umgesetzt werden.
Die RED-Tests liegen bereits im Branch und schlagen fehl — sie sind der Auftrag, nicht
mehr zu schreiben.

Warum es diesen Vorgang gibt und was bewusst verworfen wurde, steht in
`openspec/changes/agent-capability-drift-guards/design.md`. Die verbindlichen Aussagen
stehen in den beiden Delta-Specs unter `specs/`. Die wichtigste Nebenbedingung vorweg:
`.claude/agents/bachelorprojekt-ops.md` und `docs/agent-guide/registry/agents.yaml`
müssen **gemeinsam** geändert werden, weil `tests/spec/agent-roster.bats` beide Richtungen
abgleicht.

## Tasks

- [ ] **RED bestätigen.** Beide Testdateien laufen lassen und den Fehlschlag festhalten,
      bevor irgendetwas implementiert wird. Erwartet sind 10 rote von 13 Tests: die drei
      grünen (`Form <plugin>@<marketplace>`, keine Duplikate, bekannte Marketplaces)
      prüfen Repo-Fakten, die heute schon erfüllt sind, und sind reiner Regressionsschutz.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-behavior/no-tools-allowlist.bats \
  tests/spec/agent-skills/plugin-activation.bats
# expected: FAIL (rot — weder ist die tools:-Allowlist entfernt noch existiert der Doctor)
```

- [ ] **Einheit A.1 — `tools:`-Key aus dem ops-Agent entfernen.** In
      `.claude/agents/bachelorprojekt-ops.md` die Zeile `tools: [Bash, Read, Glob, Grep]`
      löschen und durch einen begründenden Kommentar ersetzen, der dem Muster der drei
      Geschwisterdateien folgt (`bachelorprojekt-db.md` zeigt die Form). Der Kommentar
      hält fest: Weglassen ist die Absicht, weil eine Allowlist MCP und Skills entzieht
      und bei MCP-Umbenennungen still veraltet. Er nennt T002651 und verweist auf T002221
      als Ursprung.

- [ ] **Einheit A.2 — Registry-Spiegel und Karte nachziehen.** In
      `docs/agent-guide/registry/agents.yaml` den `tools:`-Eintrag unter
      `bachelorprojekt-ops` entfernen (Zeile 28). Danach die generierte Karte auffrischen:

```bash
task agent-guide:maps
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
# Der Roster-Test prueft bidirektional und deckt auf, wenn nur eine der beiden Seiten
# geaendert wurde.
```

- [ ] **Einheit A.3 — Guard gruen sehen.** `tests/spec/agent-behavior/no-tools-allowlist.bats`
      muss jetzt durchlaufen. Der T002221-Test in `tests/spec/agent-library.bats` bleibt
      unverändert stehen; er ist eine Teilmenge der neuen Regel und darf nicht angefasst
      werden (Konvention T002416 verbietet das Erweitern von Sammeldateien).

- [ ] **Einheit B.1 — `scripts/plugin-doctor.sh` schreiben.** Vergleicht die
      `enabledPlugins`-Map aus `.claude/settings.json` gegen
      `<claude-home>/plugins/installed_plugins.json` und
      `<claude-home>/settings.json`. Meldet zwei Befunde: im Repo aktiviert aber nicht
      installiert, sowie im Repo aktiviert aber im User-Scope `false` oder fehlend. Die
      Gegenrichtung bleibt still.

      Exit-Codes, vom Test vorgegeben: `0` sauber oder nicht anwendbar, `1` Befund,
      `2` unlesbares JSON. Fehlt das Claude-Home-Verzeichnis, Exit `0` mit einem Hinweis,
      der auf `nicht anwendbar`, `not applicable` oder `kein Claude-Home` matcht.

      Pflicht-Schnittstelle (die Tests hängen daran):
      `PLUGIN_DOCTOR_CLAUDE_HOME` überschreibt das Claude-Home,
      `PLUGIN_DOCTOR_REPO_SETTINGS` den Pfad der eingecheckten Settings, `--json` gibt
      valides JSON auf stdout aus. Ohne diese Overrides könnte CI den Doctor nur greppen,
      was die Output-Verifikations-Konvention T002448-M4 ausschließt.

- [ ] **Einheit B.2 — Taskfile-Target.** `task agents:plugins:check` ruft
      `scripts/plugin-doctor.sh` auf und reicht dessen Exit-Code durch.

- [ ] **Einheit B.3 — SessionStart-Hook.** In `.claude/settings.json` einen weiteren
      Eintrag im vorhandenen `SessionStart`-Array ergänzen, der den Doctor mit `--json`
      aufruft und einen Befund als
      `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": …}}`
      ausgibt. Der bereits vorhandene codebase-memory-Eintrag daneben ist die Vorlage für
      Form und Fehlertoleranz. Das Kommando endet auf `|| true` und darf den Sessionstart
      unter keinen Umständen abbrechen; ohne Befund gibt es keine Ausgabe.

- [ ] **Einheit B.4 — Guard gruen sehen.** `tests/spec/agent-skills/plugin-activation.bats`
      muss vollständig durchlaufen, inklusive der acht Fixture-Tests gegen den Doctor.

- [ ] **Test-Inventar regenerieren.** Zwei neue Testdateien bedeuten neue Einträge; CI
      vergleicht die committete Datei gegen den Neulauf und schlägt bei Abweichung fehl.

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
