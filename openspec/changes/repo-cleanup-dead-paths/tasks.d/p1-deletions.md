# p1 — Tote Dateien und Task Master entfernen (impl)

Rolle: impl. Zieldateien: `NANOS_RESPONSE`, `OPPO`, `.antigravitycli/`, `.astro/`, `mcp-browser/`,
`tasks/`, `.taskmaster/`, `Taskfile.taskmaster.yml`, `Taskfile.yml`,
`docs/agent-guide/registry/mcp.yaml`, `.mcp.json`, `.opencode/opencode.jsonc`.

## Task 1 — Verwaiste Dateien löschen

- [ ] Die fünf Fälle entfernen, jeweils mit `git rm -r`.

```bash
git rm NANOS_RESPONSE OPPO
git rm -r .antigravitycli .astro mcp-browser
```

Beleglage je Fall, damit beim Ausführen nicht neu recherchiert werden muss:

| Pfad | Beleg |
| --- | --- |
| `NANOS_RESPONSE`, `OPPO` | 0 Byte, keine Referenz im Repo |
| `.antigravitycli/` | getrackter Symlink auf `/home/patrick/.gemini/config/projects/`, im Arbeitsbaum nicht auflösbar |
| `.astro/` (Wurzel) | generierte Astro-Typen; `tsconfig.json` referenziert sie nicht, `.gitignore` kennt nur `website/.astro/` |
| `mcp-browser/` | Dockerfile ohne Manifest, ohne Build-Workflow, ohne Task |

- [ ] Gegenprobe, dass `website/.astro/` unangetastet bleibt — dort liegen die echten,
      gitignorierten Astro-Typen.

```bash
test -d website/.astro && echo "OK: website/.astro unberuehrt"
```

## Task 2 — Task Master ausbauen

- [ ] Die drei Bestandteile im Arbeitsbaum entfernen.

```bash
git rm -r tasks .taskmaster
git rm Taskfile.taskmaster.yml
```

- [ ] Den `taskmaster:`-Include aus `Taskfile.yml` entfernen (bei Planerstellung Zeile 77/78,
      vor dem Edit die aktuelle Stelle suchen statt der Zeilennummer vertrauen).

```bash
grep -n -B1 -A2 'Taskfile.taskmaster.yml' Taskfile.yml
```

- [ ] Den `task-master-ai`-Block aus `docs/agent-guide/registry/mcp.yaml` entfernen —
      **inklusive** des davorstehenden Kommentarblocks, der die drei Harness-Varianten
      dokumentiert. Die Registry ist SSOT; der Kommentar ohne Eintrag wäre selbst wieder Drift.

- [ ] Die drei Harness-Configs aus der Registry neu erzeugen und den Gleichstand prüfen.

```bash
task mcp:sync
task mcp:check
```

`mcp:sync` schreibt `.mcp.json` und `.opencode/opencode.jsonc` im Repo — beide gehören in den
Commit. Es schreibt zusätzlich `~/.gemini/config/mcp_config.json` außerhalb des Repos; diese
Datei kann nicht Teil des PR sein und ist im Index-Plan als manueller Nachschritt vermerkt.

- [ ] Belegen, dass `task-master-ai` aus beiden versionierten Configs verschwunden ist. Positiv-
      Anker zuerst, sonst bestünde die Prüfung auch bei kaputtem `mcp:sync` über leeren Dateien.

```bash
# Anker: beide Configs enthalten überhaupt Server-Einträge
[ "$(jq -r '.mcpServers | length' .mcp.json)" -gt 3 ] || { echo "FATAL: .mcp.json leer oder kaputt"; exit 1; }
# Aussage: task-master-ai ist weg
[ "$(jq -r '.mcpServers | has("task-master-ai")' .mcp.json)" = "false" ] || { echo "FATAL: task-master-ai noch in .mcp.json"; exit 1; }
grep -q 'task-master-ai' .opencode/opencode.jsonc && { echo "FATAL: task-master-ai noch in opencode.jsonc"; exit 1; }
echo "OK: task-master-ai aus beiden Configs entfernt"
```
