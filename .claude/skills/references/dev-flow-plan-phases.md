# dev-flow-plan — Phasen im Detail

Referenz zu [`dev-flow-plan`](../dev-flow-plan/SKILL.md). Der Skill-Body führt die Pfad-Wahl und
alle Guards; hier stehen die ausformulierten Phasen des Feature-Pfads, die Decompose-/Fan-out-
Mechanik und die Schritte des Fix-Pfads.

---

### Phase A: Auf main — Proposal-Phase
#### Schritt A.1: Asset-Sammlung + Codebase-Exploration
Frage den User aktiv nach Spec-Notizen, Mockups oder Screenshots. Lese Text- und Image-Dateien mit dem `Read` Tool ein, um sie in den Kontext zu laden.
Verwende einen Code-Explorer Subagenten, um die Code-Pfade und Architektur vor dem Brainstorming zu analysieren.
#### Schritt A.1.5: Intel-Gathering → Plan Intel Bundle ⚡
Nach der Exploration (A.1) Generator laufen lassen — deterministisch, kein LLM:
```bash
bash scripts/plan-intel.sh <slug>
```
Das Skript befüllt `openspec/changes/<slug>/intel.json` aus der Plan-Datei (target_files),
berechnet S1-Budgets via `scripts/plan-lint.sh`-Hooks und extrahiert Symbole per `grep`.
Schema + Quellen-Mapping: [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).
`api_contracts` und `external_types` bleiben beim Planner — der Generator überschreibt nicht,
was der Planner von Hand ergänzt hat. Fehlt eine Quelle, entsteht ein `risks[]`-Eintrag.
Das Bundle informiert bereits das Brainstorming (A.4).
Liegt vor `/opsx:propose` noch kein Change-Ordner vor, das Bundle erstellen und nach **B.2**
verschieben: `mkdir -p openspec/changes/<slug> && bash scripts/plan-intel.sh <slug>`.
#### Schritt A.2: Design-Bundle co-lokalisieren (nur Design-/UI-Tickets)
Wenn das Ticket einen Design-Handoff hat (claude.ai-Design-Session → Bundle-ID), lege die Assets
**jetzt im main-Checkout** an — sie werden in Schritt B.2 in den Worktree verschoben:
```bash
SLUG="<slug>"
DESIGN_DIR="openspec/changes/${SLUG}/assets"
mkdir -p "${DESIGN_DIR}/new"

# Design-Assets extrahieren (Bundle-ID vom User erfragen)
# .tar.gz enthält: chats/chat1.md = Intent, project/ = SVGs
# Ziel: ${DESIGN_DIR}/new/
# Intent:  cp <bundle>/chats/chat1.md "${DESIGN_DIR}/intent.md"
```
**Qualitäts-Gate — nur passende Assets co-lokalisieren** (aus T000756): jedes synchronisierte
SVG vor dem Ablegen prüfen und **unpassende verwerfen** (NICHT mit in `new/` aufnehmen):
`currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
und **Export-Vollständigkeit** (Anzahl gelieferter Dateien vs. im Intent spezifizierte).
Alt-Assets werden **nicht** mitkopiert — der Abgleich passiert in-place gegen die echte
Repo-Datei (`git diff` / `Read` der Live-Datei) erst beim Verbauen, nicht als Plan-Ballast.
#### Schritt A.3: Lavish-Board starten ⚡ PFLICHT — vor Brainstorming
Erstelle `.lavish/<slug>-brainstorm.html` (Sections: Intent, Constraints, Trade-offs, Entscheidungen) und öffne es mit `npx -y lavish-axi .lavish/<slug>-brainstorm.html`. Dieses Board dient als visuelles Arbeitsblatt während des Brainstormings.
#### Schritt A.4: Brainstorming ⚡ IMMER — kein Überspringen
Rufe `superpowers:brainstorming` auf (Claude Code — built-in) oder führe die Brainstorming-Schritte
direkt aus (opencode — das Äquivalent ist in `opencode-flow-plan` inlined; lies die Spec und
arbeite die Schritte A.3→A.5 ohne Skill-Load durch).
Nutze das `lavish`-Board (aus Schritt A.3) für visuelle Dokumentation und strukturiertes Feedback.
Ergebnis: Design-Spec **im Change-Ordner** unter `openspec/changes/<slug>/design.md`
(SSOT-Konvention T002074 — `mkdir -p openspec/changes/<slug>` falls `/opsx:propose`
in A.5 den Ordner noch nicht angelegt hat; kein Doppel mehr im alten Spec-Verzeichnis).
Nach dem Schreiben der Spec das Frontmatter setzen:
`bash scripts/vda.sh frontmatter --spec openspec/changes/<slug>/design.md`
und `ticket_id`/`plan_ref` ausfüllen sobald Ticket-ID und Plan-Pfad feststehen.

> **Commit-Scope ist `plans`, nicht `specs` [T002425-M2].** Der naheliegende `docs(specs):`
> wird von `validate-commit-msg` abgelehnt — `specs` wurde mit T002328 zu `plans`
> konsolidiert. Der Plugin-Skill `superpowers:brainstorming` kennt diese Repo-Konvention
> nicht (er legt seine Spec per Default nach `docs/superpowers/specs/`, was hier ohnehin
> durch den Change-Ordner ersetzt ist), deshalb steht der Scope hier. Also:
> `docs(plans): …` oder `chore(plans): …`.
#### Schritt A.5: OpenSpec-Change anlegen — AUF MAIN ⚡
Lege den OpenSpec-Change-Ordner **auf dem main-Branch** an (seedet `proposal.md` + `tasks.md` +
Delta-Skeleton, setzt Ticket-Status auf `planning`). Merke den Repo-Root für Schritt B.2:
```bash
# Repo-Root für späteres Verschieben der Artefakte festhalten
REPO_ROOT="$(git rev-parse --show-toplevel)"

/opsx:propose <slug>     # upstream OpenSpec command (preferred)
# Fallback (older harness without upstream CLI):
# bash scripts/openspec.sh propose "<slug>" --ticket "<TICKET_EXT_ID>"
```
Übertrage den Brainstorming-Output (WARUM + WAS) nach `openspec/changes/<slug>/proposal.md`.
Der Implementierungsplan wird **ausschließlich** in `openspec/changes/<slug>/tasks.md` geschrieben.
#### Schritt A.6: Playwright-Projekt-Gate (optional)
Falls neue E2E-Tests geplant sind, weise das passende Playwright-Projekt zu (siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für Zuordnungstabelle).
### Phase B: Worktree anlegen + Branch pushen (Pipeline-Start)

🚨 **Pipeline-Prinzip:** Der Branch und Worktree werden JETZT angelegt und gepusht,
damit Partial-Pläne sofort in die Factory enqueued werden können, während der Planner
weiterarbeitet. Die Factory beginnt mit der Ausführung eines Partials, sobald es
enqueued ist — parallel zum Schreiben des nächsten Partials.

> **Ticket-vor-Branch-Check (T001917, T002050):** Prüfe vor der Worktree-Anlage, ob bereits ein Ticket existiert oder in Schritt 4.5 ein neues angelegt wird. Ist `TICKET_EXT_ID` bekannt, benenne den Branch **immer** mit Ticket-ID-Suffix (z.B. `feature/<slug>-T002050` statt `feature/<slug>`). Falls noch kein Ticket existiert, erstelle das Ticket VOR der Worktree-Anlage (siehe Schritt 4.5), um dessen `TICKET_EXT_ID` direkt in den Branch-Namen aufzunehmen. Sonst schlägt `preflight-pr-scope.sh` beim PR fehl (PR-Titel-Ticket-ID ≠ Branch-Name) und der Branch muss nachträglich umbenannt werden.

#### Schritt B.1: Worktree anlegen (git-crypt-safe)

> **Ab hier trägt jeder Datei-Tool-Pfad den Worktree-Präfix [T002357].** `cd` und
> `worktree-create.sh` wirken nur auf Bash; Read/Write/Edit nehmen absolute Pfade und haben
> keinerlei Bezug zum Bash-cwd. Ein Pfad, der vor der Worktree-Anlage korrekt war
> (`<repo>/tests/spec/x.bats`), bleibt danach syntaktisch gültig und trifft still den
> Hauptcheckout — der Verstoß gegen "Mutierende Tasks nie im Hauptcheckout" fällt erst beim
> `git status` auf (Mishap T002350, Ursprung T001880). Prüfbefehl bei Verdacht, im
> Hauptcheckout auszuführen: `git -C <repo-root> status --porcelain` muss leer bleiben.

```bash
bash scripts/worktree-create.sh feature/<slug>-T<id> .worktrees/<slug>

# Branch claimen (Session-Koordination [T000510])
bash scripts/agent-lock.sh claim branch "feature/<slug>-T<id>" --worktree ".worktrees/<slug>" --label dev-flow-plan \
  || { echo "🛑 Branch wird bereits von einer anderen Session bearbeitet."; exit 1; }

# Ticket-Claim
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "feature/<slug>-T<id>" --worktree ".worktrees/<slug>" --label dev-flow-plan \
  || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet."; exit 1; }
```

#### Schritt B.2: Artefakte in den Worktree verschieben

```bash
WT=".worktrees/<slug>"
mkdir -p "${WT}/openspec/changes/"
mv "${REPO_ROOT}/openspec/changes/<slug>" "${WT}/openspec/changes/<slug>"
[ -f "${REPO_ROOT}/intel.json" ] && mv "${REPO_ROOT}/intel.json" "${WT}/openspec/changes/<slug>/intel.json"
[ -f "${REPO_ROOT}/.lavish/<slug>-brainstorm.html" ] && mv "${REPO_ROOT}/.lavish/<slug>-brainstorm.html" "${WT}/.lavish/" 2>/dev/null || true
cd "${WT}"
```

#### Schritt B.3: Scaffold-Commit + Push (Branch ist live für Factory)

```bash
git add openspec/changes/<slug>/
git commit -m "chore(plans): scaffold <slug> branch [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

### Phase C: Im Worktree — Pipeline-Plan-Phase (Partial-Dispatch)

#### Schritt C.1: Decompose — Partial-Manifest erstellen
Erzeuge aus `intel.json` (`impact_files`) das **Partial-Manifest** — Partials mit disjunkten
`target_files`-Listen; das **letzte Partial ist IMMER die Tests-Rolle** (`tests`) und trägt den
STRUCT2-Failing-Test-Step. Keine Datei in zwei Partials (D1). Obergrenze 9 (`--partials`-Cap).

#### Schritt C.2: Pipeline-Loop — Pro Partial: Plan → Stage → Enqueue → Factory

Führe für **jedes Partial in Reihenfolge** aus (außer Tests-Partial, das erst am Ende):

```
FOR each partial pX (p1, p2, ...):
  │
  ├─► Schritt C.2a: Partial-Plan schreiben
  │     Spawne Plan-Subagenten (Task-Tool) — Kontext: proposal.md, intel.json-Subset.
  │     Schreibt `tasks.d/pX-<name>.md`.
  │
  ├─► Schritt C.2b: tasks.md-Index aktualisieren
  │     Orchestrator schreibt/updated tasks.md mit Partial-Manifest + File Structure.
  │
  ├─► Schritt C.2c: Commit + Push
  │     git add openspec/changes/<slug>/
  │     git commit -m "chore(plans): add partial pX-<name> for <slug> [$TICKET_EXT_ID]"
  │     git push origin feature/<slug>-T<id>
  │
  ├─► Schritt C.2d: Plan stagen (slot_count setzen)
  │     bash scripts/ticket.sh stage-plan \
  │       --id "$TICKET_EXT_ID" --branch "feature/<slug>-T<id>" \
  │       --plan "openspec/changes/<slug>/tasks.md" --partials N
  │
  ├─► Schritt C.2e: Readiness-Flags setzen
  │     ticket-mcp: set_readiness_flag({id, flag:"spec_skizziert", value:true})
  │     ticket-mcp: set_readiness_flag({id, flag:"abhaengigkeiten_klar", value:true})
  │     ticket-mcp: set_readiness_flag({id, flag:"offene_fragen_geklaert", value:true})
  │     ticket-mcp: set_readiness_flag({id, flag:"aufwand_geschaetzt", value:true})
  │
  ├─► Schritt C.2f: In Factory enqueuen ⚡
  │     ticket-mcp: enqueue_ticket({ id: "$TICKET_EXT_ID" })
  │     # Factory startet SOFORT mit pX — Planner fährt parallel mit p(X+1) fort
  │
  └─► Nächstes Partial (oder STOPP wenn alle geschrieben)

NACH dem letzten Partial (Tests):
  ├─► Schritt C.3: Plan-Qualitäts-Gate  
  │     bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md
  │     bash scripts/openspec.sh validate
  │
  ├─► Schritt C.4: Pgvector-Index
  │     bash scripts/openspec-embed-local.sh <slug> "$(pwd)"
  │
  └─► Schritt C.5: Finaler Commit + Push
        git add openspec/changes/<slug>/
        git commit -m "chore(plans): finalize <slug> plan [$TICKET_EXT_ID]"
        git push origin $(git branch --show-current)
```

### Pipeline-Fluss (visuell)
```
Zeit │
     │ Planner: [p1] → [p2] → [p3(Tests)] → fertig
     │ Factory:  ╰─► p1 ╰─► p2 ╰─► p3
     │           (parallel zum Planner!)
     ▼
```


---

### Schritt 3.7: Plan-Erstellung — zweistufig: Decompose → paralleler Fan-out (T002074)
Die Plan-Phase ist **zweistufig**. Bei kleinen Änderungen bleibt es faktisch bei
einem einzigen Partial (= klassischer Single-Plan, unten). Bei mehreren Subsystemen
zerlegst du VOR dem Plan-Schreiben in disjunkte Partialpläne und fächerst
parallele Plan-Subagenten aus:

**(a) Decompose** — der Orchestrator erzeugt aus `intel.json` (`impact_files`) das
**Partial-Manifest**: Partials mit disjunkten `target_files`-Listen; das
**letzte Partial ist IMMER die Tests-Rolle** (`tests`) und trägt den
STRUCT2-Failing-Test-Step (`expected: FAIL` + Testrunner). Faustregel: **1 Partial je
disjunktem Subsystem, Tests immer separat**; mehr als 3 nur bei echt disjunkten
Dateimengen; Obergrenze 9 (`--partials`-Cap). Keine Datei darf in zwei Partials
liegen (D1 — `scripts/plan-lint.sh` erzwingt das im Partial-Modus). Partials
können über die optionale 5. Manifest-Spalte `depends_on` Abhängigkeiten
deklarieren (D2 — `scripts/plan-lint.sh` validiert Referenzen und Azyklizität).

**(b) Fan-out** — N parallele Plan-Subagenten (Claude Code: `Task`-Tool; opencode:
`delegate(...)`). Kontext pro Subagent NUR: `openspec/changes/<slug>/proposal.md`,
sein Manifest-Eintrag, die Ausgabe von
`bash scripts/plan-intel-filter.sh <slug> <target_files...>` (deterministisch
gefilterte `intel.json` für genau seine Dateien) und die
[plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)-Referenz.
Jeder schreibt SEINE `openspec/changes/<slug>/tasks.d/pX-<name>.md`; der Orchestrator
schreibt den `tasks.md`-**Index** mit der `## Partials`-Manifest-Tabelle
(`| id | tasks.d/pX-*.md | impl|tests | <target_files> | <depends_on, optional> |`), der `## File Structure`
(Union aller Partials) und dem finalen Verify-Task (STRUCT3). `plan-lint.sh` aktiviert
den Partial-Modus über die Existenz von `tasks.d/` automatisch.

Der folgende Single-Plan-Ablauf gilt für den 1-Partial-Fall (und ist der Prompt-Kern,
den jeder Fan-out-Subagent für sein Partial bekommt):

Statt deinen eigenen Kontext zurückzusetzen (das ließe dich den Faden verlieren), committe die Spec und delegiere das Plan-Schreiben an einen **frischen Subagenten** — der hat per Konstruktion einen sauberen Kontext und bekommt ein **zur Plan-Komplexität passendes Modell + Effort**. Du selbst behältst den vollen Brainstorming-Kontext.
1. Committe und pushe die Spec-Datei auf den Feature-Branch.
2. Spawne einen Subagenten, provisioniert gemäß [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md):
   - **Claude Code:** Über das `Agent`/`Task`-Tool (`subagent_type: general-purpose`) — Plan-Schreiben ist reasoning-lastige Meta-Arbeit: Modell-Default `opus` (triviale chore-artige Pläne: `sonnet`), Effort high; bei großen multi-subsystem-Specs die ultra-Stufe (`Workflow`-Fan-out).
   - **opencode:** Über `delegate(prompt, agent="researcher")` für read-only oder native write-capable Delegation. Effort-Formulierungen, Worktree-`cd`-Pflicht und Eskalations-Rubrik stehen in der Reference (SSOT, nicht hier wiederholen).
   - **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit; Kompaktheits-Regeln siehe subagent-provisioning §3):
     - Spec-Pfad: `openspec/changes/<slug>/design.md`
     - **Design-Bundle** (falls Schritt A.2 lief): `openspec/changes/<slug>/assets/` —
       der Plan MUSS `intent.md` als Design-Quelle referenzieren, die finalen Asset-Zielpfade
       (z. B. unter `website/src/...`) in die Task-`target_files` aufnehmen und die T000756-
       Guardrails (currentColor statt `<img>`, keine Stray-Hex, Export-Vollständigkeit) als
       Acceptance-Kriterien notieren. `new/` enthält nur geprüfte, passende Assets.
     - Ticket-/Grilling-Kontext (`$GRILLING_TICKET_EXT_ID` etc.), falls vorhanden.
      - **CI-/Quality-Gates:** [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md) — der Subagent MUSS die Datei lesen und den Plan dagegen schreiben: pro zu ändernder Datei `wc -l` UND den Baseline-Wert (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`) ermitteln und das S1-Budget gegen die **wirksame Schwelle** notieren — bei schon gebaselineten (gewachsenen) Dateien ist das Budget oft **0** (jede Netto-Zeile trippt das CI-Ratchet), dann zeilenneutral planen oder die Datei in dieser PR **echt verkleinern**; bei >~80 % der Schwelle echten Modul-Split einplanen (kein kosmetisches Zusammenziehen). Dazu: keine Brand-Domain-Literale in Code-Snippets (S3), Helper als pure Module ohne Import-Zyklen (S2), neue Manifeste/Skripte referenzieren statt verwaisen lassen (S4).
     - **Plan Intel Bundle (PFLICHT):** `openspec/changes/<slug>/intel.json` — der Plan-Subagent MUSS
       ausschließlich reale Signaturen/Typen aus `intel.json` referenzieren (keine erfundenen Typen),
       die vorberechneten `s1_budget`-Werte aus `impact_files` für die S1-Notation pro Datei nutzen und
       DB-Spalten/API-Contracts aus den `db_tables`/`api_contracts`-Sektionen zitieren. Format/Quellen:
       [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).
    - **plan-lint Hard Rules (PFLICHT — vom Subagenten verbatim zu befolgen):**
      SSOT: [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)
      §"plan-lint Hard Rules" — der Subagent MUSS die Datei lesen (F1/F2/STRUCT1–3/P1/B1a/B1b)
      und die tasks.md dagegen schreiben (`scripts/plan-lint.sh` ist das maschinelle Gate dazu).

---

## Fix-Pfad — Schritte im Detail

### Schritt 1: T-###### Ticket
Frage den User nach der Ticket-ID. Falls keins vorhanden ist, lege ein neues Ticket an — **MCP-first** (`ticket-mcp`; Rückgabe-Parsing: MCP-Tool-Guide §ticket-mcp):
> `mcp__ticket-mcp__create_ticket({ type: "bug", brand: "mentolder", title: "<titel>", description: "<beschreibung>", status: "triage", severity: "<critical|major|minor|trivial>", priority: "hoch" })`
Fallback (ticket-mcp nicht erreichbar):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type bug \
  --brand mentolder \
  --title "<titel>" \
  --description "<beschreibung>" \
  --status triage \
  --severity "<critical|major|minor|trivial>" \
  --priority hoch)
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```
### Schritt 2: Worktree anlegen
```bash
# git-crypt-safe: creates the worktree, handles git-crypt
bash scripts/worktree-create.sh fix/<slug> .worktrees/<slug>
cd .worktrees/<slug>
```

> **Das `cd` wirkt nur auf Bash [T002357].** Read/Write/Edit nehmen absolute Pfade ohne Bezug
> zum Bash-cwd — ab hier muss jeder Datei-Tool-Pfad explizit unter `.worktrees/<slug>/` liegen,
> sonst trifft er still den Hauptcheckout (Mishap T002350).
### Schritt 2.5: Ticket & Branch claimen (Session-Koordination [T000510])
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
bash scripts/agent-lock.sh claim branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
```
Exit 1 = eine lebende Session arbeitet schon daran → koordinieren, nicht duplizieren.
### Schritt 2.7: Lavish-Board starten ⚡ PFLICHT — vor Brainstorming
Erstelle `.lavish/<slug>-brainstorm.html` (Sections: Root-Cause, Fix-Ansatz, Subsysteme, Edge-Cases) und öffne es mit `npx -y lavish-axi .lavish/<slug>-brainstorm.html`.
### Schritt 2.8: Brainstorming ⚡ IMMER — kein Überspringen
Rufe `superpowers:brainstorming` auf. Nutze das `lavish`-Board für visuelle Root-Cause-Dokumentation.
Fokus: Root-Cause-Analyse, Fix-Ansatz, betroffene Subsysteme, Edge-Cases.
Ergebnis: Spec-Datei in `openspec/changes/<slug>/design.md`.
Der Brainstorming-Output informiert sowohl den failing Test (Schritt 3) als auch den Plan (Schritt 4) —
kein Test schreiben, bevor Root-Cause und Fix-Ansatz im Board geklärt sind.
### Schritt 3: Failing Test schreiben
Schreibe einen automatisierten Test, der den Bug reproduziert und fehlschlägt (PASS/FAIL rot-grün Prinzip). Dies ist eine **harte Voraussetzung** für den Fix-Pfad.
**Wo:** In `tests/spec/<spec-slug>.bats` (Spec zu diesem Fix aus `openspec/specs/`), nicht in eine neue `tests/local/FA-XY-*.bats` Ticket-Datei. Falls `tests/spec/<spec-slug>.bats` noch nicht existiert, anlegen (Vorlage: `tests/spec/software-factory.bats`).
### Schritt 4: Plan schreiben
Rufe `superpowers:writing-plans` auf (Claude Code — built-in) oder führe die Plan-Schreib-Schritte
direkt aus (opencode — das Äquivalent ist in `opencode-flow-plan` inlined; schreibe den Plan nach
`openspec/changes/<slug>/tasks.md` gemäß den plan-lint Hard Rules in Schritt 3.7).
Wende das Frontmatter an und trage die Ticket-ID ein. Committe und pushe den Plan.
### Schritt 4.5: Plan stagen (Fix 6)
**MCP-first** (`ticket-mcp`):
> `mcp__ticket-mcp__stage_plan({ id: "$TICKET_EXT_ID", branch: "fix/<slug>", plan: "openspec/changes/<slug>/tasks.md" })`
Fallback (ticket-mcp nicht erreichbar):
```bash
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "fix/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md"
```
Damit ist das Fix-Ticket als `plan_staged` in der DB verankert und für `dev-flow-execute` bereit.
### Schritt 5: Commit & Push
Füge den failing Test und den Plan hinzu, committe und pushe auf den fix Branch:
```bash
git add tests/ openspec/changes/<slug>/tasks.md
git commit -m "chore(plans): add failing test + stage plan [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```
> **Wichtig — Commit-Titel-Konvention für Plan-Stage-Commits:** Der Stage-Commit enthält NUR den RED-Test und Plan-Artefakte, KEINE Production-Code-Änderung. Verwende deshalb `chore(plans):` (analog zum Feature-Pfad oben) — **nicht** `fix(<scope>):` / `feat(<scope>):` / `refactor(<scope>):` / `perf(<scope>):`. Diese Implementierungs-Präfixe wären eine Lüge, weil der Diff keinen Production-Code enthält; der nachfolgende `dev-flow-execute`-Implementer würde dem Titel vertrauen und den eigentlichen Fix überspringen — exakt das ist bei T001434 (2026-07-02) passiert.
>
> Falls der Plan zusätzlich Production-Code-Aufgaben enthält, die der Planer bereits anwendet (z.B. vom Fix unabhängiger Boilerplate): trotzdem `chore(plans):` verwenden und die Production-Code-Änderung in einem **separaten Commit** mit `fix(<scope>):` ablegen, damit die `commit-vs-diff`-Guard (`.githooks/commit-msg`) den Stage-Commit passieren lässt.
>
> Guard: `scripts/check-commit-vs-diff.sh` + `.githooks/commit-msg` (siehe `openspec/specs/ci-cd.md`) blockiert jeden Commit mit Implementation-Type, dessen Staged-Diff nur Test-/Spec-/Plan-Dateien enthält — mit Verweis auf die richtigen Präfixe. Bypass: `SKIP_COMMIT_VS_DIFF=1 git commit ...` (Notfall).
**STOPP.** Failing Test, Spec und Plan sind committed und gepusht. Nächster Schritt: `dev-flow-execute` aufrufen.

## Preflight — Check merged ticket (T002279)

Gilt in **beiden** Pfaden vor der Worktree-Anlage. Ein Bug wird häufig beiläufig in einem
anderen Ticket mitgefixt; ohne diesen Check investiert die Planungs-Session Recherche in einen
bereits erledigten Bug.

```bash
bash scripts/agent-lock.sh check-merged "$TICKET_EXT_ID"
```

Exit-Codes:

| rc | Bedeutung | Reaktion |
|----|-----------|----------|
| 0 | Ticket-ID nicht auf `main` gefunden | fortfahren |
| 1 | Ticket-ID in gemergtem Commit oder Commit-Body auf `main` | Ticket auf `done` setzen, Session abbrechen |
| 2 | ungültiges ID-Format oder `origin/main` fehlt | Aufruf korrigieren; kein Freibrief zum Fortfahren |

Der Check kostet einen `git log`-Aufruf und fing beide Fundstellen der ursprünglichen Meldung
ab (T002264, T002259). Er ersetzt **nicht** den Post-Merge-Scan aus T002279, sondern verhindert
Doppelarbeit, bevor sie entsteht.
