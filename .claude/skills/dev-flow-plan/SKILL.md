---
name: dev-flow-plan
description: Use to choose the development path (feature/fix/chore), run brainstorming, and generate a design spec and implementation plan.
---

# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will.

**Sage zu Beginn:** "Ich nutze dev-flow-plan für Pfad-Wahl und Planung."

---

## Position im Git-Kreislauf

```
    ┌──────────────────────────────────────────────────────────┐
    ▼                                                          │
[ main ]                                                       │
    │                                                          │
    ├─► [branch + spec + plan] ── DIESER SKILL ── AUSSTIEG ──►│
    │         (feature / fix)         pushed                   │
    │                                                          │
    └─► [chore direkt] ── dev-flow-chore ──────────────────────┘
```

**EINSTIEG:** `main` — synchronisiert, sauberer Stand  
**AUSSTIEG:** Feature/Fix-Branch mit committiertem Plan auf Remote gepusht, Ticket `plan_staged`  
**Nächster Schritt:** `dev-flow-execute` — liest Plan aus DB und implementiert

---

## Schritt −3: Deep Grilling (optional)

Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session (siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für den Fragenkatalog).

**Nutze `lavish` für die Q/A-Session:** Erstelle `.lavish/<slug>-grilling.html` mit den Fragen als interaktivem Formular (Input-Playbook), öffne es mit `npx -y lavish-axi .lavish/<slug>-grilling.html` und poll auf Antworten. So kann der User strukturiert antworten, annotieren und Feedback geben.

Falls durchgeführt, erstelle das Grilling-Ticket — **MCP-first** (`ticket-mcp`; Rückgabe-Parsing
`external_id|uuid`: siehe [MCP-Tool-Guide](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §ticket-mcp).

> `mcp__ticket-mcp__create_ticket({ type: "task", brand: "mentolder", title: "Grilling: <kurzer-titel>", priority: "mittel", description: "FUNKTIONALE ANFORDERUNGEN:\n<requirements>\n\nASSETS ZU BESCHAFFEN:\n<assets-todo>" })`

Setze `GRILLING_TICKET_EXT_ID` (Feld 1) und `GRILLING_TICKET_UUID` (Feld 2) aus der Rückgabe.

Fallback (ticket-mcp nicht erreichbar):

```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "Grilling: <kurzer-titel>" \
  --priority mittel \
  --description "FUNKTIONALE ANFORDERUNGEN:"$'\n'"$GRILLING_REQUIREMENTS"$'\n\n'"ASSETS ZU BESCHAFFEN:"$'\n'"$GRILLING_ASSETS_TODO")

export GRILLING_TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
export GRILLING_TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
```

Hänge Dateien mit `bash scripts/ticket-attach.sh "$GRILLING_TICKET_UUID" <pfade>` an.

> **Strukturierte Q/A persistieren:** Nach dem Deep-Grilling die Antworten zusätzlich
> ans Ticket senden — `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`
> (akkumulierend, erscheint später im T000737-Panel). Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

---

## Schritt −2: Main-Branch sync (Pull-First)

Führe immer als erstes aus:

```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash && git pull --rebase origin main && git stash pop
fi
```

---

## Schritt −1: Reaper & Stale-Worktree-Audit

Räume tote Sessions/Zombies/stale Worktrees auf und sieh, wer gerade was bearbeitet —
Lock-Lebenszyklus-SSOT: [session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md) [T000510]:
```bash
bash scripts/agent-lock.sh reap   # killt cwd-tote-Worktree-Prozesse, prunet Worktrees, räumt tote Locks
bash scripts/agent-lock.sh list   # "Wer macht was": laufende Claims anderer Sessions
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
git worktree list
# Stale Worktrees ggf. löschen: git worktree remove <path> --force && git branch -D <branch>
```

---

## Schritt 0: Pfad bestimmen

Wähle einen der Pfade (Feature/Fix/Chore) basierend auf der Anfrage und kläre dies mit dem User ab.

- **feature**: Neue Funktionen oder UI-Elemente. → diese Skill (Feature-Pfad unten).
- **fix**: Fehlerbehebung (erfordert Ticket-ID). → diese Skill (Fix-Pfad unten).
- **chore**: Wartung, Doku, Dependency-Bumps (keine Verhaltensänderung). → **rufe `dev-flow-chore` auf und STOPP** — Chores werden dort direkt ausgeführt und gemergt, nicht hier geplant.

> Diese Skill plant nur (Feature/Fix) und stoppt vor der Umsetzung. Die Umsetzung übernimmt
> `dev-flow-execute`. Chores laufen vollständig in `dev-flow-chore`.

### Artefakt-Ebene: braucht der Request ein PRD davor?

Die feature/fix/chore-Wahl oben ist die *Pfad*-Wahl durch diese Skill. Davor steht die
*Artefakt*-Wahl: die meisten Requests steigen direkt auf Change-Proposal-Ebene ein (Feature-Pfad
→ Schritt 3.1 `/opsx:propose`). Ein PRD ist das **schwerste** Artefakt und nur für
Epic-große Arbeit gedacht — ein PRD pro Feature kollabiert die Abstraktionsebenen und erzeugt
Mehrfach-SSOT.

| Gestalt der Arbeit | Artefakt | Bei dir konkret |
|---|---|---|
| Großes, unscharfes Produktziel, viele Features | **PRD** | `parse_prd` (task-master) — Bootstrap/Epic-Zerlegung |
| Architektur-/Technologieentscheidung | **ADR** | `manage_adr` / OpenSpec |
| *Ein* konkretes Feature, Intent klar | **Change-Proposal** | `/opsx:propose <slug>` (Feature-Pfad, Schritt 3.1) |
| Feature, aber Design noch offen | **Brainstorming → Spec** | diese Skill, Feature-Pfad |
| Wartung, kein Verhaltenswechsel | **Chore-Ticket** | `dev-flow-chore` |
| Regression | **Fix + failing test** | diese Skill, Fix-Pfad |

**Checkliste — PRD davor, oder direkt `openspec:propose`?**

PRD davorschalten, wenn MINDESTENS EINE zutrifft:
- **Mehrere Capabilities** — der Request zerfällt in >1 OpenSpec-Change (Epic).
- **„Warum" strittig** — Problem/Zielgruppe/Erfolgsmetrik offen, nicht nur das „Wie".
- **Neues Teilprodukt/Service** — net-new Surface, keine bestehende Spec zum Anknüpfen.
- **Cross-Brand/Cross-Subsystem** mit echtem Priorisierungsbedarf.

Direkt `openspec:propose` (kein PRD), wenn ALLE zutreffen:
- Genau **eine** Capability betroffen.
- Intent klar, nur das „Wie" offen → klärt das Brainstorming (Schritt 3) ohnehin.
- Es gibt eine bestehende Spec in `openspec/specs/`, in die der Delta einfließt (oder klar genau eine neue).

> **Faustregel:** PRD nur, wenn die Arbeit größer ist als ein einzelner Change — sonst Overhead.
> Im PRD-Fall: `parse_prd` → N Tickets/Changes → für *jeden* Change wieder dieser normale Pfad.
> Das PRD bleibt **Upstream-Kontext, wird nie SSOT** (die konsolidierte `openspec/specs/`-Spec ist SSOT).

---

## Feature-Pfad

> **Proposal-Konvention:** Die gesamte Proposal-Phase (Brainstorming + `openspec:propose`) läuft
> auf dem `main`-Branch — erst danach wird der Worktree angelegt. So sieht OpenSpec beim
> Propose alle SSOT-Specs und committed Proposals auf main, nicht nur das eigene Branch-Delta.

---

### Phase A: Auf main — Proposal-Phase

#### Schritt A.1: Asset-Sammlung + Codebase-Exploration
Frage den User aktiv nach Spec-Notizen, Mockups oder Screenshots. Lese Text- und Image-Dateien mit dem `Read` Tool ein, um sie in den Kontext zu laden.

Verwende einen Code-Explorer Subagenten, um die Code-Pfade und Architektur vor dem Brainstorming zu analysieren.

#### Schritt A.1.5: Intel-Gathering → Plan Intel Bundle ⚡

Nach der Exploration (A.1) ein typisiertes **Plan Intel Bundle** befüllen (`intel.json`) — die
maschinenlesbare Typen-Wahrheit, die Plan- und Execute-Phase teilen. Schema + Quellen-Mapping:
[plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).

Jede Sektion ist an ihre Intel-Quelle gebunden:
- `symbols` / `signature` / `type_text` → **codebase-memory** (`get_code_snippet`, `search_graph`) + **LSP** (Hover/Definition); Fallback `grep`/`Read`.
- `call_graph` → **codebase-memory** `trace_path` (`calls`/`data_flow`/`cross_service`).
- `db_tables` → **mcp-postgres** (`information_schema.columns`, read-only); Fallback `kubectl exec … psql`.
- `api_contracts` → `Read` der `website/src/pages/api/**`-Handler + deren Typen.
- `external_types` → **context7** (`resolve-library-id` → `query-docs`).
- `impact_files` / `s1_*` → `wc -l` + `docs/code-quality/baseline.json` + `_ext_limit` (plan-lint-Logik).

Liegt vor `/opsx:propose` noch kein Change-Ordner vor, halte das Bundle bei den übrigen
Phase-A-Artefakten und verschiebe es in **B.2** nach `openspec/changes/<slug>/intel.json`. Ist eine
Quelle und auch ihr Fallback nicht erreichbar, setze einen `risks[]`-Eintrag (`severity: warn`) statt
die Sektion still leer zu lassen. Validiere lokal strukturell (`jq`). Das Bundle informiert bereits
das Brainstorming (A.4).

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
Rufe `superpowers:brainstorming` auf. Nutze das `lavish`-Board (aus Schritt A.3) für visuelle Dokumentation und strukturiertes Feedback.
Ergebnis: Spec-Datei in `docs/superpowers/specs/<date>-<slug>-design.md`.
Nach dem Schreiben der Spec das Frontmatter setzen (siehe
`docs/superpowers/specs/spec-frontmatter-standard.md`):
`bash scripts/vda.sh frontmatter --spec docs/superpowers/specs/<date>-<slug>-design.md`
und `ticket_id`/`plan_ref` ausfüllen sobald Ticket-ID und Plan-Pfad feststehen.

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

---

### Phase B: Worktree anlegen + Artefakte übertragen

#### Schritt B.1: Worktree anlegen
Erstelle den Worktree NACH dem Propose (niemals `.claude/worktrees/` verwenden!):
```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>

# Doppelarbeit verhindern: Branch claimen (Session-Koordination [T000510]).
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
  || { echo "🛑 Branch wird bereits von einer anderen Session bearbeitet — koordinieren oder anderen slug wählen."; exit 1; }

# Ticket-Claim (Session-Koordination [T000510]) — nur falls die Ticket-ID schon bekannt
# ist (z. B. von feature-intake übergeben). Ist noch keine Ticket-ID bekannt, holt
# Schritt 4.5 den Claim nach, sobald das Ticket dort angelegt/wiederverwendet wird. [T001386]
if [[ -n "${TICKET_EXT_ID:-}" ]]; then
  bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
    --branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label dev-flow-plan \
    || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
fi
```

#### Schritt B.2: Proposal-Artefakte in den Worktree verschieben
Die Artefakte aus Phase A befinden sich noch im main-Checkout — jetzt in den frischen Worktree verschieben:

```bash
WT="/tmp/wt-<slug>"

# OpenSpec-Change-Ordner (proposal.md, tasks.md, ggf. assets/)
mkdir -p "${WT}/openspec/changes/"
mv "${REPO_ROOT}/openspec/changes/<slug>" "${WT}/openspec/changes/<slug>"

# Brainstorming-Spec
mv "${REPO_ROOT}/docs/superpowers/specs/<date>-<slug>-design.md" \
   "${WT}/docs/superpowers/specs/"

# Plan Intel Bundle (aus A.1.5) in den Change-Ordner verschieben (falls separat gehalten)
[ -f "${REPO_ROOT}/intel.json" ] && \
  mv "${REPO_ROOT}/intel.json" "${WT}/openspec/changes/<slug>/intel.json" 2>/dev/null || true

# Lavish-Board (falls vorhanden)
[ -f "${REPO_ROOT}/.lavish/<slug>-brainstorm.html" ] && \
  mv "${REPO_ROOT}/.lavish/<slug>-brainstorm.html" "${WT}/.lavish/" 2>/dev/null || true

cd "${WT}"
```

Schlüsseldateien ans Ticket hängen (falls Design-Bundle, Schritt A.2):
```bash
bash scripts/ticket-attach.sh "$TICKET_UUID" \
  "openspec/changes/<slug>/assets/intent.md" \
  openspec/changes/<slug>/assets/new/*.svg
```

---

### Phase C: Im Worktree — Plan-Phase

### Schritt 3.7: Plan-Erstellung an einen passend provisionierten Subagenten delegieren
Statt deinen eigenen Kontext zurückzusetzen (das ließe dich den Faden verlieren), committe die Spec und delegiere das Plan-Schreiben an einen **frischen Subagenten** — der hat per Konstruktion einen sauberen Kontext und bekommt ein **zur Plan-Komplexität passendes Modell + Effort**. Du selbst behältst den vollen Brainstorming-Kontext.

1. Committe und pushe die Spec-Datei auf den Feature-Branch.
2. Spawne über das `Agent`/`Task`-Tool einen Subagenten (`subagent_type: general-purpose`), **provisioniert gemäß** [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) — Plan-Schreiben ist reasoning-lastige Meta-Arbeit: Modell-Default `opus` (triviale chore-artige Pläne: `sonnet`), Effort high; bei großen multi-subsystem-Specs die ultra-Stufe (`Workflow`-Fan-out) — Effort-Formulierungen, Worktree-`cd`-Pflicht und Eskalations-Rubrik stehen in der Reference (SSOT, nicht hier wiederholen).
   - **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit; Kompaktheits-Regeln siehe subagent-provisioning §3):
     - Spec-Pfad: `docs/superpowers/specs/<date>-<slug>-design.md`
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
      F1/F2/STRUCT1–3/P1 stehen als SSOT in
      [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)
      §plan-lint — der Subagent MUSS die Datei lesen und die tasks.md dagegen schreiben
      (`scripts/plan-lint.sh` ist das maschinelle Gate dazu).
      - **Auftrag:** „**PFLICHT — Worktree-Isolation:** Beginne deinen Prompt mit `cd /tmp/wt-<slug>` — der Subagent hat keinen impliziten CWD-Kontext und schreibt sonst ins Haupt-Checkout. Alle folgenden Dateipfade sind relativ zu diesem Worktree.
     
     Dann: Lies die Spec UND `.claude/skills/references/plan-quality-gates.md`. Rufe `superpowers:writing-plans` auf und schreibe den Implementierungsplan **ausschließlich** nach `openspec/changes/<slug>/tasks.md` (OpenSpec-Format: H2-Operationsheader im Delta, H3-Requirement, H4-Scenario im `specs/<capability>.md`). Der finale Verifikations-Task des Plans MUSS `task test:changed`, `task freshness:regenerate` und `task freshness:check` als Steps enthalten (CI-Äquivalent inkl. S1–S4-Ratchet); nach Test-Änderungen zusätzlich `task test:inventory` + Commit des Inventars. Vor dem Commit: `task test:openspec` (oder `bash scripts/openspec.sh validate`) — muss grün sein. **Test-Assertion-Konsistenz:** Verifiziere vor Finalisierung, dass jede im Plan-Task vorgegebene Test-Regex/Erwartung tatsächlich die im selben Task referenzierten Implementierungs-Snippets matchen kann — bei Diskrepanz wähle eine semantisch äquivalente Assertion-Form, die zum Snippet passt. Starte KEINE Implementierung (nur Plan schreiben, dann STOPP). Gib den Plan-Pfad (`openspec/changes/<slug>/tasks.md`) und eine 3-Zeilen-Zusammenfassung zurück."

### Schritt 3.8: Plan-Qualitäts-Gate (deterministischer Linter + advisory LLM-QA)

Führe ZUERST den deterministischen, fail-closed Linter auf den Plan-Pfad aus, den der
Subagent zurückgegeben hat — das ist das **harte Gate**:

```bash
bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md
```

- **PASS (Exit 0):** weiter — danach optional die advisory LLM-QA (bricht nie):
  ```bash
  bash scripts/plan-qa-check.sh openspec/changes/<slug>/tasks.md || true
  ```
  Anschließend weiter zu Schritt 4.
- **FAIL (Exit 1):** der Linter listet die Hard-Fails (F1/F2/STRUCT/P1/B1a). Delegiere
  erneut an einen Plan-Subagenten (Schritt 3.7) mit den Hard-Fails als Korrektur-Hinweis,
  bis `plan-lint.sh` PASS liefert. KEIN Weitergehen mit rotem Linter.

### Schritt 4: Plan prüfen & übernehmen
Du behältst deinen vollen Brainstorming-Kontext: lies den vom Subagenten zurückgegebenen Plan und prüfe ihn gegen die im Brainstorming getroffenen Entscheidungen. Prüfe zusätzlich die Gate-Konformität (Checkliste in [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)): S1-Budgets gegen die **wirksame Schwelle** (Baseline-Wert falls gebaselined, sonst Limit) pro Datei notiert — und bei Budget≈0 ein echter Verkleinerungs-/Split-Schritt statt kosmetischem Zusammenziehen? Finaler Verifikations-Task enthält `task test:changed` + `task freshness:regenerate` + `task freshness:check`? Keine Brand-Domain-Literale in den Code-Snippets? Bei Lücken oder Abweichungen delegiere erneut (Schritt 3.7) mit konkreten Korrektur-Hinweisen. Erst wenn der Plan passt, weiter zu Schritt 4.5.

### Schritt 4.5: Ticket anlegen oder wiederverwenden

Prüfe ob ein bestehendes Ticket-ID übergeben wurde (z.B. von `feature-intake`).

**MCP-first** (`ticket-mcp`) — wenn noch kein `TICKET_EXT_ID` gesetzt ist, ein neues Ticket anlegen (Rückgabe-Parsing: MCP-Tool-Guide §ticket-mcp).

> `mcp__ticket-mcp__create_ticket({ type: "task", brand: "mentolder", title: "Plan: <slug>", priority: "mittel", description: "Branch: feature/<slug>\nPlan: openspec/changes/<slug>/tasks.md\nSpec: docs/superpowers/specs/<date>-<slug>-design.md\n<grilling-ref>" })`

Bei vorhandenem Ticket stattdessen die UUID lesen: `mcp__ticket-mcp__get_ticket({ id: "$TICKET_EXT_ID" })` → `.id` ist die UUID.

Plan stagen (Branch + Plan-Pfad im Ticket verankern — SSOT für dev-flow-execute) — **MCP-first**:

> `mcp__ticket-mcp__stage_plan({ id: "$TICKET_EXT_ID", branch: "feature/<slug>", plan: "openspec/changes/<slug>/tasks.md" })`

Fallback (ticket-mcp nicht erreichbar):

```bash
# Falls TICKET_EXT_ID bereits gesetzt ist (von feature-intake oder User-Input),
# wiederverwenden — kein neues Ticket erstellen.
if [[ -z "${TICKET_EXT_ID:-}" ]]; then
  # Kein bestehendes Ticket — neues erstellen
  GRILLING_REF=""
  if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then
    GRILLING_REF=$'\n'"Grilling-Ticket: ${GRILLING_TICKET_EXT_ID}"
  fi

  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "Plan: <slug>" \
    --priority mittel \
    --description "Branch: feature/<slug>"$'\n'"Plan: openspec/changes/<slug>/tasks.md"$'\n'"Spec: docs/superpowers/specs/<date>-<slug>-design.md"$GRILLING_REF)

  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
else
  # Bestehendes Ticket wiederverwenden — UUID für Attachments holen
  TICKET_UUID=$(./scripts/ticket.sh get --id "$TICKET_EXT_ID" | jq -r '.id')
  echo "✅ Wiederverwende bestehendes Ticket $TICKET_EXT_ID"
fi

# Plan stagen: Branch + Plan-Pfad im Ticket verankern (Single Source of Truth für dev-flow-execute).
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md"
```

Hänge gesammelte Assets mit `bash scripts/ticket-attach.sh "$TICKET_UUID" <pfade>` an.

Ticket-Claim jetzt nachholen (Session-Koordination [T000510]) — der Feature-Pfad kennt
die Ticket-ID erst ab hier; Schritt 5's Pre-Commit-Guard prüft ticket-scoped und braucht
diesen Claim VOR dem Commit. Falls Schritt B.1 den Claim bereits gesetzt hat (Ticket-ID
war vorab bekannt), ist ein erneuter Claim durch dieselbe Session ein no-op-Refresh
(kein Fehler):
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "$(git branch --show-current)" --worktree "$(pwd)" --label dev-flow-plan \
  || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
```

### Schritt 5: Commit & Push — dann STOPP

**Pre-Commit Guard (PFLICHT — Schritt 5) [T001268]:**

Bevor der plan-stage Commit läuft, MUSS der Operator verifizieren:

1. **Do not commit on main / Nicht auf main committen:**
   ```bash
   CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
   [ "$CURRENT_BRANCH" != "main" ] || { echo "FATAL: plan-stage commit auf main ist verboten — nutze einen Worktree-Branch." >&2; exit 1; }
   ```

2. **Clean git status / Sauberer Status ist Pflicht:**
   ```bash
   [ -z "$(git status --porcelain)" ] || { echo "FATAL: working tree ist nicht sauber — stash oder commit zuerst." >&2; exit 1; }
   ```

3. **Branch stimmt mit agent-lock claim überein:**
   ```bash
   LOCK_FILE=".git/agent-locks/ticket__${TICKET_EXT_ID}.json"
   [ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock-Claim für $TICKET_EXT_ID gefunden ($LOCK_FILE fehlt) — claim zuerst mit agent-lock.sh claim ticket (siehe Schritt B.1 / Schritt 4.5)." >&2; exit 1; }
   CLAIMED_BRANCH="$(jq -r '.branch' "$LOCK_FILE" 2>/dev/null)"
   [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch — agent-lock claim = $CLAIMED_BRANCH, HEAD = $CURRENT_BRANCH." >&2; exit 1; }
   ```

Erst nach diesen drei Checks darf `git commit` und `git push` laufen. Damit verweigern wir stale plan-stage commits auf `main`.

```bash
# Sicherheitscheck: Branch-Guard [T000321]
git add openspec/changes/<slug>/
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

### Schritt 6: Optionaler Plan-Review (interaktiv)

Bevor du den Plan committest und Ausführungsoptionen anzeigst, kannst du den Plan
annotierbar rendern und im Browser reviewen (additiv/optional; der bestehende
STOP-Text in Schritt 5 bleibt der Default):

```bash
bash scripts/plan-review/plan-review.sh render openspec/changes/<slug>/tasks.md
```

Im Browser: Text markieren → annotieren (Durchstreichen/Ersetzen/Einfügen/Kommentar) →
✓ Approve oder ↺ Änderungen anfordern. Danach das Ergebnis einlesen:

```bash
bash scripts/plan-review/plan-review.sh result
```

- **approve**: `{verdict:"approve"}` → fahre mit Schritt 6 fort (Ausführungsoptionen).
- **request-changes**: `{verdict:"request-changes", annotations:[…]}` → die
  Annotationen als Änderungsauftrag an einen Plan-Schreib-Agenten übergeben,
  1 Revisions-Runde, dann erneut rendern und reviewen. Wiederhole bis approve.

Details siehe [plan-review-ui](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-review-ui.md).

**STOPP.** Branch, Spec und Plan sind committed und gepusht. Nächster Schritt: `dev-flow-execute` aufrufen.

---

## Fix-Pfad

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
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh fix/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
```

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
Ergebnis: Spec-Datei in `docs/superpowers/specs/<date>-<slug>-design.md`.
Der Brainstorming-Output informiert sowohl den failing Test (Schritt 3) als auch den Plan (Schritt 4) —
kein Test schreiben, bevor Root-Cause und Fix-Ansatz im Board geklärt sind.

### Schritt 3: Failing Test schreiben
Schreibe einen automatisierten Test, der den Bug reproduziert und fehlschlägt (PASS/FAIL rot-grün Prinzip). Dies ist eine **harte Voraussetzung** für den Fix-Pfad.

**Wo:** In `tests/spec/<spec-slug>.bats` (Spec zu diesem Fix aus `openspec/specs/`), nicht in eine neue `tests/local/FA-XY-*.bats` Ticket-Datei. Falls `tests/spec/<spec-slug>.bats` noch nicht existiert, anlegen (Vorlage: `tests/spec/software-factory.bats`).

### Schritt 4: Plan schreiben
Rufe `superpowers:writing-plans` auf. Wende das Frontmatter an und trage die Ticket-ID ein. Committe und pushe den Plan.

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

> **Wichtig — Commit-Titel-Konvention für Plan-Stage-Commits:** Der Stage-Commit enthält
> NUR den RED-Test und Plan-Artefakte, KEINE Production-Code-Änderung. Verwende deshalb
> `chore(plans):` (analog zum Feature-Pfad oben) — **nicht** `fix(<scope>):` /
> `feat(<scope>):` / `refactor(<scope>):` / `perf(<scope>):`. Diese Implementierungs-
> Präfixe wären eine Lüge, weil der Diff keinen Production-Code enthält. Der nachfolgende
> `dev-flow-execute`-Implementer würde dem Titel vertrauen und den eigentlichen Fix
> überspringen — exakt das ist bei T001434 (2026-07-02) passiert.
>
> Falls der Plan zusätzlich Production-Code-Aufgaben enthält, die der Planer bereits
> anwendet (z.B. Boilerplate, der vom Fix unabhängig ist): trotzdem `chore(plans):`
> verwenden und die Production-Code-Änderung in einem **separaten Commit** mit
> `fix(<scope>):` ablegen, damit die `commit-vs-diff`-Guard (`.githooks/commit-msg`)
> den Stage-Commit passieren lässt.
>
> Guard: `scripts/check-commit-vs-diff.sh` + `.githooks/commit-msg` (siehe
> `openspec/specs/ci-cd.md`) blockiert jeden Commit mit Implementation-Type, dessen
> Staged-Diff nur Test-/Spec-/Plan-Dateien enthält — mit Verweis auf die richtigen
> Präfixe. Bypass: `SKIP_COMMIT_VS_DIFF=1 git commit ...` (Notfall).

**STOPP.** Failing Test, Spec und Plan sind committed und gepusht. Nächster Schritt: `dev-flow-execute` aufrufen.

---

## Chore-Pfad

Ausgelagert nach `dev-flow-chore` — Chores brauchen keinen Plan und werden dort direkt ausgeführt
und gemergt. In Schritt 0 für Chores sofort `dev-flow-chore` aufrufen und hier stoppen.

---


## Übergabe an dev-flow-execute

**Zustand bei STOPP:**
- Branch `feature/<slug>` oder `fix/<slug>` auf Remote gepusht
- Plan `openspec/changes/<slug>/tasks.md` committed
- Ticket status = `plan_staged`
- Branch-Lock aktiv (andere Sessions sehen diesen Branch als belegt)

**Nächster Schritt im Kreislauf:** `dev-flow-execute` aufrufen.  
Der Skill liest den Plan automatisch aus der DB (`FACTORY-PLAN-REF` Kommentar) — kein manuelle Pfad-Übergabe nötig.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `superpowers:brainstorming` | **IMMER** aufgerufen — Feature-Pfad Schritt 3, Fix-Pfad Schritt 2.8 |
| `superpowers:writing-plans` | Aufgerufen vom Plan-Subagenten (Schritt 3.7) |
| `dev-flow-execute` | **Nachfolger im Kreislauf** — implementiert den erstellten Plan |
| `dev-flow-chore` | Geschwister — Chores statt Features/Fixes (direkter Kurzschluss) |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).