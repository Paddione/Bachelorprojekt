# Dokumentationswegweiser

Dieser Index verlinkt die gepflegten Einstiegspunkte. Konfiguration, Spezifikationen und generierte Übersichten bleiben an ihren bisherigen Pfaden.

## Entwicklung und Orientierung

- [Repository-Einstieg](../README.md) und [Beitragen](../CONTRIBUTING.md)
- [Agent-Kurzreferenz](../AGENTS.md), [ausführliche Arbeitsreferenz](../CLAUDE.md) und [Agent-Guide](agent-guide/README.md)
- [Skills und Arbeitsabläufe](../.agents/skills/)
- [Website-Entwicklung](../components/website/CLAUDE.md)
- [Generierte Architektur](diagrams/architecture.md) und [Spezifikationsatlas](spec-atlas.md)

## Betrieb und Konfiguration

- [Flux-Konfiguration](../flux/clusters/fleet/) und [Suspensionen](runbooks/flux-suspensions.md)
- [Umgebungs-Schema](../environments/schema.yaml) und [Domain-Konfiguration](../k3d/configmap-domains.yaml)
- [Devmesh-Zugang](runbooks/devmesh-tailnet.md), [Inventar](../devmesh/inventory.yaml) und [lokale Tasks](../taskfiles/Taskfile.devmesh.yml)
- [Pocket-ID-Bootstrap](runbooks/pocket-id-bootstrap.md)
- [Git-crypt-Key-Verteilung](runbooks/git-crypt-key-distribution.md)
- [Weitere Runbooks](runbooks/)

## Entscheidungen und Historie

- [Architekturentscheidungen](adr/) — Status und Nachträge der jeweiligen ADR beachten; [ADR-008](adr/ADR-008-local-k3s-dev-mesh.md) beschreibt das lokale Dev-Mesh.
- [Aktuelle OpenSpec-Spezifikationen](../openspec/specs/), [laufende Änderungen](../openspec/changes/) und [Change-Archiv](../openspec/changes/archive/)
- [Historischer Dev-Stack](dev-stack/README.md) — die dortigen k3d-Schritte sind als veraltet markiert.
- [Frühere Planungsdokumente](superpowers/) und [alte HTML-Dokumentation](legacy-html/)

Historische Dokumente bleiben als Belege erhalten. Für neue Arbeit zuerst die aktuellen Spezifikationen, Konfiguration und Runbooks verwenden. Generierte Dateien werden über ihre Generatoren aktualisiert (`task freshness:regenerate`).
