# Design: K3 Code-Graph Visualisierung

## Erhebungsplan

### 1. Infrastruktur-Survey

| Frage | Methode | Erwartet |
|-------|---------|----------|
| Physischer Speicher | `ls -la .codebase-memory/` | graph.db oder graph.db.zst |
| Index-Trigger | `grep -r 'index_repository' scripts/ .github/` | manuell, Hook, oder CI |
| detect_changes Mechanismus | `grep -r 'detect_changes' scripts/` | git diff gegen base_branch |
| Indizierte Projekte | MCP `list_projects` | Liste + Alter je Index |
| Tools im /tools-Katalog | `curl :8098/v1/tools` | 14 Tools bestätigt |

### 2. Transport-Matrix

| Transport | Ziel | Protokoll |
|-----------|------|-----------|
| stdio (Kindprozess) | llama-server :8098 | lokaler Prozess |
| MCP (stdio) | opencode Harness | `opencode.jsonc` |
| MCP (stdio) | Claude Code Harness | `mcp.json` / `settings.json` |
| MCP (stdio) | agy Harness | `agy.yaml` |

### 3. K1/K3-Verhältnis-Analyse (Defekt D8)

```
┌─────────────────────────────────────────────────┐
│              K1 (Vektor-Embeddings)              │
│  bge-m3 :8095 → embeddings.ts → Vektorsuche     │
│  Index: openspec/specs/, docs/, code chunks      │
│  Semantische Suche (Bedeutung, nicht Syntax)     │
├─────────────────────────────────────────────────┤
│              K3 (Code-Graph)                     │
│  codebase-memory-mcp → search_graph, trace_path  │
│  Index: Symbole, Aufrufketten, Routen            │
│  Strukturelle Suche (Abhängigkeiten, Caller)     │
├─────────────────────────────────────────────────┤
│  GETRENNT?                                      │
│  ✓ Verschiedene Abfragearten (Semantik vs. Graph)│
│  ✓ Verschiedene Indexläufe                       │
│  ✗ Keine Querverweise zwischen beiden            │
│  ✗ Divergenz unbemerkt (kein Reconciliation)     │
└─────────────────────────────────────────────────┘
```

### 4. Auseinanderlauf-Stellen

Punkte, an denen K1 und K3 divergieren können, ohne dass es auffällt:
- Index-Zeitpunkt: K1 läuft bei Commit (post-commit Hook), K3 manuell/periodisch
- Scope: K1 indiziert spec/docs, K3 indiziert Code-Symbole — aber Überschneidungen (z.B. docstrings in Code) werden doppelt und potenziell inkonsistent erfasst
- Aktualität: unterschiedliche Index-Alter → Suche liefert Ergebnisse aus verschiedenen Zeitpunkten
