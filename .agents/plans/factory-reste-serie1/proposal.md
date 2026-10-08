# Proposal: T900563 Software-Factory-Reste — Serie 1 (Skripte, CI-Texte, Docs, Test-Kommentare)

## WARUM
Ticket T900563 (type refactor, pri niedrig) verlangt, Software-Factory-Reste in
Code, Website, Tests und Specs zu entfernen. Messbefehl im Ticket:
`git grep -I -l -i factory <sha> -- . :!openspec/changes/archive
:!openspec/specs/archive :!docs/superpowers/plans :!docs/superpowers/specs
:!scripts/llm/measurements | wc -l` — Stand Ticket: 670 Dateien (PRE 0425e2bc3),
Stand HEAD 861da3387: **443 Dateien** (374 ohne `.agents/plans`-Historie).
User-Entscheidung (Ticket-Kommentar 2026-10-07): **INKREMENTELL** — kleine
Chore-Serie mit disjunkten Partials (Skripte, Website-Factory, Tests, Specs),
je eigener PR.

## Pfad-Entscheidung (Schritt 0)
Formal ist Serie 1 ein **chore-artiger Refactor ohne Verhaltensänderung**: es
werden ausschließlich tote Prosa/Kommentare/Meldungstexte bereinigt; aktive
Verträge (DB-Schema `tickets.factory_*`, `FACTORY-PLAN-REF`, CSS-Vars,
Cockpit-Typen, Guard-Selbstreferenzen) bleiben unangetastet. Statt der
dev-flow-chore-Ein-Pass-Route wird wegen Umfang (374 Live-Dateien) und der
geforderten PR-Serie bewusst via **dev-flow-plan als gestagter Multi-Partial-
Plan** geplant; Ausführung je Partial/PR durch dev-flow-execute.

## Wichtige Vorbefunde (Phase A, PRE 861da3387)
- T900399 (Decommission), T900727 (Website A3a), T900728 (Rest A3b) sind
  **done**; Guards `sf-retirement-rest/web` sind **grün**. Die 300+113 Dateien
  in `tests/fixtures/sf-retirement/{rest,web}.txt` sind per präzisem
  Retirement-Regex bereits sauber — der Ticket-Messbefehl (`-i factory`,
  Substring) zählt bewusst weiter: CSS-Vars (`--factory-*`), Typnamen
  (`FactoryTicket`, `FactoryDefault`), DB-Tabellen (`tickets.factory_*`),
  Historien-Kommentare, ADRs, Frozen Records. **Blindes Löschen ist verboten.**
- Bereits bereinigt (auf HEAD nicht mehr vorhanden): `scripts/factory-task-
  packet.sh`, `.opencode/plugin/mcp-client-tokens-env.ts`,
  `tests/spec/software-factory`, `tests/factory-eval`, `openspec/specs`-Treffer
  (0), `.claude/workflows/agentic-trends-radar.js` (0 Treffer),
  `repo-hygiene-tick-snapshot-guard.bats` (0 Treffer).
- AKTIV, daher in Serie 1 explizit ausgenommen: `tickets.factory_phase_events`
  / `factory_control` / `factory_run_budget` / `v_factory_metrics` (gelesen/
  geschrieben von `components/website/src/lib/{qa-dal, sdlc/cockpit-budget,
  sdlc/cockpit-floor}.ts`, `cockpit-*.test.ts`, `scripts/vda/ticket/
  stage-plan.sh`-SQL); `FACTORY-PLAN-REF`; `--factory-*`-CSS-Vars (aktives
  Cockpit-Designsystem); `FactoryTicket`/`FactoryDefault`-Typen (aktive
  llm-proxy-default-Verdrahtung); `test-factory`-Aggregator-Name (CI);
  `commitlint`-Scope-Keys; alle Guard-Selbstreferenzen
  (`decommission-guard.bats` 89 Treffer, `sf-retirement-*.bats`,
  `os-retirement-*`); `scripts/migrations/*` (immutabel); `docs/adr/*`
  (Entscheidungsrecords, unveränderlich); `.agents/plans`-Historie;
  Fixture-Golden-Sets (`mishap-dedupe-korpus.json`, `golden-queries.json`).
- Prior Art (Schritt 0.7): `docs/adr/ADR-005` (Factory-Pipeline/-Floor als
  historischer Kontext — behalten), `docs/adr/ADR-006` (Factory-Kern auf
  Dev-Host — behalten); Guards in `tests/spec/sf-retirement-*.bats`,
  `tests/spec/decommission/decommission-guard.bats` — alle behalten und grün.

## WAS — Serie 1 (dieser Plan, 4 Partials, disjunkt)
Nur tote Texte, je Datei Einzelprüfung aktiv/tot (Guards beachten):
- **P1 Skripte**: `scripts/repo-hygiene-precheck.sh` (3 Kommentar-Zeilen:
  Factory-Lock-Historie umformulieren), `scripts/vda/ticket/stage-plan.sh`
  (nur User-Meldungen Z. 60/69/74/163/172 + `factory.service`-Hinweis;
  SQL-/REF-Zeilen 131–157 unangetastet), `scripts/lib/ticket-help.sh`
  (1 Kommentar-Zeile), `scripts/plan-touched-files.sh` (1 Kommentar-Zeile).
- **P2 CI-Texte**: `commitlint.config.cjs` (nur Hinweis-Texte, Scope-Keys
  `factory`/`factory-floor` bleiben als Redirect-Guards),
  `.github/workflows/{ci,post-merge,e2e-pr,opencode,codeql}.yml` (nur
  Kommentare; `test-factory`-Aggregator-Name bleibt).
- **P3 Docs**: `docs/sdlc-stack/README.md`, `docs/sdlc-stack/e3-cutover.md`,
  `docs/runbooks/freetoken-native.md`, `docs/runbooks/db-audit-playbook.md`,
  `docs/superpowers/references/factory-usage.md` (Prosa-Umformulierung;
  ADRs/repo-index/frozen Records ausgenommen).
- **P4 Test-Kommentare**: `tests/spec/{agent-roster,database,
  pipeline-interface,website-core,ci-cd}.bats` (nur Kommentar-Prosa;
  Fixture-Strings wie `vda-frontmatter` „factory tooling change" nur ändern,
  wenn kein Test-Input — sonst stehenlassen und dokumentieren).
- Rot→Grün-Nachweis je Partial: `git grep -i factory -- <partial-Dateien>`
  vorher >0 (`expected: FAIL` = Reste vorhanden), nachher 0; bestehende
  Guards (`sf-retirement-rest/web`, `decommission-guard`) bleiben grün.

## Next-Steps (Folge-Serien, NICHT Teil dieses Plans)
- **Serie 2 — Website-Factory-Begriffe**: `--factory-*`-CSS-Vars,
  `FactoryTicket`/`FactoryDefault`/`factoryDefault`, `cockpit-floor-types.ts`
  `driver: 'factory'` — reines Rename, großes Diff, eigenes Review; ggf. mit
  API-Alias-Phase.
- **Serie 3 — DB-Schema-Namen**: `tickets.factory_*` →
  neutrale Namen — braucht Migration + API-/DAL-Umbau + Tests; eigenes
  ADR-Delta, kein Kommentar-PR.
- **Serie 4 — Rest-Prosa**: `.opencode/skills/*` (18 Dateien),
  `scripts/llm/*`, `tests/e2e/*`, `tests/fixtures/*` (ohne Golden-Sets),
  `docs/*`-Rest, `scripts/*`-Rest (ohne migrations), `components/brett`,
  `dotfiles/nvim`, `tools/dsh`, `ml/qwen35-agents` — jeweils eigene
  disjunkte Partials nach demselben aktiv/tot-Protokoll.
- Jede Folge-Serie: eigener Plan, eigener Branch `chore/<slug>-T900563-F<n>`,
  eigener PR; Messbefehl pro Serie vorher/nachher im Ticket kommentieren
  (Mess-Konvention T002717: Befehl + PRE-SHA im Code-Block).
