---
ticket_id: T002651
plan_ref: openspec/changes/agent-capability-drift-guards/tasks.md
status: active
date: 2026-08-04
---

# Design: agent-capability-drift-guards

_Ticket: T002651_

## Leitgedanke

Beide Vorgänge sind derselbe Fehler in zwei Gewändern: eine Konfiguration behauptet eine
Fähigkeit, die Laufzeit hat sie nicht, und die Differenz ist unsichtbar. Entsprechend hat
jeder Vorgang zwei Hälften — den Ist-Zustand korrigieren, und den Weg schließen, auf dem
die Differenz wieder unsichtbar entstehen kann. Die erste Hälfte allein wäre ein Pflaster;
T002221 hat genau das getan und diesen Nachlauf hinterlassen.

## Einheit A — Werkzeug-Allowlist

### Komponenten

| Datei | Rolle | Änderung |
|---|---|---|
| `.claude/agents/bachelorprojekt-ops.md` | Agent-Definition | `tools:`-Zeile entfernen, begründender Kommentar im Muster der drei Geschwister |
| `docs/agent-guide/registry/agents.yaml` | Spiegel der Frontmatter | `tools:`-Eintrag bei `bachelorprojekt-ops` entfernen |
| `docs/agent-guide/maps/agents-map.md` | generierte Karte | via `task agent-guide:maps` regenerieren |
| `tests/spec/agent-library.bats` | Guard | Regel von drei auf sechs Agents ziehen |

Die Registry ist für dieses Feld ausdrücklich ein Spiegel, nicht die Quelle — ihr eigener
Kopfkommentar sagt „the `tools:` list from the agent frontmatter, if present". Beide Orte
müssen dennoch gemeinsam geändert werden, weil `tests/spec/agent-roster.bats` bidirektional
abgleicht.

### Entscheidung: harte statt weicher Regel

Gewählt: **kein Domain-Agent führt `tools:`**. Verworfen: „Allowlist erlaubt, muss aber
`Skill` und die in der Routing-Tabelle zugewiesenen MCP-Server enthalten."

Die weiche Regel verlangt eine handgepflegte Liste, die bei jeder MCP-Umbenennung still
veraltet. Genau das war die Ursache von T002221, und der dortige Testkommentar hält die
Begründung schon fest: das Weglassen des Keys „also survives MCP renames, which a
hand-maintained list does not". `.claude/agents/` enthält ausschließlich die sechs
Domain-Agents, die Regel ist damit vollständig und nicht bloß heuristisch.

### Warum der bestehende Guard nicht ausreichte

`tests/spec/agent-library.bats` prüft heute vier Dinge: keine Wildcards, korrekte
`mcp__<server>__<tool>`-Form, bekannte Built-ins, und — für die drei damals reparierten
Agents — Abwesenheit des Keys. Der fünfte Test verlangt nur, dass eine deklarierte Liste zu
mehr als null Einträgen auflöst. `[Bash, Read, Glob, Grep]` erfüllt jede dieser Bedingungen.
Der Guard war auf die beobachtete Havarie zugeschnitten (Liste löst zu null auf → Dispatch
verweigert) statt auf die dahinterliegende Klasse (Allowlist entzieht Fähigkeiten).

## Einheit B — Plugin-Aktivierung

### Datenfluss

```
.claude/settings.json          ~/.claude/settings.json     ~/.claude/plugins/
  enabledPlugins                 enabledPlugins              installed_plugins.json
  (eingecheckt, Team)            (Maschine)                  (Maschine)
        │                              │                            │
        └──────────────┬───────────────┴────────────────────────────┘
                       ▼
              scripts/plugin-doctor.sh
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
  SessionStart-Hook            tests/spec/…/plugin-activation.bats
  (warnt, bricht nie ab)       (fail-closed, Fixtures statt ~/.claude)
```

### B1 — `scripts/plugin-doctor.sh`

Zwei Befunde, beide Fähigkeitsverlust:

1. Im Repo aktiviert, in `installed_plugins.json` nicht vorhanden.
2. Im Repo aktiviert, im User-Scope `false` oder gar nicht geführt.

Die Gegenrichtung — lokal mehr als das Repo — bleibt still. Sie kostet keine Fähigkeit,
und eine Warnung darauf träfe jedes probeweise installierte Plugin, bis man es wieder
entfernt. Ein Guard, der bei harmlosen Zuständen anschlägt, wird weggeklickt und schützt
dann auch im Schadensfall nicht mehr.

Fehlerbehandlung:

- Fehlendes `~/.claude` → Exit 0 mit Hinweis. Auf einer fremden Maschine oder einem
  CI-Runner hat die maschinenlokale Prüfung nichts zu sagen; ein Rot wäre eine Falschaussage.
- Unlesbares oder syntaktisch kaputtes JSON → Exit 2 mit Dateiname. Getrennt von Exit 1
  (Befund), damit der Hook „kaputt" nicht als „sauber" liest.
- Befund → Exit 1.

Schnittstelle: Pfad-Overrides per Umgebungsvariable (Claude-Home und beide Settings-Pfade),
`--json` für den Hook, Menschenlesbares als Default. Taskfile-Target
`task agents:plugins:check`.

Die Pfad-Overrides sind kein Komfort, sondern die Voraussetzung für B3: ohne sie könnte CI
das Skript nur greppen, was die Output-Verifikations-Konvention (T002448-M4) ausschließt.

### B2 — SessionStart-Hook

Ein weiterer Eintrag im vorhandenen `SessionStart`-Array von `.claude/settings.json`. Er
folgt exakt dem Muster des codebase-memory-Hooks daneben: Kommando läuft, Befund wird als
`{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "…"}}`
ausgegeben, abgeschlossen mit `|| true`. Kein Befund → keine Ausgabe, kein Rauschen.

Bewusst nur warnend. Ein abbrechender Hook würde jede Maschine ohne vollständige
Plugin-Installation unbenutzbar machen — der Schaden überstiege den der Drift deutlich.

### B3 — CI-Test

Prüft fail-closed, was ohne `~/.claude` prüfbar ist: Key-Syntax `<plugin>@<marketplace>`,
keine doppelten Keys, Marketplace-Segment aus bekannter Menge. Fährt zusätzlich den Doctor
über die Pfad-Overrides gegen synthetische Fixtures und prüft Exit-Status und Ausgabe je
Befund.

Verworfen: ein Test, der bei fehlendem `~/.claude` `skip`t. Er liefe in CI immer im
Skip-Zweig und meldete dort nie etwas — dieselbe fail-open-Form, die `CLAUDE.md` am
gitleaks-Fall bereits als Fallstrick führt.

Ablage nach der Verzeichniskonvention aus T002416: `tests/spec/agent-skills/` für den
Plugin-Teil, Erweiterung der bestehenden `tests/spec/agent-library.bats` für Einheit A
(dort liegt die Regel, die verschärft wird).

## Test-Reihenfolge

Fix-Pfad, also rot vor grün. Zuerst zwei fehlschlagende Tests: einer weist die vorhandene
`tools:`-Liste bei `bachelorprojekt-ops` nach, einer ruft den noch nicht existierenden
Doctor. Erst danach Implementierung.

Für den verschärften Guard gilt die Positiv-Anker-Pflicht aus `CLAUDE.md`: die Aussage
„kein Agent führt `tools:`" ist eine Negativaussage und bestünde vakuos, wenn die
Kandidatenliste leer wäre. Der Test muss deshalb im selben Block belegen, dass er
überhaupt Agent-Dateien gefunden hat.

## Abgrenzung

Nicht Teil dieses Change: die fünf anderen Domain-Agents (führen kein `tools:`), die
opencode-Runtimes (eigene Registry in `.opencode/agent-models.jsonc`, von der
Allowlist-Semantik nicht betroffen), und jede Persistenz der Doctor-Befunde. Der Doctor
misst, er verwaltet keinen Zustand.
