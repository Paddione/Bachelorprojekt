---
name: toolset-curate
description: Interaktive Kuration der Werkzeug-Registry (capabilities.yaml) für unreviewed Einträge.
---

# toolset-curate Skill

Verwende diesen Skill, um unkuratierte Werkzeug-Einträge (`unreviewed`) in `docs/agent-guide/registry/capabilities.yaml` zu prüfen und eine Begründung zu erfassen.

1. `node scripts/toolset/collect.mjs` ausführen, um verbleibende unkuratierte Werkzeuge zu finden.
2. Für jeden Eintrag den kanonischen Status klären.
3. `capabilities.yaml` aktualisieren und `node scripts/toolset/sync.mjs` ausführen.
