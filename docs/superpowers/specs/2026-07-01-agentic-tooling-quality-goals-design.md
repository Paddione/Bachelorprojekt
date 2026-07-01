---
ticket_id: T001398
plan_ref: openspec/changes/agentic-tooling-quality-goals/tasks.md
status: active
date: 2026-07-01
---

# Agentic-Tooling Quality Goals — neue G-AGENTIC-Kategorie in `.claude/lib/goals.md`

**Branch:** `feature/agentic-tooling-quality-goals`
**Datum:** 2026-07-01
**Baseline (live, 2026-07-01):** 17 neue Kandidaten-Ziele identifiziert, davon 10 mit heute aktivem Verstoß
**Target:** 17 neue Ziele (`G-AGENTIC01`–`G-AGENTIC17`) reproduzierbar gemessen, alle Verstöße behoben (alle starten grün)
**Aufwand:** ~1 Tag (10 kleine Doku-/Config-Fixes + 17 neue Bash-Checks + Wiring in `health-goals-check.sh`)
**Reproduzierbar:** ja (alle 17 Checks sind Ein-/Wenige-Zeilen-Bash/Python-Befehle, analog zu bestehenden G-*)

## Intent (WARUM)

`.claude/lib/goals.md` misst bisher nur die "Produkt"-Seite des Repos (Website-Code, K8s-Manifeste,
Deps, Docs, DORA). Die **Agentic-Tooling-Seite selbst** — Custom-Subagents (`.claude/agents/*.md`),
Skills (`.claude/skills/*/SKILL.md`), MCP-Server-Konfiguration (`.mcp.json` / `.opencode/opencode.jsonc`)
und agentische Slash-Commands (`.claude/commands/`, `.opencode/commands/`) — hat **keine einzige**
quantifizierbare Qualitätsmetrik, obwohl genau diese Artefakte den Blast-Radius jedes Subagenten-Dispatches
bestimmen (Tool-Scope, Routing-Korrektheit, MCP-Verfügbarkeit, Command-Existenz).

Eine Explorations-Runde (4 parallele Subagenten, Details siehe Anhang) hat den Ist-Zustand kartiert und
**17 konkrete, reproduzierbar messbare Kandidaten-Ziele** gefunden. Ein wiederkehrendes Muster: mehrere
Artefakte behaupten explizit "authoritative"/"SSOT" zu sein, sind es aber nachweislich nicht mehr
(AGENTS.md vs. echtes Agenten-Frontmatter, CLAUDE.md vs. echte opencode-MCP-Registrierung,
mcp-tool-guide.md vs. echte `.mcp.json`-Serverliste). Das ist exakt die Klasse von Silent-Failure, die
`.claude/lib/goals.md` für den Produktcode bereits systematisch fängt (G-DOC01, G-RH04 etc.) — jetzt auch
für das Agentic-Tooling selbst.

**Brainstorming-Entscheidungen (Lavish-Board, 2026-07-01):**
1. Alle 17 Kandidaten werden übernommen (keine Streichung).
2. **Einheitliches Präfix** `G-AGENTIC01`–`G-AGENTIC17` (nicht 4 separate Domänen-Präfixe) — einfachere
   Referenzierbarkeit für eine zusammenhängende neue Kategorie "Agentic Tooling".
3. **Alle reproduzierbaren Kandidaten werden sofort in `scripts/health-goals-check.sh` verdrahtet**
   (kein "erst dokumentieren, Messung später" — das war für den vorherigen AskUserQuestion-Schritt
   bereits als Default gewählt worden).
4. **Alle 10 heute aktiven Verstöße werden im selben Change gefixt** (nicht nur getrackt) — die
   Root-Causes sind durchweg kleine, risikoarme Doku-/Config-Korrekturen. Damit starten **alle 17 Ziele
   grün** (kein neuer Prio-A-Eintrag in goals.md nötig).

## Die 17 Ziele

| ID | Domäne | Ziel | Klasse | Baseline → Target | Fix in diesem Change? |
|---|---|---|---|---|---|
| G-AGENTIC01 | Subagents | Tool-Scope-Explizität (security/infra/db haben `tools:`-Feld) | Target | 3 unscoped → dokumentiert, kein Zwangs-Fix | Nein — echtes Least-Privilege-Scoping ist eigenständige Sicherheitsarbeit pro Agent, nicht Teil dieses Changes |
| G-AGENTIC02 | Subagents | Routing-Tabellen-Drift (AGENTS.md/CLAUDE.md vs. echtes Frontmatter) | Gate | 1 Abweichung → 0 | **Ja** — `kore`≠`korczewski`-Typo in AGENTS.md |
| G-AGENTIC03 | Subagents | Frontmatter-Vollständigkeit (name/description vorhanden, name==Dateiname) | Gate | 0 ✓ heute → 0 (halten) | Bereits grün |
| G-AGENTIC04 | Subagents | `agent-library.bats` CI-Erreichbarkeit (test:changed-Bucket deckt `.claude/agents/`/AGENTS.md ab) | Gate | nein → ja | **Ja** — Taskfile Smart-Selection-Regex erweitern |
| G-AGENTIC05 | Subagents | 6-Agenten-Liste Cross-Reference (Dateien ↔ `ROUTING_AGENTS` ↔ Registry) | Gate | 0 diff ✓ heute → 0 (halten) | Bereits grün |
| G-AGENTIC06 | Skills | OVERVIEW.md Inventar-Drift (behauptete Zahl vs. `find`-Zahl) | Gate | Diff 15 (12 behauptet, 27 real) → 0 | **Ja** — OVERVIEW.md-Tabellen korrigieren |
| G-AGENTIC07 | Skills | Orphaned Skills (nirgends referenziert) | Gate | ≥1 (repo-hygiene) → 0 | **Ja** — Referenz in OVERVIEW.md/AGENTS.md ergänzen |
| G-AGENTIC08 | Skills | Broken Script/Task-Referenzen in SKILL.md | Gate | ≥1 (keycloak-ensure-mappers.sh) → 0 | **Ja** — infra-ops/SKILL.md auf pocket-id-Realität korrigieren |
| G-AGENTIC09 | Skills | God-Skill Zeilenbudget (SKILL.md > 500 Zeilen) | Target | 3 (662/595/580) → dokumentiert, kein Split erzwungen | Nein — Split ist eigenständiger Refactor, kein 1-Zeilen-Fix |
| G-AGENTIC10 | Skills | Agent-Feld Rückverweis (jeder Agent hat ≥1 Skill mit `agent:`-Feld) | Target | 3/6 → dokumentiert, kein Zwang | Nein — hängt von Produktentscheidung zum Dispatch-Mechanismus ab |
| G-AGENTIC11 | MCP | CLAUDE.md-Serverliste vs. reale `.opencode/opencode.jsonc` | Gate | 4 Abweichungen (3 Phantome + 1 undok.) → 0 | **Ja** — CLAUDE.md-Satz korrigieren |
| G-AGENTIC12 | MCP | mcp-tool-guide.md Server-Abdeckung | Gate | 6/7 → 7/7 | **Ja** — codebase-memory-mcp-Abschnitt ergänzen |
| G-AGENTIC13 | MCP | Tote Server-Referenzen in Skills (`mcp-browser` nicht registriert) | Gate | 1 → 0 | **Ja** — dev-flow-e2e/SKILL.md auf registrierte Tools umstellen |
| G-AGENTIC14 | MCP | `.mcp.json` ↔ `.opencode/opencode.jsonc` Parity (URL/Pfad) | Gate | 0 ✓ heute → 0 (halten) | Bereits grün |
| G-AGENTIC15 | Commands | Phantom-Command-Referenzen (`/opsx:continue`) | Gate | 1 → 0 | **Ja** — Referenz in apply.md (beide Runtimes) + SSOT-Skill entfernen/korrigieren |
| G-AGENTIC16 | Commands | Claude-Code ↔ opencode Commands-Sync | Gate | 0 ✓ heute → 0 (halten) | Bereits grün |
| G-AGENTIC17 | Commands | S4-Gate-Abdeckung für `.claude/commands/`/`.opencode/commands/` | Gate | Scope fehlt → 0 Orphans nach Erweiterung | **Ja** — `docs/code-quality/gates.yaml` S4-Scope erweitern |

**Bilanz:** 14 Gates (davon 4 bereits heute grün, 10 werden in diesem Change gefixt), 3 Targets
(dokumentiert, bewusst kein Zwangs-Fix — Aufwand/Risiko rechtfertigt keinen 1-Zeilen-Fix).

## Konkrete Fixes in diesem Change (die 10 Root-Causes)

1. **AGENTS.md** — Routing-Tabellen-Zeile `bachelorprojekt-website`: `korczewski` → `kore` (muss
   zeichengenau mit CLAUDE.md und dem echten Frontmatter-Trigger übereinstimmen).
2. **Taskfile.yml** — `test:changed` Smart-Selection-Regex: neuen Bucket für `.claude/agents/**/*.md`
   und `AGENTS.md` ergänzen, der `tests/spec/agent-library.bats` triggert (analog zum bestehenden
   `.claude/skills/`-Bucket).
3. **`.claude/skills/OVERVIEW.md`** — "12 project-local skills" → echte Zahl (aktuell 27); fehlende
   Skills (openspec-apply-change, openspec-archive-change, openspec-explore, openspec-propose,
   references, repo-hygiene, vitest, lavish) in die Tabellen/den Mermaid-Graph aufnehmen.
4. **`.claude/skills/OVERVIEW.md`** (oder AGENTS.md-Koordinationsskill-Aufzählung) — `repo-hygiene`
   referenzieren, damit es nicht mehr als Orphan zählt. (Die inhaltliche Überlappung mit `ticket-ops`
   Phase 4 wird **nicht** in diesem Change dedupliziert — das ist ein separates, größeres Refactoring;
   hier reicht die Referenz-Reparatur für G-AGENTIC07.)
5. **`.claude/skills/infra-ops/SKILL.md`** — toten Verweis auf `task keycloak:sync` /
   `scripts/keycloak-ensure-mappers.sh` entfernen bzw. auf die aktuelle pocket-id-Realität umschreiben
   (Taskfile.yml:2859f. dokumentiert bereits die Entfernung dieser Tasks).
6. **CLAUDE.md** — Satz über die opencode-MCP-Serverliste korrigieren: `mcp-browser`, `mcp-github`,
   `openspec` entfernen (nicht registriert), `codebase-memory-mcp` ergänzen (registriert, aber fehlt in
   der Aufzählung); die Behauptung "configured in .claude/settings.json" auf `.mcp.json` korrigieren.
7. **`.claude/skills/references/mcp-tool-guide.md`** — Abschnitt für `codebase-memory-mcp` ergänzen
   (Tools/Wann-bevorzugen/Fallback, analog zu den bestehenden 6 Abschnitten).
8. **`.claude/skills/dev-flow-e2e/SKILL.md`** — Aufrufe von `mcp__mcp-browser__*` (nicht registriert)
   auf die tatsächlich verfügbare Browser-Tooling umstellen (chrome-devtools-mcp bzw.
   superpowers-chrome, siehe verfügbare MCP-Server in `.mcp.json`/`.opencode/opencode.jsonc`).
9. **`.claude/commands/opsx/apply.md`**, **`.opencode/commands/opsx-apply.md`**,
   **`.claude/skills/openspec-apply-change/SKILL.md`** — Verweis auf `/opsx:continue` /
   `/opsx-continue` / `openspec-continue-change` entfernen oder durch eine tatsächlich existierende
   Recovery-Anleitung ersetzen (z. B. manuelle Konfliktlösung + erneutes `/opsx:apply`).
10. **`docs/code-quality/gates.yaml`** — S4-Gate-Scope um `.claude/commands/**/*.md` (candidate) und
    `.opencode/commands/**/*.md` + `CLAUDE.md` + `AGENTS.md` (reference_sources) erweitern; danach
    `node scripts/code-quality/gates/s4-orphans.mjs` verifizieren (erwartet: 0 Orphans, da Fix #9 den
    einzigen bekannten toten Verweis bereits behebt).

## Wiring — wo die neuen Ziele landen

- **`.claude/lib/goals.md`**: neue Sektion "Agentic Tooling" — 14 Zeilen in der Prio-C-Tabelle
  (`G-AGENTIC02–08, 11–17` minus die als Target laufenden), 3 Prio-B-Absätze für die Targets
  (`G-AGENTIC01`, `G-AGENTIC09`, `G-AGENTIC10`, im Stil von G-FE01/G-FE02: Baseline gemessen, Aufwand
  mittel/groß, kein Gate). Kategorie-Zähler in der Kopfzeile aktualisieren (65 → 82 Ziele, 11 → 12
  Kategorien).
- **`scripts/health-goals-check.sh`**: neue Zeilen unter GATES (11 Stück) und TARGETS (3 Stück) analog
  zum bestehenden `row gate|target <ID> "<messung>" <cmp> <target> "<beschreibung>"`-Muster.
- **`.claude/lib/README.md`**: Goals-Tabellenzeile aktualisieren (Ziel-Anzahl, Kategorien-Liste).
- **`docs/code-quality/gates.yaml`**: S4-Scope-Erweiterung (Fix #10 oben) — wird von G-AGENTIC17
  direkt gemessen.
- **`Taskfile.yml`**: Smart-Selection-Regex-Erweiterung (Fix #2 oben) — wird von G-AGENTIC04 direkt
  gemessen.

Kein neuer eigenständiger Task nötig — die 17 Checks laufen über den bestehenden
`bash scripts/health-goals-check.sh` (und damit `task health:goals:check`, falls vorhanden) mit.

## Warum erreichbar

- Alle 10 Root-Cause-Fixes sind Doku-/Config-Korrekturen ohne Laufzeit-Risiko (keine Prod-Deploys,
  keine DB-Migrationen) — die riskanteste Änderung ist die Taskfile-Regex-Erweiterung (Fix #2), die
  durch `task test:changed` selbst verifiziert wird.
- Die 17 Mess-Befehle sind grep/awk/python3-Einzeiler nach dem exakt gleichen Muster wie die
  bestehenden 65 Ziele in `health-goals-check.sh` — kein neues Tooling nötig.
- Die 3 bewusst nicht gefixten Targets (G-AGENTIC01/09/10) vermeiden Scope-Explosion: echtes
  Tool-Scoping und SKILL.md-Splitting sind eigenständige, risikoreichere Folgearbeiten.

## Edge Cases / Risks

- **G-AGENTIC02/04 (Taskfile-Regex, AGENTS.md-Text)**: Änderungen an Dateien, die von **jedem**
  Agenten/Skill als SSOT gelesen werden — Diff vor Commit besonders sorgfältig gegenlesen, um keine
  neue Drift einzuführen.
- **G-AGENTIC17 (S4-Scope-Erweiterung)**: nach der Erweiterung muss `s4-orphans.mjs` tatsächlich 0
  liefern — falls doch ein weiterer verwaister Command auftaucht (von der Exploration nicht erfasst),
  wird das zum Prio-A-Fund und braucht ein Folge-Ticket statt eines Blockers in diesem Change.
- **Fix #8 (dev-flow-e2e Browser-Tooling)**: reine Doku-Korrektur (SKILL.md-Text), keine Code-Änderung
  an den Playwright-Tests selbst — das Skill wird für den nächsten realen E2E-Lauf korrekt referenzieren,
  ändert aber nicht das Verhalten der Tests in diesem Change.
- **Repo-hygiene/ticket-ops-Überlappung (SKL-2/G-AGENTIC07)**: bewusst NICHT dedupliziert in diesem
  Change — nur die Referenz-Lücke wird geschlossen. Dedup ist ein Kandidat für ein Folge-Ticket.

## Acceptance Criteria

1. `.claude/lib/goals.md` enthält 17 neue `G-AGENTIC01`–`G-AGENTIC17`-Einträge mit Mess-Befehl,
   Baseline, Target, Klasse (Gate/Target).
2. `scripts/health-goals-check.sh --only=G-AGENTIC01,...,G-AGENTIC17` läuft grün für alle 14 Gates
   (die 3 Targets zeigen ihren dokumentierten, bewusst nicht-null Baseline-Wert).
3. Alle 10 in "Konkrete Fixes" gelisteten Root-Causes sind behoben und einzeln durch den jeweiligen
   `G-AGENTIC*`-Mess-Befehl verifiziert.
4. `task test:changed` + `task freshness:regenerate` + `task freshness:check` grün.
5. `bash scripts/openspec.sh validate` (bzw. `/opsx:apply`-Vorstufe) grün für den Change-Ordner.
6. PR-Titel: `feat(quality): add agentic tooling health goals (agents/skills/mcp/commands) [TICKET]`

## Anhang — Explorations-Rohdaten

Vollständige Domänen-Analyse (Subagents/Skills/MCP/Commands, inkl. aller 17 Mess-Ideen im Detail) liegt
im Workflow-Task-Output `wifk01b1i` dieser Session vor (4 parallele Subagenten, ~495s Laufzeit,
382k Tokens). Die obige Tabelle ist die kuratierte, im Lavish-Board (`.lavish/agentic-tooling-quality-goals-brainstorm.html`,
gitignored) mit dem User abgestimmte Teilmenge.
