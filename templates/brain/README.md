# brain

Gemeinsames LLM-Wiki (Karpathy-Pattern) von Patrick und Gekko. Rohmaterial
landet in `raw/`, destillierte Wissensseiten in `wiki/`; eine Quartz-Site
publiziert den Wiki-Inhalt (ohne `raw/`) automatisch bei jedem Push auf main.

- Konventionen (verbindlich): [SCHEMA.md](SCHEMA.md)
- Einstieg & How-to: [wiki/usage.md](wiki/usage.md)
- Spickzettel: [wiki/cheatsheet.md](wiki/cheatsheet.md)
- Qualitätsziele G-BRAIN01–11: [wiki/quality-goals.md](wiki/quality-goals.md)
- CI rot? [wiki/first-aid.md](wiki/first-aid.md)
- LLM-Anreicherung: [wiki/llm-workflows.md](wiki/llm-workflows.md)

Qualitäts-Gates (Wikilink-/Frontmatter-Lint, Secret-Scan) laufen auf jeden
Push/PR; der Site-Build startet nur nach grünem Lint.
