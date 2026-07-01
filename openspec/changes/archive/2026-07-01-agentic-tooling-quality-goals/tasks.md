---
title: Agentic Tooling Quality Goals — G-AGENTIC01–17 in .claude/lib/goals.md
ticket_id: T001398
domains: [quality, tooling, meta]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agentic-tooling-quality-goals — Implementation Plan

Führt 17 reproduzierbar gemessene Qualitätsziele (`G-AGENTIC01`–`G-AGENTIC17`) für die
Agentic-Tooling-Artefakte des Repos ein (Subagents, Skills, MCP-Config, agentische Commands),
verdrahtet 14 davon als Gates in `scripts/health-goals-check.sh`, dokumentiert 3 als Targets und
behebt die heute aktiven Verstöße, damit alle 14 Gates bei Merge grün starten.

Alle 17 Mess-Befehle und alle Root-Cause-Kontexte in diesem Plan wurden im Worktree
`/tmp/wt-agentic-tooling-quality-goals` tatsächlich ausgeführt/gelesen und ihre Baseline-Werte
bestätigt (siehe die `Baseline (verifiziert)`-Angabe je Ziel). Korrekturen gegenüber der
Explorations-Design-Spec sind explizit als **Korrektur** markiert.

## Baseline-Korrekturen gegenüber der Design-Spec (verifiziert im Worktree)

- **G-AGENTIC07** Baseline ist **5** verwaiste aktive Skills, nicht „≥1": `openspec-apply-change`,
  `openspec-archive-change`, `openspec-explore`, `openspec-propose`, `repo-hygiene` sind in keiner
  Referenzquelle (`CLAUDE.md`/`AGENTS.md`/`OVERVIEW.md`/andere `SKILL.md`) genannt. Fix 1.3 nimmt
  genau diese 5 in `OVERVIEW.md` auf → 0.
- **G-AGENTIC12** Baseline ist **2** undokumentierte Server, nicht 1: sowohl `task-master-ai` als
  auch `codebase-memory-mcp` fehlen in `mcp-tool-guide.md`. Fix 1.7 ergänzt **beide** Abschnitte → 0.
- **G-AGENTIC13** Der tote Server-Verweis in `dev-flow-e2e/SKILL.md` liegt im Playwright-Token-Format
  `mcp-browser_browser_*` vor, nicht als `mcp__mcp-browser__*`. Der Mess-Befehl (3.12) fängt beide
  Formate; ohne diese Erweiterung wäre das Gate tautologisch grün. Es ist **kein** Browser-Server in
  `.mcp.json`/`.opencode/opencode.jsonc` registriert → Fix 1.8 stellt auf die `chrome-devtools-axi`-Skill
  (CLI, kein MCP-Server-Token) um, statt einen weiteren nicht-registrierten Server zu referenzieren.
- **G-AGENTIC17** Die naive Scope-Erweiterung allein lässt **4** Command-Orphans (`archive`/`explore`
  in beiden Runtimes) zurück; `s4-orphans.mjs` hat zudem **keinen** CLI-Einstiegspunkt. Fix 1.10 löst
  beides (siehe Task 4).

## File Structure

Geänderte Dateien:
- `AGENTS.md` — Routing-Tabellen-Typo `korczewski` → `kore` (Fix 1.1); +2 Zeilen nur falls für
  G-AGENTIC07-Referenz genutzt (wird stattdessen über `OVERVIEW.md` gelöst).
- `Taskfile.yml` — `test:changed` Agents-Bucket + neuer Task `test:agent-library` (Fix 1.2 / G-AGENTIC04).
- `.claude/skills/OVERVIEW.md` — realer Skill-Zähler + fehlende/verwaiste Skills in Tabellen (Fix 1.3).
- `.claude/skills/infra-ops/SKILL.md` — toter `scripts/keycloak-ensure-mappers.sh`- und
  `task keycloak:sync`-Verweis entfernt/auf pocket-id korrigiert (Fix 1.5).
- `CLAUDE.md` — opencode-MCP-Serverliste + Quellpfad korrigiert (Fix 1.6; muss ≤ 200 Zeilen bleiben — G-DOC02).
- `.claude/skills/references/mcp-tool-guide.md` — Abschnitte `task-master-ai` + `codebase-memory-mcp`
  ergänzt, Phantom-Abschnitt `mcp-browser` entfernt (Fix 1.7).
- `.claude/skills/dev-flow-e2e/SKILL.md` — `mcp-browser_browser_*` → `chrome-devtools-axi`-Skill (Fix 1.8).
- `.claude/commands/opsx/apply.md`, `.opencode/commands/opsx-apply.md`,
  `.claude/skills/openspec-apply-change/SKILL.md` — Phantom-Recovery-Verweis ersetzt (Fix 1.9).
- `docs/code-quality/gates.yaml` — S4 `command_globs` + `CLAUDE.md`-Referenzquelle (Fix 1.10 / G-AGENTIC17).
- `scripts/code-quality/gates/s4-orphans.mjs` — `command_globs` in Kandidaten + CLI-Main-Block (Fix 1.10).
- `tests/spec/openspec-workflow.bats` — +2 Install-Asserts (`opsx-archive.md`, `opsx-explore.md`),
  damit alle 8 Command-Basenames referenziert sind → 0 S4-Command-Orphans (Fix 1.10).
- `.claude/lib/goals.md` — neue Kategorie „Agentic Tooling" (14 Gate-Zeilen Prio-C + 3 Target-Absätze Prio-B).
- `.claude/lib/README.md` — Goals-Zeile: 65 → 82 Ziele, 11 → 12 Kategorien.
- `scripts/health-goals-check.sh` — 14 `row gate` + 3 `row target` Zeilen + Mess-Helfer.

Keine neuen Laufzeit-Dateien, keine Prod-/DB-/Cluster-Änderung.

## Vorgehen (red → green Reihenfolge)

Für die 10 Gates mit Root-Cause-Fix (G-AGENTIC02, 04, 06, 07, 08, 11, 12, 13, 15, 17) gilt strikte
red→green-Disziplin: **zuerst** die `row`-Zeile in `health-goals-check.sh` verdrahten (Task 3/4/5),
den Check auf dem noch **ungefixten** Stand laufen lassen und bestätigen, dass er die reale Baseline-
Verletzung meldet (siehe Schritt 3.19, `expected: FAIL`), **erst danach** den zugehörigen Fix aus Task 1
anwenden und den Check erneut grün sehen. Das beweist, dass jeder Check die echte Verletzung fängt und
nicht tautologisch grün ist. Die 4 bereits grünen Gates (G-AGENTIC03, 05, 14, 16) und die 3 Targets
(G-AGENTIC01, 09, 10) haben keinen Fix; ihr Mess-Befehl wird nur verdrahtet und einmal verifiziert.

---

## 1. Root-Cause-Fixes (10 Verstöße)

- [ ] **1.1 `AGENTS.md` Routing-Typo (G-AGENTIC02).** Zeile 13 lautet aktuell:
  `| \`website/\`, Astro, Svelte, component, homepage, korczewski, mentolder brand, CSS, UI, frontend, design | \`bachelorprojekt-website\` |`.
  Ersetze das einzelne Token `korczewski` durch `kore` (zeichengenau, nur dieses eine Wort). Verifiziert:
  `.claude/agents/bachelorprojekt-website.md` `description:` nennt als Trigger `kore` (nicht `korczewski`),
  und `CLAUDE.md`s Routing-Tabelle nennt ebenfalls `kore`. Nach der Änderung ist der Token-Set-Vergleich
  über alle 6 Agenten drift-frei (verifiziert: Mess-Befehl liefert dann 0). Kein anderes Routing-Token
  weicht ab (ops/infra/test/db/security stimmen bereits überein — die Reihenfolge-Abweichung bei `FA-SF`
  und der Zusatz `(when referring to k8s resources)` bei `deploy` sind durch die Set-/Parenthesen-
  Normalisierung des Mess-Befehls abgedeckt).

- [ ] **1.2 `Taskfile.yml` `test:changed` Agents-Bucket (G-AGENTIC04).** Im `test:changed`-Block
  (aktuell Zeilen 785–808) fehlt jede Erreichbarkeit von `tests/spec/agent-library.bats`. Ergänze analog
  zum bestehenden `RUN_MCP`-Bucket:
  ```bash
  # Init-Zeile: RUN_AGENTS=false ergänzen
  ...; RUN_OPENSPEC=false; RUN_AGENTS=false
  # Detektions-Zeile (nach der RUN_MCP-grep-Zeile):
  echo "$CHANGED" | grep -qE "^(\.claude/agents/|AGENTS\.md)" && RUN_AGENTS=true || true
  # Ausführungs-Zeile (nach der RUN_MCP-Ausführungszeile):
  if [ "$RUN_AGENTS" = "true" ]; then echo "→ agent library changes: task test:agent-library"; task test:agent-library; fi
  # RUN_AGENTS zusätzlich in den "keine Domänen-Änderung"-Guard aufnehmen.
  ```
  Ergänze den referenzierten Task (analog zu `test:mcp-tooling`):
  ```yaml
  test:agent-library:
    desc: "Guardrail: .claude/agents/*.md <-> AGENTS.md routing-table library assertions"
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/spec/agent-library.bats
  ```
  Verifiziert: `tests/spec/agent-library.bats` existiert bereits; der Block-Grep-Mess-Befehl (3.3) meldet
  vor der Änderung 3 fehlende Marker (`.claude/agents/`, `AGENTS.md`, `agent-library`) und danach 0.
  Nach der Änderung mit einem synthetischen Diff gegen `.claude/agents/bachelorprojekt-ops.md` prüfen,
  dass genau `test:agent-library` (nicht der ganze BATS-Korpus) getriggert wird.

- [ ] **1.3 `.claude/skills/OVERVIEW.md` Inventar + Orphans (G-AGENTIC06 + G-AGENTIC07).** Zeile 3 lautet
  aktuell „12 project-local skills (11 in `.claude/skills/<name>/` + 1 in
  `.claude/skills/superpowers/using-git-worktrees/`)". Verifiziert: `find .claude/skills -name SKILL.md | wc -l`
  = **27**. Setze den führenden Zähler auf `27` und die Aufschlüsselung auf `26 + 1`. Nimm zusätzlich die
  fünf verifiziert **verwaisten** aktiven Skills in die Tabellen/den Mermaid-Graph auf, damit sie in einer
  Referenzquelle genannt sind: `openspec-apply-change`, `openspec-archive-change`, `openspec-explore`,
  `openspec-propose`, `repo-hygiene`. (Empfehlung: eine „OpenSpec-Workflow"-Tabelle mit den vier
  `openspec-*`-Skills und eine Zeile für `repo-hygiene` unter „Operations & Life-Cycle Management".)
  Verifiziert: Orphan-Mess-Befehl (3.6) liefert vor dem Fix 5, danach 0. `references`, `vitest`, `lavish`
  sind bereits referenziert (≥1) und müssen nicht ergänzt werden.

- [ ] **1.4 (in 1.3 enthalten).** Die im Skelett getrennt geführte `repo-hygiene`-Referenz ist Teil der
  Orphan-Auflösung in 1.3. Kein separater Schritt nötig — die inhaltliche Überlappung mit `ticket-ops`
  wird bewusst **nicht** dedupliziert (eigenständiges Folge-Ticket).

- [ ] **1.5 `.claude/skills/infra-ops/SKILL.md` tote Auth-Verweise (G-AGENTIC08).** Verifiziert: die Datei
  referenziert in Zeile 310 `bash scripts/keycloak-ensure-mappers.sh <env>` (Datei existiert nicht) sowie
  `task keycloak:sync` (Zeilen 172, 286, 306, 307). `Taskfile.yml` Zeilen 2859–2860 dokumentieren, dass die
  Keycloak-Tasks entfernt wurden („Keycloak decommissioned — pocket-id-migration Welle 3, 2026-06-22").
  Für G-AGENTIC08 (Script-Pfad-Prüfung) ist **zwingend** die Zeile mit `scripts/keycloak-ensure-mappers.sh`
  zu entfernen/ersetzen. Zusätzlich (Doku-Korrektheit, im selben Edit) die `task keycloak:sync`-Verweise auf
  die pocket-id-Realität umschreiben (z. B. `POCKET_ID_URL`/`pocket-id-client-seed`-Job, vgl. Taskfile
  Zeilen 2509/2636). Edit möglichst zeilenneutral halten (`infra-ops/SKILL.md` ist bereits 595 Zeilen —
  G-AGENTIC09-Target, kein Zwang, aber nicht unnötig vergrößern). Verifiziert: Script-Pfad-Mess-Befehl (3.7)
  liefert vor dem Fix 1 (`scripts/keycloak-ensure-mappers.sh`), danach 0.

- [ ] **1.6 `CLAUDE.md` opencode-MCP-Serverliste (G-AGENTIC11).** Verifiziert: Zeile 18 behauptet die
  opencode-Serverliste `mcp-kubernetes, mcp-browser, mcp-postgres, mcp-github, factory-mcp, mcp-task-runner,
  ticket-mcp, openspec`. Real registriert in `.opencode/opencode.jsonc`: `mcp-kubernetes, mcp-postgres,
  factory-mcp, codebase-memory-mcp, mcp-task-runner, ticket-mcp` (6). Entferne die 3 Phantome
  (`mcp-browser`, `mcp-github`, `openspec`), ergänze das fehlende `codebase-memory-mcp`, und korrigiere die
  Quelle: die opencode-Server stehen in `.opencode/opencode.jsonc` (der Claude-Code-Teil verweist korrekt auf
  `.mcp.json`, nicht `.claude/settings.json`). **Nur die eine Zeile 18 in-place bearbeiten** — `CLAUDE.md` ist
  exakt 200 Zeilen und G-DOC02 verlangt ≤ 200; keine Zeile hinzufügen. Verifiziert: symmetrischer
  Set-Vergleich (3.10) liefert vor dem Fix 4, danach 0.

- [ ] **1.7 `.claude/skills/references/mcp-tool-guide.md` Server-Abdeckung (G-AGENTIC12).** Verifiziert: der
  Guide dokumentiert `##`-Abschnitte für `mcp-postgres`, `mcp-kubernetes`, `ticket-mcp`, `factory-mcp`,
  `mcp-task-runner` — es **fehlen** `task-master-ai` und `codebase-memory-mcp` (beide in `.mcp.json`
  registriert, 0 Treffer im Guide). Ergänze für **beide** einen Abschnitt (Tools / Wann-bevorzugen /
  Fallback, analog zu den bestehenden). Entferne zugleich den Phantom-Abschnitt `mcp-browser` (Zeile 109,
  Server nicht registriert) und den `-browser/-github`-Hinweis in der Probe-Kommentarzeile (Zeile 31) — reine
  Doku-Korrektheit, im selben Thema. Verifiziert: Coverage-Mess-Befehl (3.11) liefert vor dem Fix 2
  (`task-master-ai`, `codebase-memory-mcp`), danach 0.

- [ ] **1.8 `.claude/skills/dev-flow-e2e/SKILL.md` toter Browser-Server (G-AGENTIC13).** Verifiziert:
  Zeilen 11 und 86–88 referenzieren `mcp-browser_browser_navigate/snapshot/take_screenshot` — Server
  `mcp-browser` ist in keiner Projekt-Config registriert. Es gibt **keinen** Browser-MCP-Server in
  `.mcp.json`/`.opencode/opencode.jsonc`; die reale Live-Erkundungs-Tooling ist die `chrome-devtools-axi`-
  Skill (CLI). Stelle die Live-Erkundung (Schritt 2) und den einleitenden Satz (Zeile 11) auf die
  `chrome-devtools-axi`-Skill um (kein `mcp__server__`- oder `<server>_browser_`-Token einführen) — die
  eigentliche E2E-Ausführung (Schritt 5) nutzt ohnehin den Playwright-CLI und bleibt unverändert.
  Verifiziert: Dead-Server-Mess-Befehl (3.12) liefert vor dem Fix 1 (`mcp-browser`), danach 0.

- [ ] **1.9 Phantom-Command `/opsx:continue` (G-AGENTIC15, sync-neutral für G-AGENTIC16).** Verifiziert, drei
  Fundstellen mit identischem Kontext („If `state: \"blocked\"` … suggest using …"):
  `.claude/commands/opsx/apply.md:44` (`/opsx:continue`), `.opencode/commands/opsx-apply.md:41`
  (`/opsx-continue`), `.claude/skills/openspec-apply-change/SKILL.md:48` (`openspec-continue-change`). Es
  existiert kein Command/Skill `continue`. Ersetze den Verweis in allen drei durch eine reale Recovery-
  Anleitung (fehlende Artefakte auflösen, dann Apply-Schritt erneut ausführen). **Für G-AGENTIC16 (bereits
  grün) müssen `apply.md` und `opsx-apply.md` nach Normalisierung `/opsx:` ↔ `/opsx-` zeichengleich
  bleiben** — also z. B. `re-run \`/opsx:apply\`` (Claude) bzw. `re-run \`/opsx-apply\`` (opencode).
  Verifiziert: Phantom-Mess-Befehl (3.14) liefert vor dem Fix 1 (`continue`), danach 0; Sync-Mess-Befehl (3.15)
  bleibt 0.

- [ ] **1.10 S4-Command-Scope (G-AGENTIC17) — dreiteilig.**
  1. `docs/code-quality/gates.yaml`: im `s4:`-Block einen `command_globs:`-Schlüssel mit
     `.claude/commands/**/*.md` und `.opencode/commands/**/*.md` ergänzen; unter `reference_sources:`
     zusätzlich `CLAUDE.md` aufnehmen (`AGENTS.md` und `.claude/skills/**/*.md` sind bereits Referenzquellen).
     Verifiziert: die Glob-`**`-Semantik in `scripts/code-quality/glob.mjs` matcht sowohl flache
     (`.opencode/commands/opsx-apply.md`) als auch verschachtelte (`.claude/commands/opsx/apply.md`) Dateien.
  2. `scripts/code-quality/gates/s4-orphans.mjs`: `command_globs` in die Kandidatenliste aufnehmen (Zeile 37
     um `...(s4.command_globs ?? [])` erweitern) und einen CLI-Main-Block anhängen, der die S4-Violations
     zeilenweise (ein `path` pro Zeile) ausgibt, wenn das Modul direkt ausgeführt wird:
     ```js
     const __filename = fileURLToPath(import.meta.url);
     if (process.argv[1] === __filename) {
       const { loadGates } = await import('../load.mjs');
       const repoRoot = join(dirname(__filename), '..', '..', '..');
       const cfgDir = process.env.QUALITY_CFG_DIR
         ? join(repoRoot, process.env.QUALITY_CFG_DIR)
         : join(repoRoot, 'docs', 'code-quality');
       for (const v of runS4(repoRoot, loadGates(cfgDir)).violations) console.log(v.path);
     }
     ```
     (Imports `dirname`, `fileURLToPath` ergänzen; `s4-orphans.mjs` ist 61 Zeilen, Limit 500 — reichlich Budget.)
     Verifiziert: der `import.meta`-Guard hält den CLI-Block inert beim Import durch `check.mjs`.
  3. `tests/spec/openspec-workflow.bats`: nach den bestehenden T001263-Install-Asserts (Zeilen 43–48) zwei
     weitere `@test`-Einträge für `.opencode/commands/opsx-archive.md` und `.opencode/commands/opsx-explore.md`
     ergänzen (analog zu den vorhandenen). Verifiziert: `tests/**/*.bats` ist S4-Referenzquelle, und
     `opsx-archive.md`/`opsx-explore.md` enthalten als Substring `archive.md`/`explore.md` — damit sind alle
     8 Command-Basenames referenziert. Simulation bestätigt: **vor** diesen 2 Asserts 4 Command-Orphans
     (`archive`/`explore` je Runtime), **danach** 0. **Wichtig:** Orphans werden durch Referenzen aufgelöst,
     **nicht** durch Baselining — kein `S4:`-Eintrag in `baseline.json` hinzufügen (sonst kippt die
     Baseline-Key-Count-Assertion in `freshness:check`).

---

## 2. Neue Kategorie in `.claude/lib/goals.md` + README

- [ ] **2.1 Prio-C-Tabelle (14 Gates).** Neue Sektion/Tabellenzeilen „Agentic Tooling" für
  `G-AGENTIC02, 03, 04, 05, 06, 07, 08, 11, 12, 13, 14, 15, 16, 17`, je mit Spalten Aktuell/Target/
  Basis-Messung (Format wie die bestehenden Prio-C-Zeilen; Basis-Messung = der jeweilige verifizierte
  Mess-Befehl aus Task 3 in Kurzform). Alle Aktuell-Werte = 0 nach den Fixes.
- [ ] **2.2 Prio-B-Absätze (3 Targets).** Für `G-AGENTIC01` (3 ungescopte high-risk Agenten),
  `G-AGENTIC09` (3 SKILL.md > 500 Zeilen: dev-flow-execute 662, infra-ops 595, dev-flow-plan 580) und
  `G-AGENTIC10` (3/6 Agenten ohne Skill mit `agent:`-Feld: website, db, security) je einen Absatz im Stil
  von G-FE01/G-FE02 (Baseline gemessen, Aufwand, kein Gate, mit Mess-Befehl im ```bash```-Block).
- [ ] **2.3 `.claude/lib/README.md` Zähler.** Zeile 34: „65 Health-Ziele in 11 Kategorien …" → „82
  Health-Ziele in 12 Kategorien …", Kategorienaufzählung um „Agentic Tooling" ergänzen. (goals.md selbst
  trägt keinen expliziten Gesamtzähler im Kopf; verifiziert per Grep — keine `65`/`11 Kategorien`-Kopfzeile
  dort.)

---

## 3. Wiring in `scripts/health-goals-check.sh` (verifizierte Mess-Befehle)

Neue GATES nach den bestehenden `row gate …`-Zeilen, neue TARGETS nach den bestehenden `row target …`.
Mehrzeilige Checks als Mess-Helfer im Helfer-Block (Muster: bestehende `n_baseline_gate`/`count`). Empfohlener
gemeinsamer Helfer `mcp_servers <datei>` (parst `.mcp.json`/`.opencode/opencode.jsonc`, druckt Servernamen)
für 3.10–3.13:
```bash
mcp_servers() { python3 - "$1" <<'PY' 2>/dev/null || true
import json,re,sys
s=open(sys.argv[1]).read(); s=re.sub(r'^\s*//.*$','',s,flags=re.M); s=re.sub(r',(\s*[}\]])',r'\1',s)
d=json.loads(s); k='mcpServers' if 'mcpServers' in d else 'mcp'
print('\n'.join(sorted(d.get(k,{}).keys())))
PY
}
```

- [ ] **3.1 G-AGENTIC02** — `row gate` … `eq 0` (Routing-Drift). Verifiziert: Baseline 1, nach Fix 1.1 → 0.
  ```bash
  python3 - <<'PY'
  import re, glob, os
  def norm(t):
      t=re.sub(r'\([^)]*\)','',t); t=t.replace('`','').replace('"','').replace("'","")
      return t.strip().rstrip('.').strip().lower()
  def toks(s): return {norm(x) for x in s.split(',') if norm(x)}
  def fm(p):
      f=re.search(r'^---\n(.*?)\n---',open(p).read(),re.S).group(1)
      d=re.search(r'description:\s*>?\s*(.*?)(?:\n[a-z_]+:|\Z)',f,re.S).group(1)
      d=' '.join(l.strip() for l in d.splitlines())
      m=re.search(r'[Tt]riggers on:\s*(.*)',d); return toks(m.group(1)) if m else set()
  rows={}; seg=False
  for line in open('AGENTS.md').read().splitlines():
      if re.match(r'^## Agent Routing',line): seg=True; continue
      if seg and re.match(r'^## ',line): break
      if seg:
          m=re.match(r'\|(.*?)\|\s*`(bachelorprojekt-[a-z]+)`\s*\|\s*$',line)
          if m: rows[m.group(2)]=toks(m.group(1))
  print(sum(1 for p in glob.glob('.claude/agents/*.md')
            if fm(p).symmetric_difference(rows.get(os.path.basename(p)[:-3],set()))))
  PY
  ```
- [ ] **3.2 G-AGENTIC03** — `row gate` … `eq 0` (Frontmatter-Vollständigkeit). Verifiziert: bereits 0.
  ```bash
  c=0; for f in .claude/agents/*.md; do b=$(basename "$f" .md)
    nm=$(awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^name:/{sub(/^name:[ ]*/,"");print;exit}' "$f")
    hd=$(awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^description:/{print 1;exit}' "$f")
    { [ "$nm" = "$b" ] && [ -n "$hd" ]; } || c=$((c+1)); done; echo $c
  ```
- [ ] **3.3 G-AGENTIC04** — `row gate` … `eq 0` (Taskfile-Bucket-Erreichbarkeit, fehlende Marker).
  Verifiziert: Baseline 3, nach Fix 1.2 → 0.
  ```bash
  blk="$(awk '/^  test:changed:/{f=1} f&&/^  [a-z][a-z0-9-]*:/&&!/test:changed:/{exit} f' Taskfile.yml)"
  m=0
  echo "$blk" | grep -qE '\.claude/agents/' || m=$((m+1))
  echo "$blk" | grep -qE 'AGENTS\.md'       || m=$((m+1))
  echo "$blk" | grep -q  'agent-library'    || m=$((m+1))
  echo $m
  ```
- [ ] **3.4 G-AGENTIC05** — `row gate` … `eq 0` (6-Agenten Cross-Reference). Verifiziert: bereits 0.
  ```bash
  files=$(ls .claude/agents/*.md | xargs -n1 basename | sed 's/\.md$//;s/^bachelorprojekt-//' | sort -u)
  routing=$(grep -oE "'bachelorprojekt-[a-z]+'" scripts/code-quality/validate.mjs | tr -d "'" | sed 's/^bachelorprojekt-//' | sort -u)
  registry=$(grep -oE '^- id: agent-[a-z]+' docs/agent-guide/registry/tools.yaml | sed 's/^- id: agent-//' | sort -u)
  echo $(( $(comm -3 <(echo "$files") <(echo "$routing") | grep -c .) + $(comm -3 <(echo "$files") <(echo "$registry") | grep -c .) ))
  ```
- [ ] **3.5 G-AGENTIC06** — `row gate` … `eq 0` (OVERVIEW.md-Zähler-Drift, Betrag). Verifiziert: Baseline
  15 (12 vs 27), nach Fix 1.3 → 0.
  ```bash
  claimed=$(grep -oE '[0-9]+ project-local skills' .claude/skills/OVERVIEW.md | head -1 | grep -oE '^[0-9]+')
  real=$(find .claude/skills -name SKILL.md | wc -l | tr -d ' ')
  echo $(( claimed>real ? claimed-real : real-claimed ))
  ```
- [ ] **3.6 G-AGENTIC07** — `row gate` … `eq 0` (verwaiste aktive Skills). Verifiziert: Baseline 5, nach
  Fix 1.3 → 0. „Aktiv" = SKILL.md mit `description:`-Feld (archivierte haben keins).
  ```bash
  c=0
  for f in $(find .claude/skills -name SKILL.md); do
    d=$(echo "$f" | sed 's#.claude/skills/##;s#/SKILL.md##'); base=$(basename "$d")
    awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^description:/{print 1;exit}' "$f" | grep -q 1 || continue
    n=$( { grep -rl -- "$base" CLAUDE.md AGENTS.md .claude/skills/OVERVIEW.md 2>/dev/null
           grep -rl --include=SKILL.md -- "$base" .claude/skills 2>/dev/null | grep -v "$d/SKILL.md"; } | sort -u | wc -l)
    [ "$n" -eq 0 ] && c=$((c+1))
  done; echo $c
  ```
- [ ] **3.7 G-AGENTIC08** — `row gate` … `eq 0` (tote Script-Pfade in SKILL.md). Verifiziert: Baseline 1
  (`scripts/keycloak-ensure-mappers.sh`), nach Fix 1.5 → 0. (Prüft Script-Pfade — das Szenario der Spec;
  der tote `task keycloak:sync`-Verweis wird in Fix 1.5 doku-korrekt mitbehoben, ist aber bewusst nicht Teil
  dieses Mess-Befehls, da Namespaced-Taskfile-Includes keine deterministische Offline-Prüfung erlauben.)
  ```bash
  c=0
  for p in $(grep -rhoE 'scripts/[A-Za-z0-9_./-]+\.(sh|mjs|py)' .claude/skills --include=SKILL.md | sort -u); do
    [ -f "$p" ] || c=$((c+1)); done; echo $c
  ```
- [ ] **3.8 G-AGENTIC09** — `row target` … `le 0` (SKILL.md > 500 Zeilen). Verifiziert: 3 (662/595/580).
  Rendert 🟡 mit dokumentierter Baseline (kein Split erzwungen).
  ```bash
  find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
  ```
- [ ] **3.9 G-AGENTIC10** — `row target` … `le 0` (Agenten ohne dispatchende Skill). Verifiziert: 3
  (website, db, security). 🟡 mit dokumentierter Baseline.
  ```bash
  c=0; for a in bachelorprojekt-website bachelorprojekt-ops bachelorprojekt-infra bachelorprojekt-test bachelorprojekt-db bachelorprojekt-security; do
    grep -rlE "^agent:[[:space:]]*$a" .claude/skills --include=SKILL.md >/dev/null 2>&1 || c=$((c+1)); done; echo $c
  ```
- [ ] **3.10 G-AGENTIC11** — `row gate` … `eq 0` (CLAUDE.md opencode-Liste vs. opencode.jsonc, sym. Diff).
  Verifiziert: Baseline 4, nach Fix 1.6 → 0.
  ```bash
  claimed=$(grep 'opencode runtime registers' CLAUDE.md | grep -oE '`[a-z][a-z0-9-]*`' | tr -d '`' | sort -u)
  actual=$(mcp_servers .opencode/opencode.jsonc)
  comm -3 <(echo "$claimed") <(echo "$actual") | grep -c .
  ```
- [ ] **3.11 G-AGENTIC12** — `row gate` … `eq 0` (.mcp.json-Server undokumentiert in mcp-tool-guide).
  Verifiziert: Baseline 2 (`task-master-ai`, `codebase-memory-mcp`), nach Fix 1.7 → 0.
  ```bash
  c=0; for s in $(mcp_servers .mcp.json); do
    grep -q -- "$s" .claude/skills/references/mcp-tool-guide.md || c=$((c+1)); done; echo $c
  ```
- [ ] **3.12 G-AGENTIC13** — `row gate` … `eq 0` (tote MCP-Server-Referenzen in SKILL.md; beide Token-
  Formate). Verifiziert: Baseline 1 (`mcp-browser`), nach Fix 1.8 → 0.
  ```bash
  reg=$( { mcp_servers .mcp.json; mcp_servers .opencode/opencode.jsonc; } | sort -u)
  refs=$(grep -rhoE 'mcp__[a-z0-9-]+__|mcp-[a-z0-9-]+_browser_' .claude/skills --include=SKILL.md \
         | sed -E 's/^mcp__//; s/__$//; s/_browser_$//' | sort -u)
  c=0; for s in $refs; do echo "$reg" | grep -qx "$s" || c=$((c+1)); done; echo $c
  ```
- [ ] **3.13 G-AGENTIC14** — `row gate` … `eq 0` (`.mcp.json` ↔ opencode Parity für gemeinsame Server).
  Verifiziert: bereits 0.
  ```bash
  python3 - <<'PY'
  import json,re
  def load(p):
      s=open(p).read(); s=re.sub(r'^\s*//.*$','',s,flags=re.M); s=re.sub(r',(\s*[}\]])',r'\1',s); d=json.loads(s)
      return d['mcpServers' if 'mcpServers' in d else 'mcp']
  a=load('.mcp.json'); b=load('.opencode/opencode.jsonc')
  def sig(c):
      cmd=c.get('command')
      return c.get('url') or ' '.join((cmd if isinstance(cmd,list) else [cmd or ''])+c.get('args',[]))
  print(sum(1 for k in set(a)&set(b) if sig(a[k])!=sig(b[k])))
  PY
  ```
- [ ] **3.14 G-AGENTIC15** — `row gate` … `eq 0` (Phantom-`/opsx`-Command-Referenzen). Verifiziert:
  Baseline 1 (`continue`), nach Fix 1.9 → 0.
  ```bash
  valid=$( { for f in .claude/commands/opsx/*.md; do basename "$f" .md; done
             for f in .opencode/commands/opsx-*.md; do basename "$f" .md | sed 's/^opsx-//'; done; } | sort -u)
  refs=$(grep -rhoE '/opsx[:-][a-z]+' CLAUDE.md AGENTS.md .claude/commands .opencode/commands .claude/skills --include='*.md' 2>/dev/null \
         | sed -E 's#/opsx[:-]##' | sort -u)
  c=0; for r in $refs; do echo "$valid" | grep -qx "$r" || c=$((c+1)); done; echo $c
  ```
- [ ] **3.15 G-AGENTIC16** — `row gate` … `eq 0` (Claude ↔ opencode Command-Sync, normalisiert).
  Verifiziert: bereits 0; bleibt 0, wenn Fix 1.9 beide Seiten normalisiert-gleich hält.
  ```bash
  m=0
  for f in .claude/commands/opsx/*.md; do
    name=$(basename "$f" .md); o=".opencode/commands/opsx-$name.md"
    [ -f "$o" ] || { m=$((m+1)); continue; }
    a=$(awk 'BEGIN{fm=0}/^---$/{fm++;next} fm>=2{print}' "$f" | sed 's#/opsx:#/opsx-#g')
    b=$(awk 'BEGIN{fm=0}/^---$/{fm++;next} fm>=2{print}' "$o" | sed 's#/opsx:#/opsx-#g')
    [ "$a" = "$b" ] || m=$((m+1))
  done; echo $m
  ```
- [ ] **3.16 G-AGENTIC17** — `row gate` … `le 0` (Command-Orphans via S4; mit Config-Guard gegen
  Tautologie). Verifiziert (Simulation): vor Fix 1.10 gäbe die Erweiterung 4 Orphans, nach den 2 bats-
  Asserts 0; ohne die `command_globs`-Config druckt der Guard 99 (→ rot), damit das Gate nicht trivial grün
  wird, falls die Config je entfernt wird.
  ```bash
  cfg=$(grep -cE '(\.claude/commands|\.opencode/commands)/\*\*/\*\.md' docs/code-quality/gates.yaml)
  orph=$(node scripts/code-quality/gates/s4-orphans.mjs 2>/dev/null | grep -cE '(^|/)(\.claude/commands|\.opencode/commands)/|commands/opsx')
  if [ "$cfg" -ge 2 ]; then echo "$orph"; else echo 99; fi
  ```
- [ ] **3.17 G-AGENTIC01** — `row target` … `le 0` (security/infra/db ohne `tools:`-Feld). Verifiziert: 3.
  🟡 mit dokumentierter Baseline (kein Least-Privilege-Scoping in diesem Change).
  ```bash
  c=0; for a in bachelorprojekt-security bachelorprojekt-infra bachelorprojekt-db; do
    awk 'BEGIN{f=0}/^---$/{f++;next} f==1&&/^tools:/{ok=1} END{exit !ok}' .claude/agents/$a.md || c=$((c+1)); done; echo $c
  ```
- [ ] **3.18 Ampel-Report-Konsistenz.** `bash scripts/health-goals-check.sh --quiet` läuft ohne Fehler und
  zählt die 17 neuen Ziele mit (Gesamtzahl steigt um 17).
- [ ] **3.19 Red-Baseline-Beweis (Anti-Tautologie).** VOR Anwendung der Task-1-Fixes, aber NACH Verdrahtung
  der zugehörigen `row`-Zeilen:
  `bash scripts/health-goals-check.sh --only=G-AGENTIC02,G-AGENTIC04,G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC11,G-AGENTIC12,G-AGENTIC13,G-AGENTIC15,G-AGENTIC17`
  — **expected: FAIL** (Exit 1, jedes dieser 10 Gates meldet 🔴 mit seinem verifizierten Baseline-Wert:
  1/3/15/5/1/4/2/1/1/4). Erst danach die Fixes anwenden und dasselbe Kommando erneut ausführen — dann Exit 0.

---

## 4. `docs/code-quality/gates.yaml` + `s4-orphans.mjs` (G-AGENTIC17)

Umsetzung siehe Fix 1.10 (dreiteilig). Abschluss-Verifikation dieses Blocks:
- [ ] **4.1** `node scripts/code-quality/gates/s4-orphans.mjs` gibt nach dem Fix **keine** Zeile aus, die
  auf `.claude/commands/` oder `.opencode/commands/` zeigt (0 Command-Orphans).
- [ ] **4.2** `node scripts/code-quality/check.mjs` meldet keine NEUE/verschlechterte S4-Violation (die 4
  vormaligen Command-Orphans sind über die Referenzen aufgelöst, nicht gebaselined).

---

## 5. `Taskfile.yml` `test:changed` (G-AGENTIC04)

Umsetzung siehe Fix 1.2. Abschluss-Verifikation:
- [ ] **5.1** Synthetischer Diff-Test: mit einer geänderten `.claude/agents/bachelorprojekt-ops.md` löst
  `task test:changed` genau `test:agent-library` (→ `tests/spec/agent-library.bats`) aus, nicht den ganzen
  BATS-Korpus.

---

## 6. Finaler Verify-Task

- [ ] **6.1** `bash scripts/health-goals-check.sh --only=G-AGENTIC02,G-AGENTIC03,G-AGENTIC04,G-AGENTIC05,G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC11,G-AGENTIC12,G-AGENTIC13,G-AGENTIC14,G-AGENTIC15,G-AGENTIC16,G-AGENTIC17`
  → Exit 0 (alle 14 Gates grün).
- [ ] **6.2** `bash scripts/health-goals-check.sh --only=G-AGENTIC01,G-AGENTIC09,G-AGENTIC10`
  → druckt die dokumentierten Target-Baselines (3/3/3, 🟡), Exit 0 (kein Gate-Fail ohne `--strict`).
- [ ] **6.3** `task test:inventory` regenerieren (wegen der 2 neuen `@test`-Einträge in
  `tests/spec/openspec-workflow.bats`) und `website/src/data/test-inventory.json` mitcommitten.
- [ ] **6.4** `task test:changed` (gezielte Tests für die geänderten Domains inkl. neuem Agents-Bucket + quality-Gate).
- [ ] **6.5** `task freshness:regenerate` (generierte Artefakte aktualisieren: test-inventory, repo-index, …).
- [ ] **6.6** `task freshness:check` (CI-Äquivalent: Freshness + `quality:check` S1–S4-Ratchet inkl. der neuen
  S4-Command-Scope-Prüfung + Baseline-Key-Count-Assertion).

> **Übergabe-Kontext für `dev-flow-execute` (gehört nicht in tasks.md-Ausführung):** Vor dem finalen
> Commit muss `bash scripts/openspec.sh validate` (bzw. `task test:openspec`) für den Change-Ordner grün
> sein. Das in der Frontmatter als Platzhalter geführte Ticket wird in dev-flow-Schritt 4.5 angelegt und
> ersetzt; danach `bash scripts/plan-frontmatter-hook.sh <plan-file>` laufen lassen. PR-Titel:
> `feat(quality): add agentic tooling health goals (agents/skills/mcp/commands) [<ticket>]`.
