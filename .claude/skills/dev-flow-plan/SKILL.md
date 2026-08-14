---
name: dev-flow-plan
description: 'Use to choose the development path (feature/fix/chore), run brainstorming, and generate a design spec and implementation plan.'
---
# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan
## Wann diese Skill greift
Bei jeder Anfrage in diesem Repo, die etwas verändern will.
**Sage zu Beginn:** "Ich nutze dev-flow-plan für Pfad-Wahl und Planung."
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
## Schritt −3: Deep Grilling (optional)
Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session (siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für den Fragenkatalog).
**Nutze `lavish` für die Q/A-Session:** Erstelle `.lavish/<slug>-grilling.html` mit den Fragen als interaktivem Formular (Input-Playbook), öffne es mit `npx -y lavish-axi .lavish/<slug>-grilling.html` und poll auf Antworten. So kann der User strukturiert antworten, annotieren und Feedback geben.
Falls durchgeführt, erstelle das Grilling-Ticket — **MCP-first** (`ticket-mcp`; Rückgabe-Parsing `external_id|uuid`: siehe [MCP-Tool-Guide](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §ticket-mcp).
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
> **Strukturierte Q/A persistieren:** Nach dem Deep-Grilling die Antworten zusätzlich ans Ticket senden — `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …` (akkumulierend, erscheint später im T000737-Panel). Siehe `.claude/skills/references/grilling-to-ticket.md`.
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
## Schritt −1: Reaper & Stale-Worktree-Audit
Räume tote Sessions/Zombies/stale Worktrees auf und sieh, wer gerade was bearbeitet —
Lock-Lebenszyklus-SSOT: [session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md) [T000510]:
```bash
bash scripts/agent-lock.sh reap   # killt cwd-tote-Worktree-Prozesse, prunet Worktrees, räumt tote Locks
bash scripts/agent-lock.sh list   # "Wer macht was": laufende Claims anderer Sessions
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
git worktree list
bash scripts/worktree-git-op-guard.sh
# Stale Worktrees ggf. löschen: git worktree remove <path> --force && git branch -D <branch>
```
## Schritt 0: Pfad bestimmen
Wähle einen der Pfade (Feature/Fix/Chore) basierend auf der Anfrage und kläre dies mit dem User ab.
- **feature**: Neue Funktionen oder UI-Elemente. → diese Skill (Feature-Pfad unten).
- **fix**: Fehlerbehebung (erfordert Ticket-ID). → diese Skill (Fix-Pfad unten).
- **chore**: Wartung, Doku, Dependency-Bumps (keine Verhaltensänderung). → **rufe `dev-flow-chore` auf und STOPP** — Chores werden dort direkt ausgeführt und gemergt, nicht hier geplant.
> Diese Skill plant nur (Feature/Fix) und stoppt vor der Umsetzung. Die Umsetzung übernimmt
> `dev-flow-execute`. Chores laufen vollständig in `dev-flow-chore`.
### Artefakt-Ebene: braucht der Request ein PRD davor?
Die feature/fix/chore-Wahl oben ist die *Pfad*-Wahl durch diese Skill; davor steht die
*Artefakt*-Wahl (PRD vs. ADR vs. Change-Proposal vs. Chore-Ticket). Entscheidungstabelle +
PRD-Checkliste: [plan-artifact-level](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-artifact-level.md).

## Schritt 0.7: Prior-Art-Suche vor der ersten Architekturfrage [T002829]

Bevor dem User eine **Architekturfrage** gestellt wird („gemeinsame Quelle oder duplizieren?",
„Bibliothek oder Inline?", „Hook oder Helper?"), MUSS geprüft sein, ob dieselbe Frage im Repo
schon einmal entschieden wurde. Das gilt für **beide** Pfade und liegt **vor** dem Brainstorming:
eine Antwort, die eine dokumentierte Entscheidung unbemerkt umkehrt, fällt sonst erst im Review
auf — oder gar nicht.

Die Suche geht über die **Requirements**, nicht nur über den Code. Eine bewusst verworfene
Lösungsrichtung hinterlässt im Code definitionsgemäß keine Spur; sie steht nur im Spec:

```bash
# 1) Requirements zum betroffenen Gegenstand — über die Dateipfade, nicht nur Stichworte
grep -rn -e '<pfad/der/betroffenen/datei>' -e '<zweiter-pfad>' openspec/specs/
# 2) Die Guards, die diese Entscheidung absichern (Drift-/Konventionstests)
grep -rln '<pfad/der/betroffenen/datei>' tests/spec/
```

Liefert die Suche ein Requirement zum selben Gegenstand, wird es **zitiert** (Datei + Zeilen) und
die Frage an den User lautet nicht mehr „welche Richtung?", sondern „bestehende Entscheidung
beibehalten oder ersetzen?". Fällt die Wahl auf Ersetzen, geht das über ein `RENAMED`/`MODIFIED`-
Delta auf den SSOT-Spec — nicht durch stilles Danebenschreiben.

> Beobachtet an T002817: Die Frage „gemeinsame Quelle vs. Allowlist spiegeln" war in
> `openspec/specs/divergence-guard.md` (aus T002470) bereits zugunsten der Duplikation entschieden
> und mit drei Drift-Tests abgesichert. Gefunden wurde das erst beim Schreiben des failing Tests —
> also nach der Nutzerfrage, die daraufhin ein zweites Mal beantwortet werden musste.
>
> Verwandt, aber nicht dasselbe: T002448-M5 (Fix-Pfad) verlangt, dass die **Ursache** vor dem
> Lösungsdesign belegt ist. Dieser Schritt verlangt zusätzlich, dass die **Lösungsrichtung** nicht
> schon einmal bewusst verworfen wurde.

## Feature-Pfad
> **Proposal-Konvention:** Die gesamte Proposal-Phase (Brainstorming + `openspec:propose`) läuft
> auf dem `main`-Branch — erst danach wird der Worktree angelegt. So sieht OpenSpec beim
> Propose alle SSOT-Specs und committed Proposals auf main, nicht nur das eigene Branch-Delta.

### Ablauf in drei Phasen

Die Proposal-Phase läuft bewusst **auf `main`** — so sieht OpenSpec beim Propose alle SSOT-Specs
und committed Proposals, nicht nur das eigene Branch-Delta. Erst danach entsteht der Worktree.

| Phase | Wo | Was |
|---|---|---|
| **A — Proposal** | `main` | Assets sammeln, Codebase erkunden, Plan Intel Bundle (`intel.json`) füllen, Design-Bundle co-lokalisieren, Lavish-Board, **Brainstorming**, `/opsx:propose <slug>` — die Design-Spec bekommt ihr Frontmatter per `scripts/vda.sh frontmatter` |
| **B — Branch live** | Worktree | `scripts/worktree-create.sh`, agent-lock claimen, Artefakte verschieben, Scaffold-Commit + Push |
| **C — Partial-Pipeline** | Worktree | Decompose in Partials, pro Partial: Plan schreiben → committen → stagen → enqueuen; danach plan-lint, Embedding, finaler Push |

> **`cd` wirkt nur auf Bash (T002357):** Ab Phase B tragen alle Datei-Tool-Pfade (Read/Write/Edit)
> zwingend den Worktree-Präfix — `cd` ändert nur das Bash-cwd, nicht den Bezugspunkt der
> Datei-Tools. Begründung und Prüfbefehl stehen bei der `cd`-Sequenz in `dev-flow-plan-phases.md`.

Vollständige Schrittfolge aller drei Phasen samt Befehlen, Decompose-/Fan-out-Mechanik
(Schritt 3.7) und Kontext-Injektion für Plan-Subagenten:
[dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md).

**Intel-Quellen des Bundles** (Phase A.1.5) — jede Sektion ist an ihre Quelle gebunden, damit der
Plan reale Signaturen statt erfundener Typen referenziert: `symbols`/`signature`/`type_text` und
`call_graph` aus **codebase-memory** plus **LSP**-Hover; `db_tables` aus **mcp-postgres**
(read-only); `external_types` aus **context7**; `impact_files`/`s1_*` aus `wc -l` +
`docs/code-quality/baseline.json`. Ist eine Quelle samt Fallback nicht erreichbar, wird ein
`risks[]`-Eintrag gesetzt statt die Sektion still leer zu lassen. Format:
[plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).

### Guards des Feature-Pfads

- **Preflight: Check merged ticket** (T002279) — beide Pfade, vor der Worktree-Anlage:
  `bash scripts/agent-lock.sh check-merged "$TICKET_EXT_ID"` (`rc=1` = auf `main` schon gefixt → Ticket `done`, abbrechen). Exit-Codes: [dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md) §Preflight.
- **Brainstorming ist nicht optional** — weder im Feature- noch im Fix-Pfad. Es entscheidet, was
  überhaupt gebaut wird; ein Plan ohne vorherige Klärung plant die falsche Sache sorgfältig.
- **Ticket vor Branch** (T001917, T002050): Steht die `TICKET_EXT_ID` fest, trägt der Branch sie
  als Suffix (`feature/<slug>-T002050`). Existiert noch kein Ticket, wird es **vor** der
  Worktree-Anlage erstellt. Sonst schlägt `preflight-pr-scope.sh` beim PR fehl, weil
  PR-Titel-Ticket-ID und Branch-Name auseinanderlaufen.
- **Disjunkte Partials (D1):** Keine Datei darf in zwei Partials liegen — `scripts/plan-lint.sh`
  erzwingt das. Das letzte Partial ist **immer** die Tests-Rolle und trägt den
  STRUCT2-Failing-Test-Step. Obergrenze 9.
- **Plan-Mutation:** Sobald ein Partial enqueued ist, darf der Planner es nicht mehr ändern.
- **Qualitäts-Gate vor Design-Assets:** Jedes synchronisierte SVG vor dem Ablegen prüfen —
  `currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
  Export-Vollständigkeit. Unpassende Assets werden **verworfen**, nicht mitkopiert (T000756).

### Race-Condition-Schutz
- **Slot-Gating:** `stage-plan --partials N` setzt `slot_count`. Factory dispatcht nur bis zu dieser Grenze.
- **Plan-Staleness:** Wenn Factory schneller ist als Planner → Dispatcher pausiert (kein Ticket in backlog). Sobald nächstes Partial enqueued ist, läuft Tick weiter.
- **Plan-Mutation:** Sobald ein Partial enqueued ist, darf der Planner es nicht mehr ändern.

### Schritt 3.7: Plan-Erstellung — Decompose, dann paralleler Fan-out (T002074)

Zweistufig: Der Orchestrator **decomposed** aus `intel.json` in Partials mit disjunkten
`target_files` (Tests immer separat, Obergrenze 9), dann schreiben **parallele Plan-Subagenten**
je ihre `tasks.d/pX-<name>.md`. Der Orchestrator schreibt den `tasks.md`-Index mit
Partial-Manifest, `## File Structure` und finalem Verify-Task. Mechanik, Kontext-Injektion und
Provisionierung: [dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md).

**Der Subagent-Prompt MUSS
[plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)
verbindlich einbinden** — der Subagent liest die Datei und schreibt den Plan dagegen. Sie ist
SSOT für die plan-lint Hard Rules: Frontmatter mit `title`, `ticket_id`, `domains`, `status` (F1),
`## File Structure` nach der H1 (STRUCT1), ein Failing-Test-Step mit der wörtlichen Phrase
`expected: FAIL` **plus** echtem Testrunner-Aufruf (STRUCT2), der finale Verify-Task mit
`task test:changed` / `task freshness:regenerate` / `task freshness:check` (STRUCT3), das Verbot
offener Platzhalter wie `TBD`/`TODO`/`FIXME` in der Prosa (P1) und die Budget-Integrität (B1a/B1b).

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
SSOT für Ticket-Anlage, Stage und Embedding: [ticket-stage-procedure](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-stage-procedure.md)

Dort steht auch der Ticket-Claim für diesen Schritt (`bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" …`, Session-Koordination [T000510]) — er muss laufen, bevor der Pre-Commit-Guard in Schritt 5 die Lock-Datei liest.

> **`--hold`-Pflicht für interaktive Stage-Calls:** Der Aufruf von `stage-plan` MUSS `--hold` setzen (siehe `ticket-stage-procedure.md`). Dadurch wird `readiness.execution_released=false` gesetzt, was das Ticket vom Factory-Dispatch zurückhält, bis `dev-flow-execute` es explizit freigibt. Seit T003267 verlangt `stage-plan` eine explizite Hold-Entscheidung (`--hold` oder `--no-hold`) — ohne eines der beiden Flags bricht es mit Exit 1 ab.

> **⚠ `stage-plan` läuft NACH dem Commit aus Schritt 5, nicht hier [T002673].** In diesem Schritt werden nur **Ticket angelegt und geclaimt** — der Claim muss vor dem Pre-Commit-Guard liegen, der Stage-Aufruf nicht. Grund: `stage-plan` liest die Plandatei über `git cat-file -p "${branch}:${plan}"` aus dem **Branch-Commit**, nicht aus dem Arbeitsbaum (`scripts/vda/ticket/stage-plan.sh`). Vor dem Commit steht dort noch das `propose`-Skeleton, und die `touched_files`-Ableitung meldet dann `keine Pfade ableitbar` und lässt die Spalte leer — ohne dass es auffällt, weil die Meldung nur auf stderr steht und der Stage trotzdem Erfolg meldet. Die Ableitung selbst funktioniert (`scripts/plan-touched-files.sh` liefert gegen die reale Datei die vollständige Liste). `stage-plan` ist idempotent und vereinigt `touched_files` in SQL, ein späterer Zweitaufruf ist also unschädlich — die richtige Reihenfolge erspart ihn nur.
### Schritt 5: Commit & Push, dann stagen — dann STOPP
**Pre-Commit Guard (PFLICHT — Schritt 5) [T001268]:**
Bevor der plan-stage Commit läuft, MUSS der Operator `plan-preflight.sh` aufrufen. Das Skript bündelt die drei Checks, die hier dokumentiert sind, in einen Aufruf — die Umsetzung steht im Skript und in `docs/agent-guide/registry/plan-guards.yaml`, hier bleibt der Vertrag, den der Operator nachvollziehen können muss:

1. **Do not commit on main / Nicht auf main committen:** Plan-stage Commits auf `main` sind verboten — die Guards verweigern sie. Nur ein Worktree-Branch ist zulässig.
2. **Staged-Set-Pflicht / Nur Plan-Artefakte stagen [T005114]:** der Guard wertet `git diff --cached --name-only` aus; erlaubt sind Pfade unter `tests/` und `openspec/changes/` sowie exakt `website/src/data/openspec-status.json` und `website/src/data/test-inventory.json`. Andere gestagte Dateien brechen den Guard ab (Abhilfe: `git restore --staged <pfad>` und nur Plan-Artefakte stagen). Unstaged/untracked wird nicht mehr geprüft — für den Commit zählt nur das Staged-Set.
3. **Branch stimmt mit dem agent-lock-Claim überein (T003102 — akzeptiert ticket- UND branch-scoped Claims):** geprüft wird `agent-locks/ticket__${TICKET_EXT_ID}.json`, Fallback `agent-locks/branch__${BRANCH_SLUG}.json`; fehlt auch der (`[ -f "$LOCK_FILE" ]` schlägt fehl — kein ticket-scoped agent-lock), bricht der Guard ab.

```bash
bash scripts/plan-preflight.sh pre-commit --ticket "$TICKET_EXT_ID"
# rc=0 = alle Checks grün · rc=1 = Guard verletzt · rc=2 = Umgebungsfehler
```

Erst nach diesem Check darf `git commit` und `git push` laufen. Damit verweigern wir stale plan-stage commits auf `main`.
```bash
# Sicherheitscheck: Branch-Guard [T000321]
git add openspec/changes/<slug>/
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)

# ERST JETZT stagen [T002673] — stage-plan liest den Plan aus dem Branch-Commit,
# vorher stünde dort noch das propose-Skeleton und touched_files bliebe leer.
# Seit T003267 bricht stage-plan bei leerer touched_files-Ableitung hart ab (Exit 1)
# statt still zu melden; Override: --allow-empty-touched.
# --hold ist Pflicht: ohne --hold ODER --no-hold beendet sich stage-plan mit Exit 1.
# --partials N = Anzahl der Partials aus dem `## Partials`-Manifest (1..9, Pflicht).
bash scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "$(git branch --show-current)" \
  --plan "openspec/changes/<slug>/tasks.md" \
  --partials <N> --hold
```
### Schritt 6: Optionaler Plan-Review (interaktiv)
Bevor du den Plan committest und Ausführungsoptionen anzeigst, kannst du den Plan annotierbar rendern (`bash scripts/plan-review/plan-review.sh render openspec/changes/<slug>/tasks.md`) und im Browser reviewen. Details: [plan-review-ui](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-review-ui.md).
**STOPP.** Branch, Spec und Plan sind committed und gepusht. Nächster Schritt: `dev-flow-execute` aufrufen. Ticket ist per `execution_released=false` vom Factory-Dispatch zurückgehalten, bis `dev-flow-execute` es mit `release-hold` freigibt.

## Fix-Pfad

Ein Fix braucht **zwingend einen failing Test**, bevor der Plan geschrieben wird — Rot-Grün ist
hier harte Voraussetzung, nicht Stilfrage. Der Test gehört nach `tests/spec/<spec-slug>.bats`
(die Spec aus `openspec/specs/`), nicht in eine neue ticket-nummerierte Datei.

> **Externe Abhängigkeiten schon in der Rotphase absichern [T002820]:** Setzt der failing Test ein
> externes Binary oder einen externen Dienst voraus (Drittanbieter-CLI, erreichbarer Cluster,
> laufende DB), gehört der Verfügbarkeits-Guard **in die Rotphase** — nicht erst in die Grünphase:
> ```bash
> command -v <binary> >/dev/null 2>&1 || skip "<binary> binary not installed"
> ```
> Etabliertes Muster im Repo: `tests/spec/sealed-secret-cluster-drift.bats`. Vor dem Schreiben des
> Tests prüfen, ob CI die Abhängigkeit überhaupt einrichtet — `grep -rn '<binary>'
> .github/workflows/`; **0 Treffer heißt: in CI nicht vorhanden**. Ohne Guard ist der Test in CI
> dauerhaft rot und misst die Ausstattung des Runners statt den Zustand des Codes. Genau das
> zerstört den Zweck der Rotphase: „rot, weil Implementierung fehlt" und „rot, weil das Binary
> fehlt" sind in der CI-Ausgabe nicht zu unterscheiden. Beide Richtungen verifizieren — mit dem
> Binary im PATH läuft der Test, mit `PATH=/usr/bin:/bin` skippt er sauber.

Schritte 1–5 im Detail (Ticket anlegen, Worktree, Claims, Lavish-Board, Brainstorming mit
Root-Cause-Fokus, failing Test, Plan, `stage-plan`, Commit):
[dev-flow-plan-phases](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-plan-phases.md) §Fix-Pfad.

**Bug-Triage: Ursachen-Verifikation vor Brainstorming [T002448-M5]:** Eine Bug-Beschreibung enthält oft Symptome und Hypothesen über die Ursache in einem Satz. Vor dem Brainstorming MUSS unterschieden werden: was ist beobachtetes Symptom (Fakt, reproduzierbar) und was ist Annahme über die Ursache (Hypothese, zu verifizieren). Brainstorming und Lösungsdesign dürfen nicht auf einer ungeprüften Hypothese aufbauen — die Ursache MUSS vor dem Schritt "Lösung entwerfen" mit einem minimalen Reproducer oder Log-Evidenz belegt werden. Diese Trennung (Symptom vs. Hypothese) gehört ins Proposal. English: verify the bug cause during triage — distinguish observed symptom from assumed root cause, and validate the cause with evidence (minimal reproducer or log) before designing the solution.

Der abschließende Stage-Commit des Fix-Pfads:

```bash
git add tests/ openspec/changes/<slug>/tasks.md
git commit -m "chore(plans): add failing test + stage plan [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

> **Commit-Titel-Konvention für Plan-Stage-Commits:** Der Stage-Commit enthält NUR den RED-Test
> und Plan-Artefakte, KEINEN Production-Code. Deshalb `chore(plans):` — **nicht** `fix(…)` /
> `feat(…)` / `refactor(…)` / `perf(…)`. Diese Präfixe wären eine Lüge, und der nachfolgende
> `dev-flow-execute`-Implementer würde dem Titel vertrauen und den eigentlichen Fix überspringen —
> exakt das ist bei T001434 passiert. Guard: `scripts/check-commit-vs-diff.sh` +
> `.githooks/commit-msg` blockieren solche Commits; Notfall-Bypass `SKIP_COMMIT_VS_DIFF=1`.

## Chore-Pfad
Ausgelagert nach `dev-flow-chore` — Chores brauchen keinen Plan und werden dort direkt ausgeführt
und gemergt. In Schritt 0 für Chores sofort `dev-flow-chore` aufrufen und hier stoppen.
## Übergabe an dev-flow-execute
**Zustand bei STOPP:**
- Branch `feature/<slug>` oder `fix/<slug>` auf Remote gepusht
- Plan `openspec/changes/<slug>/tasks.md` committed
- Ticket status = `plan_staged`
- Branch-Lock aktiv (andere Sessions sehen diesen Branch als belegt)
- **Kein PR** — der Plan-Stand ist ein gepushter Branch, nichts weiter

> **Kein fertig aussehender PR aus dem Plan-Stand [T002816]:** Ein offener PR, dessen Titel einen
> fertigen Fix ankündigt, während der Branch nur `chore: anchor branch` und `chore(plans): add
> failing test + stage plan` trägt, liest sich von außen als „kaputter Fix, Diagnose nötig" statt
> als „Plan gestagt, Implementierung ausstehend". Die roten Checks stammen dann aus der schlicht
> nicht committeten Implementierung — untracked `specs/`-Delta („missing specs/ delta dir") und
> uncommittete SSOT-Ergänzung, auf die ein BATS-Guard greppt — und in einer Queue mit mehreren PRs
> kostet das gezielt Zeit an der falschen Stelle (beobachtet an PR #3918/T002719).
> Wird aus anderem Grund dennoch früh ein PR gebraucht, dann **als Draft**
> (`gh pr create --draft`) und mit erkennbarem Titel-Präfix `[plan-only]`, damit der Zustand aus
> der PR-Liste ablesbar ist. Den regulären PR eröffnet `dev-flow-execute` nach der Implementierung.
**Nächster Schritt im Kreislauf:** `dev-flow-execute` aufrufen.  
Der Skill liest den Plan automatisch aus der DB (`FACTORY-PLAN-REF` Kommentar) — kein manuelle Pfad-Übergabe nötig.
## Verwandte Skills
| Skill | Beziehung |
|-------|-----------|
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `superpowers:brainstorming` | **IMMER** aufgerufen — Feature-Pfad Schritt 3, Fix-Pfad Schritt 2.8. Claude Code built-in; opencode: inlined in `opencode-flow-plan` |
| `superpowers:writing-plans` | Aufgerufen vom Plan-Subagenten (Schritt 3.7). Claude Code built-in; opencode: inlined in `opencode-flow-plan` |
| `dev-flow-execute` | **Nachfolger im Kreislauf** — implementiert den erstellten Plan |
| `dev-flow-chore` | Geschwister — Chores statt Features/Fixes (direkter Kurzschluss) |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
## Nachbereitung & Mishap Report
Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).
## Framework mapping
| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
