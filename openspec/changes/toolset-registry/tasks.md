---
title: "toolset-registry — Implementation Plan"
ticket_id: T002560
domains: [agent-guide, mcp, tooling, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# toolset-registry — Implementation Plan

_Ticket: T002560_

## File Structure

```
NEU
  docs/agent-guide/registry/capabilities.yaml             Registry-SSOT (Fähigkeit → Instanzen)
  docs/agent-guide/registry/expected/agy-mcp-config.json  generierter Stellvertreter für agy
  docs/agent-guide/registry/toolset.lock.yaml             Probe-Snapshot (nie CI-Gate)
  scripts/toolset/lib/registry.mjs                        Laden + Validieren der Registry
  scripts/toolset/lib/harness.mjs                         Adapter je Harness (lesen + rendern)
  scripts/toolset/collect.mjs                             Inventar aller Quellen
  scripts/toolset/sync.mjs                                chirurgisches Schreiben der 5 Ziele
  scripts/toolset/check.mjs                               fail-closed Gate, offline, schreibfrei
  scripts/toolset/probe.mjs                               Live-tools/list, gemergtes Lockfile
  scripts/toolset/emit-map.mjs                            toolset-map.md erzeugen
  docs/agent-guide/maps/toolset-map.md                    generierte Karte
  .claude/skills/toolset-curate/SKILL.md                  interaktive Kuration
  scripts/toolset/registry.test.mjs                       Unit: Registry-Regeln
  scripts/toolset/sync.test.mjs                           Unit: chirurgisches Schreiben
  scripts/toolset/check.test.mjs                          Unit: Gate-Regeln
  scripts/toolset/probe.test.mjs                          Unit: Merge-Semantik
  tests/spec/toolset-registry/check-drift-detection.bats
  tests/spec/toolset-registry/check-offline.bats
  tests/spec/toolset-registry/sync-surgical.bats
  tests/spec/toolset-registry/sync-all-harnesses.bats
  tests/spec/toolset-registry/unreviewed-quarantine.bats
  tests/spec/toolset-registry/agy-expected-proxy.bats

GEÄNDERT
  Taskfile.yml                                            toolset:* Tasks + Einhängung
  scripts/mcp-sync.sh                                     Ist 260 · Budget 540
```

## Partial-Manifest

| Partial | Rolle | target_files (disjunkt) |
|---|---|---|
| p1 | Registry-Schema | `capabilities.yaml`, `lib/registry.mjs` |
| p2 | Collector | `collect.mjs`, `lib/harness.mjs` |
| p3 | Sync | `sync.mjs`, `expected/agy-mcp-config.json` |
| p4 | Check | `check.mjs` |
| p5 | Probe | `probe.mjs`, `toolset.lock.yaml` |
| p6 | Skill, Karte, Tasks | `toolset-curate/SKILL.md`, `emit-map.mjs`, `toolset-map.md`, `Taskfile.yml`, `scripts/mcp-sync.sh` |
| p7 | Tests | alle `*.test.mjs`, alle `tests/spec/toolset-registry/*.bats` |

---

## Task 1 — Failing-Test-Step (RED) - [x]

Lege `tests/spec/toolset-registry/check-drift-detection.bats` an. Der Test baut
über `TOOLSET_REGISTRY` und `TOOLSET_OUT_DIR` eine Fixture-Registry samt
Fixture-Zielen auf, verfälscht ein Ziel von Hand und erwartet, dass das Gate
abbricht und dabei Datei und Schlüssel benennt.

Positiv-Anker im selben Test: Zuerst wird belegt, dass das Gate gegen die
**unveränderte** Fixture mit Status 0 durchläuft. Ohne diesen Anker wäre die
Negativ-Aussage vakuos — solange die Implementierung fehlt, bricht der Aufruf
ohnehin ab, und „Status ungleich 0" gilt trivial.

Die Assertion wird auf die relevante Ausgabezeile verengt, nicht gegen den
vollen `$output` geführt: Der Worktree heißt `toolset-registry`, ein
unqualifiziertes Substring-Match auf `toolset` würde durch einen `$0`-Pfad in
einer Usage-Zeile erfüllt, auch wenn das Feature fehlt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/toolset-registry/check-drift-detection.bats
# expected: FAIL (rot — scripts/toolset/check.mjs existiert noch nicht)
```

## Task 2 — Registry-Schema und Loader (p1) - [x]

`docs/agent-guide/registry/capabilities.yaml` anlegen. Startbestand sind die im
Brainstorming belegten Fähigkeiten: `github` (kanonisch `cli:gh-axi`),
`browser-automation`, `dokumentations-lookup`, `websuche`, `security-analyse`,
`code-review`, dazu die MCP-Fähigkeiten aus `mcp.yaml`.

Jede nicht-kanonische Instanz trägt eine Begründung. Für `github-mcp`,
`playwright` und `docfork` werden die Begründungen wörtlich aus den
`note:`-Feldern in `mcp.yaml` übernommen, damit keine zweite, abweichende
Fassung derselben Entscheidung entsteht.

`scripts/toolset/lib/registry.mjs` lädt und validiert: genau ein `canonical` je
Fähigkeit, `reason` bei jedem nicht-kanonischen Zustand, bekannte Kind-Präfixe,
Durchsetzbarkeitsklasse je Kind. Fehler nennen Fähigkeit und Instanz, nie nur
eine Zeilennummer.

## Task 3 — Collector über alle Quellen (p2) - [x]

`scripts/toolset/lib/harness.mjs` bekommt je Harness einen Adapter mit `read()`
und `render()`. Gelesen werden:

- Claude Code: `.mcp.json`, `.claude/settings.json`, `.claude/skills/`,
  `.claude/agents/`, Plugin-Cache
- opencode: `.opencode/opencode.jsonc`, `.opencode/plugins/`,
  `.opencode/skills/`, `.opencode/commands/`, `agent-models.jsonc`
- agy: `~/.gemini/config/mcp_config.json`, `~/.gemini/settings.json`,
  `~/.gemini/config/plugins/` sowie die Symlink-Ziele `skills` und `agents`
- llama.cpp: `scripts/llm/mcp-servers.json` (Modell) und
  `scripts/llm/ui-config.template.json` (WebUI)
- Factory: `scripts/factory/opencode-exec.sh` für das Multi-Agent-Loadout

`scripts/toolset/collect.mjs` normalisiert das zu einer Instanzliste als JSON
auf stdout. Nicht parsbare Konfiguration bricht mit Dateiname und Position ab;
ein stiller Skip würde genau die Blindheit reproduzieren, die dieses Vorhaben
beseitigen soll.

JSONC wird mit einem Parser gelesen, nicht per Regex — `.opencode/opencode.jsonc`
trägt Kommentare, die ein zeilenweiser Ersatz zerstört.

## Task 4 — Chirurgisches Schreiben (p3) - [x]

`scripts/toolset/sync.mjs` rendert aus der Registry in die fünf Ziele und
schreibt ausschließlich `enabledPlugins`, `disabledMcpjsonServers`,
`permissions.deny` und `permission.skill`. Jede andere Zeile der Zieldatei
bleibt unverändert. Schreibvorgänge laufen über temporäre Datei plus `rename`;
für das agy-Ziel zusätzlich eine `.bak`-Kopie.

Ebenfalls hier entsteht `docs/agent-guide/registry/expected/agy-mcp-config.json`
und wird mitcommittet — der Stellvertreter, über den CI den Renderer prüft, ohne
dass eine agy-Installation vorliegen muss.

`TOOLSET_REGISTRY` und `TOOLSET_OUT_DIR` werden von Beginn an unterstützt, nach
dem Muster von `MCP_REGISTRY` / `MCP_OUT_DIR` in `scripts/mcp-sync.sh`. Ohne
diese Overrides ließe sich kein `sync`-Test ausführen, ohne die echte
`.claude/settings.json` des Entwicklers zu überschreiben.

## Task 5 — Das Gate (p4) - [x]

`scripts/toolset/check.mjs` prüft offline und ohne Schreibpfad:

- `suppressed` und durchsetzbar, aber aktiv → Status 1 mit Datei und Schlüssel
- Fähigkeit mit zwei `canonical`, oder mit mindestens zwei Instanzen und
  keinem `canonical` → Status 1
- Fähigkeit, deren Instanzen sämtlich `suppressed` sind → Status 1
- Renderer-Ausgabe weicht von der Datei auf Platte ab → Status 1 mit Diff
- Instanz gefunden, aber nicht in der Registry → Warnung, Status 0, mit Verweis
  auf `toolset-curate`
- agy-Ziel nicht vorhanden → `SKIP`-Zeile, die das Ziel benennt; der Renderer
  wird trotzdem gegen `expected/agy-mcp-config.json` geprüft

Das Modul rendert in den Speicher und vergleicht. Es bekommt bewusst keinen
Schreibpfad: Ein Gate, das intern `sync` aufruft, prüft gegen sein eigenes
Ergebnis und ist dauerhaft grün.

## Task 6 — Live-Probe mit Merge-Semantik (p5)

`scripts/toolset/probe.mjs` ruft `tools/list` gegen jeden erreichbaren
HTTP-MCP-Server und schreibt die Zählwerte nach
`docs/agent-guide/registry/toolset.lock.yaml`. Nicht erreichbare Server behalten
ihren bisherigen Eintrag und werden zusätzlich mit `stale` und Zeitstempel
markiert. Ein Überschreiben auf null vernichtet Messwerte, die nur mit laufender
Infrastruktur reproduzierbar sind.

Das Lockfile wird von `check.mjs` nicht gelesen und kann CI nicht rot machen.

## Task 7 — Kuration, Karte und Task-Einhängung (p6)

`.claude/skills/toolset-curate/SKILL.md` führt durch die `unreviewed`-Einträge:
zeigt je Fall die überschneidende Fähigkeit und, sofern im Lockfile vorhanden,
die gemessene Tool-Zahl als Entscheidungsgrundlage, fragt nach der kanonischen
Instanz, schreibt Zustand und Begründung zurück und ruft `sync.mjs`. Es schreibt
keinen Zustand ohne Begründung.

`scripts/toolset/emit-map.mjs` erzeugt `docs/agent-guide/maps/toolset-map.md`
mit der Fähigkeits-Übersicht und einem eigenen Abschnitt für Rest-Ambiguitäten —
also `suppressed`-Instanzen, deren Kind nicht durchsetzbar ist.

`Taskfile.yml` bekommt `toolset:collect`, `toolset:check`, `toolset:sync` und
`toolset:probe`. `toolset:sync` wird in `freshness:regenerate` eingehängt,
`toolset:check` in `test:all`.

`scripts/mcp-sync.sh` (Ist 260 · Budget 540): Der Pfad für ein fehlendes
agy-Ziel gibt weiterhin Status 0 zurück, meldet die Übersprungenheit aber als
benannte `SKIP`-Zeile auf stdout statt auf stderr — damit machen `mcp:check` und
`toolset:check` dieselbe, maschinell lesbare Aussage.

## Task 8 — Restliche Tests (p7)

Die fünf verbleibenden BATS-Dateien und die vier `*.test.mjs`-Dateien anlegen.
Jeder Test führt das Kommando aus und prüft Status und die relevante
Ausgabezeile; kein Test greppt eine Generator-Quelle nach einem Flag-Namen oder
Meldungstext. Jede Testdatei dokumentiert im Kopfkommentar ihren Prüfmodus.

Jeder Negativtest trägt seinen Positiv-Anker im selben Test. In
`sync-surgical.bats` heißt das: erst belegen, dass `sync.mjs` `enabledPlugins`
tatsächlich verändert hat, dann prüfen, dass `theme` und `hooks` unverändert
blieben. Ohne den Anker wäre der Test auch gegen ein `sync.mjs` grün, das
überhaupt nichts schreibt.

Anschließend `task test:inventory` ausführen und
`website/src/data/test-inventory.json` mitcommitten — CI vergleicht die Datei
gegen die Neugenerierung und schlägt sonst fehl.

## Task 9 — Abschließende Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/toolset-registry/
node --test scripts/toolset/registry.test.mjs scripts/toolset/sync.test.mjs
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu der Nachweis, dass das Vorhaben sein eigenes Ziel erreicht: Nach
`task toolset:sync` führen alle vier Harnesses dieselbe kuratierte Menge, und
ein anschließendes `task toolset:check` läuft ohne Befund durch.
