# ADR-010: OpenSpec ad acta — agentennative Konventionen

- Status: Entwurf (T900560, Branch `chore/repo-reorg-T900560`)
- Datum: 2026-09-27
- Kontext-Dossier: `.agents/docs/reorg-phase2/`

## Kontext

OpenSpec (`openspec/`: 131 Specs, 932 archivierte Changes, 0 aktive) sollte
Spezifikation und Code synchron halten. In der Praxis ist der Code den Specs
davonlief: 800 Dateien außerhalb von `openspec/` referenzieren OpenSpec-Pfade,
die lebendigen Verträge stehen in BATS-Guards (`tests/spec/`), `scripts/` und
`Taskfile.yml`. Jede Änderung zahlt doppelt: Code ändern + Spec-Delta pflegen +
archivieren. Phasen-Trennung (`propose`/`apply`/`archive`) und Merge-Konflikte
in Change-Dateien bremsen Multi-Agenten-Betrieb.

## Entscheidung

1. OpenSpec wird entfernt (`openspec/`-Löschung als letzte Charge C7b).
2. Gültige Architekturentscheidungen werden als ADRs nach `docs/adr/` extrahiert
   (C7a); der Rest verfällt mit dem Verzeichnis.
3. SSOT-Rollen gehen über auf: Code + BATS-Guards + `tests/evals/` (Verträge),
   `AGENTS.md` + `llms.txt` (Einstieg), `.agents/docs/` (Dossiers),
   `.agents/memory/learnings.md` (Lernschleife), `.mcp.json` + AST-Toolchain
   (Introspektion: ast-grep, RepoMapper, Tach/dep-cruiser).
4. Etablierte Häuser bleiben: `.agents/` (kein `.agent/`-Duplikat),
   `assets/schemas/` (kein `schemas/`-Duplikat), `.mcp.json` (kein
   `.tools/mcp-servers.json`), go-task (kein Makefile). Begründungen im Dossier
   (`target-tree.md`, Abweichungen 1–6).
5. Planungs-Workflow (`dev-flow-*`-Skills, `ticket stage-plan`, `plan-lint`,
   CI-Guards) wird in C7a von OpenSpec-Pfaden entkoppelt.

## Konsequenzen

- Positiv: eine Wahrheit (Code + Guards), kein Delta-Overhead, skalierbarer
  Multi-Agenten-Betrieb, jedes Modell versteht AGENTS.md/llms.txt ohne Spezial-Prompting.
- Negativ: ~800 Dateien mit OpenSpec-Referenzen müssen migriert werden (C7a);
  Spec-Prosa geht verloren (akzeptiert — stale); Skills und CI brauchen Umbau.
- Risiken: übersehene Guard-Referenz macht CI rot (Mitigation: Grep-Verifikation
  pro Charge, `test:changed`, `workspace:validate`); Wissensverlust bei
  ADR-Extraktion (Mitigation: Review des Extrakts vor Löschung, C7b erst nach Freigabe).
