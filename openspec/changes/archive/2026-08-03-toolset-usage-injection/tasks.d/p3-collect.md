---
title: "p3 collect — collect.mjs erfasst plugin, skill, cli und agent"
ticket_id: T002592
domains: [infra]
status: active
---

# p3 collect — scripts/toolset/collect.mjs

**Besitzt ausschließlich:** `scripts/toolset/collect.mjs`

**Kontrakt:** CONTRACT.md §5 (Erfassungsquellen und Instanz-Id je Kind).

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/toolset/collect.mjs` | 66 | 800 (`.mjs`-Limit) |

Nicht in `baseline.json`; wirksame Schwelle ist das statische Limit 800. Geschätzt +90 Zeilen.

## Ausgangslage

`collect.mjs` liest heute ausschließlich die `mcpServers`-Blöcke der drei Harness-Configs und
gibt ein Array `{harness, instance, active, source}` als JSON aus. Es vergleicht **nicht** gegen
`capabilities.yaml` — deshalb kann es keine `unreviewed`-Instanz melden, obwohl der SSOT-Spec
genau das verlangt. Die 36 Einträge unter `enabledPlugins` in `.claude/settings.json` sind ihm
vollständig unbekannt.

## Aufgaben

- [ ] **Plugin-Erfassung.** `enabledPlugins` aus `.claude/settings.json` lesen (der Pfad ist über
      `readClaudeCodeConfig` aus `./lib/harness.mjs` bereits verfügbar — dieselbe Quelle, aus der
      der Bestandscode `disabledMcpjsonServers` bezieht). Je Schlüssel eine Instanz
      `plugin:<voller-schlüssel>` mit `active` = Boolean-Wert. Der Marketplace-Suffix bleibt Teil
      der Id: `superpowers@claude-plugins-official` und ein gleichnamiges Plugin aus einem anderen
      Marketplace sind verschiedene Instanzen.

- [ ] **Skill-Erfassung.** Über `.claude/skills/*/SKILL.md` iterieren, das `name:`-Frontmatter
      lesen und je Skill eine Instanz `skill:<name>` mit `active: true` ausgeben.
      `.claude/skills/OVERVIEW.md` ist kein Skill-Verzeichnis und wird übersprungen; ein
      Verzeichnis ohne `SKILL.md` ebenfalls (nicht als Fehler — solche Verzeichnisse können
      Referenzmaterial halten, wie `.claude/skills/references/`).

      Fällt das Frontmatter aus oder fehlt `name:`, ist der Verzeichnisname der Fallback-Id — und
      das wird auf stderr gemeldet, nicht still hingenommen. Eine Skill-Datei ohne `name:` ist
      ein echter Defekt, den die Erfassung sichtbar machen soll.

- [ ] **cli- und agent-Erfassung.** `docs/agent-guide/registry/tools.yaml` laden und jeden Eintrag
      mit `kind: cli` bzw. `kind: agent` als `cli:<id>` bzw. `agent:<id>` ausgeben. `harness` ist
      das dortige `harness`-Feld, `source` der Registry-Pfad.

- [ ] **Kurations-Abgleich.** `capabilities.yaml` über `loadRegistry` aus `./lib/registry.mjs`
      laden (dieselbe Funktion, die `check.mjs` und `sync.mjs` nutzen — kein eigener Parser) und
      jede gesammelte Instanz um das Feld `curation` ergänzen: den `state` aus der Registry, wenn
      die Instanz-Id dort in irgendeiner Capability vorkommt, sonst `unreviewed`.

      Das bestehende Ausgabeformat bleibt erhalten und wird nur additiv ergänzt — `check.mjs`
      (p2) und der Skill konsumieren es, und ein umgestelltes Format würde beide gleichzeitig
      brechen.

- [ ] **Sammellogik als Funktion exportieren.** Die Erfassung in eine exportierte Funktion
      `collectInstances({ baseDir, homeDir })` ziehen, die das Array zurückgibt; der bestehende
      Top-Level-Code ruft sie auf und gibt das Ergebnis als JSON aus. Grund: p2 braucht dieselbe
      Liste für seinen unreviewed-Report, und ein Subprozess-Aufruf mit JSON-Parsing wäre der
      umständlichere Weg zum selben Ergebnis. Das Verhalten des direkten Aufrufs
      `node scripts/toolset/collect.mjs` bleibt unverändert.

- [ ] **`--unreviewed`-Filter.** Bei diesem Argument nur Instanzen mit `curation === 'unreviewed'`
      ausgeben. Das ist der Einstieg, den `toolset-curate` (p5) als ersten Schritt aufruft; ohne
      ihn müsste der Skill 88 Einträge nach dem einen filtern, das kuriert werden soll.

- [ ] **Fehlerverhalten der neuen Quellen.** Der Bestandscode beendet sich bei einem Lesefehler
      der MCP-Configs mit Exit 1. Für die neuen Quellen gilt dasselbe **nicht**: eine fehlende
      `tools.yaml` oder ein unlesbares `SKILL.md` erzeugt eine stderr-Warnung und überspringt die
      Quelle. `collect.mjs` ist ein Erhebungswerkzeug — ein Teilausfall soll die übrigen Kinds
      nicht mitreißen, sonst ist im Fehlerfall gar keine Kuration mehr möglich.

- [ ] **Selbstprüfung.**

```bash
node scripts/toolset/collect.mjs | node -e "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const k=i=>i.instance.split(':')[0];
  console.log('kinds:', [...new Set(d.map(k))].sort().join(','));
  console.log('unreviewed:', d.filter(i=>i.curation==='unreviewed').length);
"
# erwartet: kinds enthält agent,cli,mcp,plugin,skill
node scripts/toolset/collect.mjs --unreviewed | head -20
```
