# Recall-Routing (K1/K3/K4)

Dieses Dokument definiert das Recall-Routing von Wissensabfragen über die drei Brain-Schichten
nach dem Architektur-Umbau aus ADR-009 (Epic T900447). Für Agenten gilt primär der
Entscheidungsbaum nach Fragetyp; die lineare Schichtreihenfolge greift als Fallback.
Ziel ist es, unnötige Grep-Sweeps zu vermeiden und die jeweils präziseste Schicht
direkt anzusteuern. Die Schichten K1, K3 und K4 erfüllen klar getrennte Rollen im System.

## Entscheidung nach Fragetyp

Agenten wählen die Einstiegsschicht anhand der Art der Fragestellung:

1. **K3 zuerst — bekanntes Symbol oder Call-Chain:**
   Liegt ein Symbol-, Funktions-, Routen- oder Klassenname vor, ist `codebase-memory-mcp`
   die erste Wahl (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`).
   Der Wissensgraph liefert präzise Struktur- und Aufrufinformationen ohne Halluzinationen.
   Dies ist die primäre Schicht für Code-Navigation und Architektur-Analysen.

2. **K1 zuerst — semantische Was-Frage:**
   Geht es um thematische Suche über Code, Specs oder Dokumentation ohne konkreten
   Symbolnamen, liefert `bge-mcp` (`bge_embed`, `bge_rerank`) den Roh-Recall.
   K1 findet relevante Chunks über Embedding-Ähnlichkeit im Vektorraum.
   Geeignet für Konzeptfragen und textuelle Querverbindungen.

3. **K4 zuerst — Doktrin/Prozess:**
   Für verbindliche Architektur-Entscheidungen, Runbooks, Gotchas oder Karten
   wird der im Repository gepflegte Kern direkt unter `docs/` gelesen.
   Hierfür existiert kein MCP-Server mehr; die Dokumente werden direkt konsultiert.
   Hier gelten die verbindlichen Vorgaben und Konventionen.

## Fallback-Reihenfolge

Lässt sich eine Anfrage keinem eindeutigen Fragetyp zuordnen, gilt die Default-Kette:

- **K1→K3→K4**: Roh-Recall → Präzisions-Check → Doktrin.
- Erst über K1 semantisch relevante Chunks finden, Treffer bei Bedarf über K3
  auf Symbol- und Aufrufebene verifizieren, Doktrin aus K4 hinzuziehen.
- Grep und Glob dienen nur als letzte Reserve für String-Literale und Konfigurationen.
- Ein unüberlegtes Durchsuchen des Repositories per Grep ist zu vermeiden.

## Frische

Die drei Schichten unterliegen unterschiedlichen Frische- und Aktualisierungs-Garantien:

| Schicht | Typ | Frische & SLA |
|---|---|---|
| **K1** Embeddings | Roh-Recall | `merge-gekoppelt, keine Zeit-SLA` |
| **K3** Code-Graph | Präzision | `Bound Intervall+Dauer ≤ ~1h` |
| **K4** Authored-Docs | Doktrin | `Authoring-Zeitpunkt` |

- **K1 (Embeddings):** Aktualisierung erfolgt merge-getrieben per CI-Workflow
  (`.github/workflows/k1-embed.yml`) bei jedem Push auf `main` ohne festes Zeit-SLA.
  Frische-Kriterium ist der erfolgreiche CI-Lauf auf Merge.
- **K3 (Code-Graph):** Der Graph wird periodisch stündlich per Cron aktualisiert
  (`scripts/cbm-refresh-cron.sh`); das Alter hinkt maximal dem Intervall plus
  Refresh-Dauer hinterher (`Bound Intervall+Dauer ≤ ~1h`).
- **K4 (Authored-Docs):** Die Dokumentation im Repo ist zum Authoring-Zeitpunkt verbindlich
  und entspricht stets dem aktuellen Git-Commit-Stand im Arbeitsbaum.

## K4-Kernorte

Der autorisierte Wissenskern verbleibt an folgenden vier Orten im Repository:

- `docs/adr/`: Architektur-Entscheidungs-Records (inklusive ADR-009).
- `docs/runbooks/`: Betriebs-, Wartungs- und Migrations-Handbücher.
- `docs/superpowers/references/gotchas-footguns.md`: Kanonische Gotchas und Footguns.
- `docs/agent-guide/maps/`: Prozess-, Werkzeug- und Agentenkarten.

## Ownership

- **Status:** Epic-owned (T900447), kein Personen-Owner.
- Da im Projekt keine `CODEOWNERS` oder personenbezogene `agent:`-Felder existieren,
  liegt die Verantwortung beim gesamten Agenten-Kollektiv und den jeweiligen Epics.
- Änderungen am Recall-Routing bedürfen einer Abstimmung im Agenten-Team.

## Weiterführend

- [Code-Wissensgraph K3](./k3-code-graph.md)
- [ADR-009 Brain 3-Layer-Architektur](../adr/ADR-009-brain-3layer-architektur.md)
- [MCP-Tool-Guide](../../.opencode/skills/references/mcp-tool-guide.md)

> Annahme (Design E3, Review offen): Karten := docs/agent-guide/maps/. Einzige unbelegte Vokabel; bei Widerspruch nur diese Zeile plus K4-Kernorte tauschen.
