---
slug: antigravity-cli-gh-sandbox
ticket_id: T001274
status: planning
domains: [agy-cli, tooling]
---

# Proposal: antigravity-cli-gh-sandbox

## Purpose (Zweck)

Behebung eines Mishaps im antigravity-cli (Claude Code-Instanz unter `~/.gemini/antigravity-cli/`):
Der Sandbox-Interceptor blockiert direkte `gh`-Aufrufe via `run_command`/Bash-Tool —
auch nach interaktivem `custom(gh.read(...))` Permission-Grant. Workaround bisher:
`bash -c "gh ..."` wrapping. Die eigentliche Ursache ist das Fehlen eines
`permissions.allow`-Eintrags für `Bash(gh *)` in der `settings.json`.

## Root Cause

`~/.gemini/antigravity-cli/settings.json` hat keinen `permissions`-Block.
Wenn ein Agent `gh` direkt ausführt, prüft der Claude Code Sandbox-Interceptor ob ein
`Bash(gh *)` Allow-Eintrag existiert. Da keiner vorhanden ist, wird eine interaktive
Permission-Anfrage ausgelöst. Selbst wenn der User `custom(gh.read(...))` gewährt, matcht
das nicht das interne `Bash(gh *)` Schema — der Befehl schlägt fehl mit "permission denied".

Der Workaround `bash -c "gh ..."` funktioniert, weil der Interceptor statt `gh` jetzt
`bash` prüft — und `bash` ist breiter vorermächtigt oder wird anders behandelt.

## Requirements

### R1: Pre-Granted gh Permissions

Die `~/.gemini/antigravity-cli/settings.json` MUSS einen `permissions.allow`-Block mit
mindestens `Bash(gh *)` und `Bash(gh-axi *)` enthalten, sodass gh-Aufrufe in Agents
ohne interaktive Permission-Anfrage funktionieren.

### R2: CONTRIBUTING.md Guidance

`CONTRIBUTING.md` MUSS einen Abschnitt über das antigravity-cli Permission-System
enthalten, der erklärt:
- Warum direktes `gh` in Agents mit Permission-Grant scheitert
- Dass die `settings.json` den korrekten `Bash(gh *)` Allow-Eintrag braucht
- Dass `bash -c "gh ..."` als Workaround funktioniert, aber kein Ersatz für korrektes Pre-Grant ist

### R3: BATS Test

Ein BATS-Test in `tests/spec/mcp-tooling.bats` MUSS verifizieren, dass
`~/.gemini/antigravity-cli/settings.json` den `Bash(gh *)` Allow-Eintrag enthält.
Dieser Test ist rot vor dem Fix und grün danach.

## Scenarios

### Scenario 1: Direct gh Call in Agent succeeds without interactive prompt
- **GIVEN** the `settings.json` has `permissions.allow: ["Bash(gh *)", "Bash(gh-axi *)"]`
- **WHEN** an agent runs `gh pr view 42` via run_command
- **THEN** the command executes without a permission prompt or denied error

### Scenario 2: BATS test validates configuration
- **GIVEN** the BATS test in `tests/spec/mcp-tooling.bats` checks for the `Bash(gh *)` allow entry
- **WHEN** `./tests/runner.sh local` runs
- **THEN** the test passes (green)

### Scenario 3: CONTRIBUTING.md explains the permission behavior
- **GIVEN** CONTRIBUTING.md has an antigravity-cli permission section
- **WHEN** a new contributor reads it
- **THEN** they understand both the root cause and the correct fix
