# brain-ingest — Brain-Wiki Kompilierung

## Was ist das?
Orchestriert die vollautomatische Brain-Wiki-Ingestion: generiert die Worklist aus
`scripts/brain/ingest-sources.yaml`, transformiert jede Quelldatei per LLM
(`scripts/brain-ingest-transform.sh`) in eine Wiki-Seite und liefert das Ergebnis
per PR an das externe `Paddione/brain`-Repo aus.

## Ziel
Aktuelle Wiki-Seiten für alle `openspec/specs/*.md` SSOT-Specs + Runbooks + ADRs +
Gotchas/Footguns + Agent-Guide-Maps + Core-Repo-Doku + Health-Goals + Diagramme
im `brain`-Repo halten.

## Schritte

### 1. Trockenlauf (kein Commit/PR im brain-Repo)
```bash
bash scripts/brain-ingest.sh --brain-repo ~/brain --dry-run
```

### 2. Pilot-Lauf (nur die ersten N Quellen)
```bash
bash scripts/brain-ingest.sh --brain-repo ~/brain --pilot 5
```

### 3. Voller Lauf (per Taskfile.brain.yaml, falls vorhanden)
```bash
task brain:ingest:dry    # Trockenlauf
task brain:ingest:pilot  # Pilot
task brain:ingest:run    # Voller Lauf inkl. PR
```

Intern generiert `brain-ingest.sh` die Worklist über
`scripts/brain-ingest-worklist.sh --root <repo> --manifest scripts/brain/ingest-sources.yaml`
(TAB-separiert: Pfad, Slug, Gruppe) aus allen `openspec/specs/*.md`-Dateien (Glob, kein
fixer Count) plus den übrigen Manifest-Gruppen.

### 4. Prune (Deletion-Sync)
Listet Wiki-Seiten, deren Bachelorprojekt-Quelle gelöscht wurde (default dry):
```bash
bash scripts/brain-ingest-prune.sh --brain-repo ~/brain
bash scripts/brain-ingest.sh --brain-repo ~/brain --prune   # scharf, inkl. State-Cleanup
```
Meta-Seiten (source `self` oder ohne Bachelorprojekt-Präfix und ohne State-Eintrag)
werden nie gelöscht.

## Artefakte
- `~/.brain-ingest-state.json` (Idempotenz-State: Quellhash → transformierte Seite)
- `<brain-repo>/wiki/*.md` (transformierte Wiki-Seiten mit Citations, im externen
  `Paddione/brain`-Repo, nicht in diesem Repo)
- `scripts/brain-ingest-prune.sh` (Deletion-Sync: entfernt Wiki-Seiten ohne lebende
  Bachelorprojekt-Quelle, default dry-run, siehe Schritt 4)
- Ein PR gegen `Paddione/brain` (Phase 4 von `brain-ingest.sh`, übersprungen bei `--dry-run`)

## Next Steps
- T001570: CI-Gates (`task test:changed`, `freshness:regenerate`)
- Brain-Wiki regelmäßig synchronisieren (`.github/workflows/brain-merge-hook.yml` deckt
  Push-getriggerte Teil-Syncs ab; `brain-ingest.sh` ist der volle LLM-Ingest-Lauf)


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

