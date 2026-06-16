---
name: dev-flow-plan
description: Use to choose the development path (feature/fix/chore), run brainstorming, and generate a design spec and implementation plan.
---

# dev-flow-plan — Pfad-Wahl, Brainstorming & Plan

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will.

**Sage zu Beginn:** "Ich nutze dev-flow-plan für Pfad-Wahl und Planung."

---

## Schritt −3: Deep Grilling (optional)

Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session (siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für den Fragenkatalog).
Falls durchgeführt, erstelle das Grilling-Ticket mit dem CLI-Helper:

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

Räume tote Sessions/Zombies/stale Worktrees auf und sieh, wer gerade was bearbeitet (Session-Koordination [T000510]):
```bash
bash scripts/agent-lock.sh reap   # killt cwd-tote-Worktree-Prozesse, prunet Worktrees, räumt tote Locks
bash scripts/agent-lock.sh list   # "Wer macht was": laufende Claims anderer Sessions
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

---

## Feature-Pfad

### Schritt 1: Worktree anlegen
Erstelle einen neuen Worktree für den Feature-Branch (niemals `.claude/worktrees/` verwenden!):
```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
# Doppelarbeit verhindern: Branch claimen (Session-Koordination [T000510]).
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "$PWD" --label dev-flow-plan \
  || { echo "🛑 Branch wird bereits von einer anderen Session bearbeitet — koordinieren oder anderen slug wählen."; exit 1; }
```

### Schritt 1.5: Optionale Asset-Sammlung
Frage den User aktiv nach Spec-Notizen, Mockups oder Screenshots. Lese Text- und Image-Dateien mit dem `Read` Tool ein, um sie in den Kontext zu laden.

### Schritt 1.6: Codebase-Exploration
Verwende einen Code-Explorer Subagenten, um die Code-Pfade und Architektur vor dem Brainstorming zu analysieren.

### Schritt 1.7: Design-Bundle co-lokalisieren (nur Design-/UI-Tickets)

Wenn das Ticket einen Design-Handoff hat (claude.ai-Design-Session → Bundle-ID), ziehe das Bundle **direkt neben den Plan** in den Branch, damit sowohl `dev-flow-execute` als auch die Factory (liest den Branch via `git show` + Reuse-Worktree) Intent **und** Assets auf Platte haben. Andernfalls überspringe diesen Schritt.

```bash
SLUG="<slug>"
DESIGN_DIR="docs/superpowers/plans/assets/${SLUG}"
mkdir -p "${DESIGN_DIR}/new"

# 1. Bundle in new/ synchronisieren (DesignSync-Tool ist deferred → erst Schema laden):
#    ToolSearch select:DesignSync  →  dann /design-sync mit Ziel ${DESIGN_DIR}/new
#    (Bundle-ID vom User; .tar.gz: chats/chat1.md = Intent, project/ = SVGs)

# 2. Intent extrahieren:  cp <bundle>/chats/chat1.md "${DESIGN_DIR}/intent.md"
```

**Qualitäts-Gate — nur passende Assets co-lokalisieren** (aus T000756): jedes synchronisierte
SVG vor dem Ablegen prüfen und **unpassende verwerfen** (NICHT mit in `new/` aufnehmen):
`currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
und **Export-Vollständigkeit** (Anzahl gelieferter Dateien vs. im Intent spezifizierte).
Alt-Assets werden **nicht** mitkopiert — der Abgleich passiert in-place gegen die echte
Repo-Datei (`git diff` / `Read` der Live-Datei) erst beim Verbauen, nicht als Plan-Ballast.

Zusätzlich die Schlüsseldateien ans Ticket hängen (autonome Factory-Design-Phase materialisiert
Attachments nach `assets-inbox/`):
```bash
bash scripts/ticket-attach.sh "$TICKET_UUID" "${DESIGN_DIR}/intent.md" "${DESIGN_DIR}"/new/*.svg
```

### Schritt 2: Brainstorming Visual Companion Tunnel
Starte den Companion-Server und Tunnel. Detaillierte Befehle und Fehlerbehebungen findest du in [brainstorm-tunnel-setup.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/brainstorm-tunnel-setup.md).
```bash
# Lese die Anleitung und führe sie aus:
# View: .claude/skills/references/brainstorm-tunnel-setup.md
```

### Schritt 3: Brainstorming
Rufe `superpowers:brainstorming` auf. Nutze das visual Board auf `https://brainstorm.dev.mentolder.de`.
Ergebnis: Spec-Datei in `docs/superpowers/specs/<date>-<slug>-design.md`.
Nach dem Schreiben der Spec das Frontmatter setzen (siehe
`docs/superpowers/specs/spec-frontmatter-standard.md`):
`bash scripts/plan-frontmatter-hook.sh --spec docs/superpowers/specs/<date>-<slug>-design.md`
und `ticket_id`/`plan_ref` ausfüllen sobald Ticket-ID und Plan-Pfad feststehen.

### Schritt 3.5: Playwright-Projekt-Gate
Falls neue E2E-Tests geplant sind, weise das passende Playwright-Projekt zu (siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für Zuordnungstabelle).

### Schritt 3.7: Plan-Erstellung an einen passend provisionierten Subagenten delegieren
Statt deinen eigenen Kontext zurückzusetzen (das ließe dich den Faden verlieren), committe die Spec und delegiere das Plan-Schreiben an einen **frischen Subagenten** — der hat per Konstruktion einen sauberen Kontext und bekommt ein **zur Plan-Komplexität passendes Modell + Effort**. Du selbst behältst den vollen Brainstorming-Kontext.

1. Committe und pushe die Spec-Datei auf den Feature-Branch.
2. Spawne über das `Agent`/`Task`-Tool einen Subagenten, **provisioniert gemäß** [subagent-provisioning.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) (Modell · Effort · Kontext):
   - **Modell:** Plan-Schreiben ist reasoning-lastige Meta-Arbeit → Default `model: opus`. Bei trivialem (chore-artigem) Plan genügt `sonnet`.
   - **Effort:** Default high — beginne den Prompt mit „Ultrathink. Denke sehr gründlich nach." (das `Agent`-Tool kennt nur `model`, keinen Effort-Regler — Effort wird im Prompt vermittelt). **Bei großen multi-subsystem-Specs → ultra:** statt eines Einzel-Agenten das `Workflow`-Tool nutzen (parallele Plan-Segment-Autoren gegen einen geteilten Interface-Contract + abschließende Self-Review), siehe Rubrik.
   - `subagent_type: general-purpose`.
   - **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit):
     - Absoluter Worktree-Pfad (`pwd`) + Branch-Name; er arbeitet NUR relativ dazu.
     - Spec-Pfad: `docs/superpowers/specs/<date>-<slug>-design.md`
     - **Design-Bundle** (falls Schritt 1.7 lief): `docs/superpowers/plans/assets/<slug>/` —
       der Plan MUSS `intent.md` als Design-Quelle referenzieren, die finalen Asset-Zielpfade
       (z. B. unter `website/src/...`) in die Task-`target_files` aufnehmen und die T000756-
       Guardrails (currentColor statt `<img>`, keine Stray-Hex, Export-Vollständigkeit) als
       Acceptance-Kriterien notieren. `new/` enthält nur geprüfte, passende Assets.
     - Ticket-/Grilling-Kontext (`$GRILLING_TICKET_EXT_ID` etc.), falls vorhanden.
     - **CI-/Quality-Gates:** [plan-quality-gates.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md) — der Subagent MUSS die Datei lesen und den Plan dagegen schreiben: pro zu ändernder Datei `wc -l` UND den Baseline-Wert (`jq -r '."S1:<pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json`) ermitteln und das S1-Budget gegen die **wirksame Schwelle** notieren — bei schon gebaselineten (gewachsenen) Dateien ist das Budget oft **0** (jede Netto-Zeile trippt das CI-Ratchet), dann zeilenneutral planen oder die Datei in dieser PR **echt verkleinern**; bei >~80 % der Schwelle echten Modul-Split einplanen (kein kosmetisches Zusammenziehen). Dazu: keine Brand-Domain-Literale in Code-Snippets (S3), Helper als pure Module ohne Import-Zyklen (S2), neue Manifeste/Skripte referenzieren statt verwaisen lassen (S4).
   - **Auftrag:** „Lies die Spec UND `.claude/skills/references/plan-quality-gates.md`. Rufe `superpowers:writing-plans` auf und schreibe den Implementierungsplan nach `docs/superpowers/plans/<date>-<slug>.md`. Der finale Verifikations-Task des Plans MUSS `task test:changed`, `task freshness:regenerate` und `task freshness:check` als Steps enthalten (CI-Äquivalent inkl. S1–S4-Ratchet); nach Test-Änderungen zusätzlich `task test:inventory` + Commit des Inventars. Starte KEINE Implementierung (nur Plan schreiben, dann STOPP). Führe danach `bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<date>-<slug>.md` aus. Gib den Plan-Pfad und eine 3-Zeilen-Zusammenfassung zurück."

### Schritt 3.8: Plan-Qualitäts-Check (DeepSeek QA)

Führe den automatischen QA-Check auf den Plan-Pfad aus, den der Subagent zurückgegeben hat:

```bash
bash scripts/plan-qa-check.sh docs/superpowers/plans/<date>-<slug>.md
```

- **PASS (Exit 0):** Weiter zu Schritt 4.
- **FAIL (Exit 1):** DeepSeek hat bis zu 2 Auto-Fix-Versuche unternommen. Lies die
  Fehlermeldung (konkrete Lücken), delegiere erneut an einen Plan-Subagenten (Schritt 3.7)
  mit den fehlenden Punkten als Korrektur-Hinweis — oder bessere den Plan manuell nach.
- **Kein API-Key (Exit 0 + Warnung):** Advisory — QA wurde übersprungen. Weiter zu Schritt 4,
  aber prüfe den Plan manuell gegen `.claude/skills/references/plan-quality-gates.md`.

### Schritt 4: Plan prüfen & übernehmen
Du behältst deinen vollen Brainstorming-Kontext: lies den vom Subagenten zurückgegebenen Plan und prüfe ihn gegen die im Brainstorming getroffenen Entscheidungen. Prüfe zusätzlich die Gate-Konformität (Checkliste in [plan-quality-gates.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)): S1-Budgets gegen die **wirksame Schwelle** (Baseline-Wert falls gebaselined, sonst Limit) pro Datei notiert — und bei Budget≈0 ein echter Verkleinerungs-/Split-Schritt statt kosmetischem Zusammenziehen? Finaler Verifikations-Task enthält `task test:changed` + `task freshness:regenerate` + `task freshness:check`? Keine Brand-Domain-Literale in den Code-Snippets? Bei Lücken oder Abweichungen delegiere erneut (Schritt 3.7) mit konkreten Korrektur-Hinweisen. Erst wenn der Plan passt, weiter zu Schritt 4.5.

### Schritt 4.5: Ticket anlegen oder wiederverwenden

Prüfe ob ein bestehendes Ticket-ID übergeben wurde (z.B. von `feature-intake`):

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
    --description "Branch: feature/<slug>"$'\n'"Plan: docs/superpowers/plans/<date>-<slug>.md"$'\n'"Spec: docs/superpowers/specs/<date>-<slug>-design.md"$GRILLING_REF)

  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
else
  # Bestehendes Ticket wiederverwenden — UUID für Attachments holen
  TICKET_UUID=$(./scripts/ticket.sh get --id "$TICKET_EXT_ID" | jq -r '.id')
  echo "✅ Wiederverwende bestehendes Ticket $TICKET_EXT_ID"
fi

sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" docs/superpowers/plans/<date>-<slug>.md

# Plan in die Kommissionierung stellen: type=feature, status=plan_staged.
# Read-only sichtbar in /dev-status; wartet auf manuelle Freigabe (-> Factory / -> Manuell).
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "docs/superpowers/plans/<date>-<slug>.md"

bash scripts/plan-frontmatter-hook.sh --activate "docs/superpowers/plans/<date>-<slug>.md"
```

Hänge gesammelte Assets mit `bash scripts/ticket-attach.sh "$TICKET_UUID" <pfade>` an.

### Schritt 5: Commit & Push — dann STOPP
```bash
# Sicherheitscheck: Branch-Guard [T000321]
git add docs/superpowers/plans/<date>-<slug>.md
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

### Schritt 6: Batch-Status prüfen und Ausführungsoptionen anzeigen

Prüfe ob weitere Pläne in der Kommissionierung warten und zeige dem User die Batch-Ausführungsoptionen:

```bash
# Alle staged plans abrufen (status=plan_staged)
STAGED_PLANS=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
   array_to_string(areas,','), COALESCE(depends_on::text,'{}')
   FROM tickets.tickets WHERE status='plan_staged'
   ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)

STAGED_COUNT=$(echo "$STAGED_PLANS" | grep -c '|' || echo 0)

# Alle planning tickets (noch nicht geplant)
PLANNING_COUNT=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -c \
  "SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';" 2>/dev/null)
```

**STOPP.** Informiere den User über den aktuellen Plan-Status und die Batch-Ausführungsoptionen:

```
✅ Plan bereit: <slug> (Ticket $TICKET_EXT_ID)
   Branch: feature/<slug>
   Plan: docs/superpowers/plans/<date>-<slug>.md

📋 Kommissionierung (status=plan_staged): $STAGED_COUNT Plan(s)
   • T000xxx [priorität] <titel> — <value_prop>
   • T000yyy [priorität] <titel> — <value_prop>
   ...

📝 Planungsbüro (status=planning): $PLANNING_COUNT Ticket(s) warten auf Planung

🚀 Ausführungsoptionen:

1. **Einzel-Ausführung (Manuell):**
   dev-flow-execute auf feature/<slug> aufrufen
   → Implementiert nur diesen einen Plan

2. **Einzel-Ausführung (Factory):**
   bash scripts/ticket.sh enqueue --id "$TICKET_EXT_ID" \
     --branch "feature/<slug>" --plan "docs/superpowers/plans/<date>-<slug>.md"
   → Factory-Dispatcher arbeitet den Plan automatisch ab

3. **Batch-Ausführung (alle staged plans):**
   Wenn mehrere Pläne bereit sind, können sie parallel via Factory implementiert werden:
   - UI: In /dev-status alle staged plans auswählen → "→ Factory (Batch)"
   - CLI: Für jeden staged plan:
     bash scripts/ticket.sh enqueue --id <ext_id> --branch <branch> --plan <plan>
   → Factory-Dispatcher verarbeitet alle Pläne parallel (Plan-Reuse, kein Neu-Planen)

4. **Batch-Ausführung (mit dev-flow-batch):**
   Wenn weitere planning-Tickets existieren und du erst alle planen willst:
   dev-flow-batch aufrufen → plant alle status=planning Tickets parallel
   → Danach alle fertigen Pläne via Option 3 an Factory übergeben
```

**Empfehlung:** Wenn nur dieser eine Plan fertig ist → Option 2 (Factory einzeln). Wenn mehrere Pläne fertig sind → Option 3 (Batch via Factory). Wenn noch planning-Tickets warten → Option 4 (erst dev-flow-batch, dann Factory).

STOPP danach.

---

## Fix-Pfad

### Schritt 1: T-###### Ticket
Frage den User nach der Ticket-ID. Falls keins vorhanden ist, lege ein neues Ticket an:
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

### Schritt 3: Failing Test schreiben
Schreibe einen automatisierten Test, der den Bug reproduziert und fehlschlägt (PASS/FAIL rot-grün Prinzip). Dies ist eine **harte Voraussetzung** für den Fix-Pfad.

### Schritt 4: Plan schreiben
Rufe `superpowers:writing-plans` auf. Wende das Frontmatter an und trage die Ticket-ID ein. Committe und pushe den Plan.

### Schritt 4.5: Plan stagen + Frontmatter aktivieren (Fix 6)
```bash
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "fix/<slug>" \
  --plan "docs/superpowers/plans/<date>-<slug>.md"

bash scripts/plan-frontmatter-hook.sh --activate "docs/superpowers/plans/<date>-<slug>.md"
```
Damit ist das Fix-Ticket in der Kommissionierung sichtbar und kann via UI-Knopf oder
`ticket.sh enqueue` an die Factory übergeben werden.

### Schritt 5: Commit & Push

Füge den failing Test und den Plan hinzu, committe und pushe auf den fix Branch:
```bash
git add tests/ docs/superpowers/plans/<date>-<slug>.md
git commit -m "fix(<scope>): add failing test + stage plan [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

### Schritt 6: Batch-Status prüfen und Ausführungsoptionen anzeigen

```bash
STAGED_PLANS=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
   array_to_string(areas,',')
   FROM tickets.tickets WHERE status='plan_staged'
   ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)

STAGED_COUNT=$(echo "$STAGED_PLANS" | grep -c '|' || echo 0)

PLANNING_COUNT=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -c \
  "SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';" 2>/dev/null)
```

**STOPP.** Informiere den User:

```
✅ Fix-Plan bereit: <slug> (Ticket $TICKET_EXT_ID)
   Branch: fix/<slug>
   Plan: docs/superpowers/plans/<date>-<slug>.md

📋 Kommissionierung (status=plan_staged): $STAGED_COUNT Plan(s)
   • T000xxx [priorität] <titel> — <value_prop>
   ...

📝 Planungsbüro (status=planning): $PLANNING_COUNT Ticket(s) warten auf Planung

🚀 Ausführungsoptionen:

1. **Einzel-Ausführung (Manuell):**
   dev-flow-execute auf fix/<slug> aufrufen

2. **Einzel-Ausführung (Factory):**
   bash scripts/ticket.sh enqueue --id "$TICKET_EXT_ID" \
     --branch "fix/<slug>" --plan "docs/superpowers/plans/<date>-<slug>.md"

3. **Batch-Ausführung (alle staged plans):**
   Wenn mehrere Pläne bereit sind, können sie parallel via Factory implementiert werden.
```

STOPP danach.

---

## Chore-Pfad

Ausgelagert nach `dev-flow-chore` — Chores brauchen keinen Plan und werden dort direkt ausgeführt
und gemergt. In Schritt 0 für Chores sofort `dev-flow-chore` aufrufen und hier stoppen.

---


## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `superpowers:brainstorming` | Aufgerufen in Schritt 3 — Intent/Design klären |
| `superpowers:writing-plans` | Aufgerufen vom Plan-Subagenten (Schritt 3.7) |
| `dev-flow-execute` | Folge — implementiert den erstellten Plan |
| `dev-flow-chore` | Geschwister — Chores statt Features/Fixes |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).