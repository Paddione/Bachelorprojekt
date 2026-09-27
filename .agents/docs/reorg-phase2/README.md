# Reorg Phase 2 — Agentennative Struktur + OpenSpec ad acta

Ticket: T900560 · Branch: `chore/repo-reorg-T900560` · Stand: Plan (kein PR, keine Ausführung)

## Kontext

Phase 1 (2026-08-15, T006999, Design:
[repo-structure-reorg-design.md](../../../docs/superpowers/specs/2026-08-15-repo-structure-reorg-design.md))
ist umgesetzt: `components/`-Gruppierung, MD-Kur nach `docs/agent-context/`,
QWEN/GEMINI als Zeiger. Bewusst out of scope waren damals u. a. `openspec/`,
`environments/`, Root-Configs und Betriebs-Ordner.

Phase 2 schließt die Lücke: OpenSpec wird ad acta gelegt, die Root wird auf eine
agentennative Struktur umgestellt (AGENTS.md-SSOT, `llms.txt`, `.agents/docs/`,
`.agents/memory/`, `tests/evals/`), Stale-Artefakte werden entfernt.
Grundlagen: 10-Punkte-Papier des Users (AGENTS.md/llms.txt/AST-Toolchain),
Vermessung siehe [inventory.md](inventory.md).

## Was dieser Plan ist — und nicht ist

- **Ist:** Zielbaum ([target-tree.md](target-tree.md)), Stale-Liste mit Messbelegen
  ([stale-list.md](stale-list.md)), Chargen-Schnitte unten. Ausführung danach als
  einzeln mergbare Chores, eine Charge = ein atomarer Commit (`git mv` + Referenzen).
- **Ist nicht:** Prod-Manifest-Moves (`k3d/`, `prod*/`, `flux/` — Produktionsrisiko ohne
  Verständnis-Gewinn, Entscheidung aus Phase 1 bleibt), `scripts/`-Innenrevision
  (910 Dateien, eigenes Epic), `components/*`-Innenarchitektur (Tach/dep-cruiser
  kommen als Linter, nicht als Reorg).

## Chargen (Ausführungsreihenfolge, Risiko aufsteigend)

| # | Charge | Inhalt | Risiko |
|---|--------|--------|--------|
| C0 | Lokal putzen (kein Commit) | `scratch/`-VM-Images auslagern, leeres `website/` löschen, `skills.json`, `.mishaps.log`, `.gemini/`/`.vscode/`/`.lighthouseci/` klären — alles gitignoriert, reine User-Aktion | keins |
| C1 | Einstiegs-Doku | `llms.txt` neu, AGENTS.md-Diät (21 KB → schlank + Verweise), CLAUDE.md auf Import + Harness-Abschnitt dünnen | trivial |
| C2 | Mini-Moves | `claude-code/` → `dotfiles/claude-code/`, `openclaw/.env.example` → `dotfiles/openclaw/` (+ Taskfile-Refs), `.openclaw/workspace-state.json` untracken + ignorieren | klein |
| C3 | Brand-Assets | `environments/{korczewski,mentolder}`-Assets → `assets/brands/`, `renovate.json5`-Ignores + Indexe nachziehen | klein |
| C6 | Agent-Gedächtnis | `.agents/memory/learnings.md` seeden, `.agents/docs/`-Konvention festschreiben | trivial |
| C1b | AGENTS-Tiefendiät | Richtung Advisory-Ziel ≤160 (derzeit 259): nur mit Guard-Umbau möglich (Interaction-Contract-, Runtime-Tabellen-, Routing-Pins); läuft nach C6, vor C7 | mittel |
| C4 | Taskfile-Diät | Root-`Taskfile.yml` (5.428 Zeilen) auf Includes + Aliase (< 300 Zeilen), Bodies → `taskfiles/` | mittel |
| C5 | Eval-Harness | `tests/evals/` anlegen, Golden-Guards umhängen, `.githooks/`- + CI-Schutz vor Agent-Writes | mittel |
| C8 | docs-Innenreorg | `archive/`, `generated/`, `legacy-html/`, `drift-reports/`, `audits/` konsolidieren; `.docx`-Verbleib entscheiden | mittel |
| C9 | AST-Toolchain | ast-grep + RepoMapper-MCP + Tach/dep-cruiser verdrahten, `.mcp.json`-Einträge, Doku | mittel |
| C7 | OpenSpec-Abriss (zuletzt) | a) ADR-Extraktion nach `docs/adr/`, Guard-Entkopplung (~800 Refs außerhalb `openspec/`), Skill-Umbau (`dev-flow-*`, `openspec-*`, `ticket stage-plan`); b) `openspec/` löschen | hoch |

C7 läuft zuletzt, weil bis dahin Guards, Skills und CI noch auf OpenSpec-Pfaden stehen.

## Verifikation pro Charge (Pflicht, aus Phase 1 übernommen)

1. `grep -rn '<alter-pfad>'` muss leer sein (ohne `node_modules/`, `.git/`, generierte Indexe).
2. `task test:changed` grün; betroffene BATS-Specs gezielt.
3. `task workspace:validate` bei Manifest-Berührung; final `task freshness:regenerate` + `check`.
4. Ein Move = ein Commit; PR-Titel `chore(T900560): … [T900560]`; squash-merge.

## Entscheidungslage

- ADR: [ADR-010](../../../docs/adr/ADR-010-openspec-ad-acta-agentennativ.md) (Entwurf in diesem Branch).
- Abweichungen vom 10-Punkte-Papier (6 Stück, alle begründet): siehe
  [target-tree.md](target-tree.md) — Kurzform: kein `.agent/` neben `.agents/`,
  kein `schemas/` neben `assets/schemas/`, kein `.tools/mcp-servers.json` neben
  `.mcp.json`, `docs/adr/` statt `docs/decisions/`, Taskfile statt Makefile.
- Freigabe erforderlich vor C7b (`openspec/`-Löschung, destruktiv) sowie vor C8-`.docx`-Löschung falls gewählt.
