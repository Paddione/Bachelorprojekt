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
     - Ticket-/Grilling-Kontext (`$GRILLING_TICKET_EXT_ID` etc.), falls vorhanden.
     - **CI-/Quality-Gates:** [plan-quality-gates.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md) — der Subagent MUSS die Datei lesen und den Plan dagegen schreiben: `wc -l` auf jede zu ändernde Datei und S1-Zeilenbudget im Plan notieren (bei voraussichtlich >~80 % des Limits Modul-Split einplanen), keine Brand-Domain-Literale in Code-Snippets (S3), Helper als pure Module ohne Import-Zyklen (S2), neue Manifeste/Skripte referenzieren statt verwaisen lassen (S4).
   - **Auftrag:** „Lies die Spec UND `.claude/skills/references/plan-quality-gates.md`. Rufe `superpowers:writing-plans` auf und schreibe den Implementierungsplan nach `docs/superpowers/plans/<date>-<slug>.md`. Der finale Verifikations-Task des Plans MUSS `task test:all`, `task freshness:regenerate` und `task freshness:check` als Steps enthalten (CI-Äquivalent inkl. S1–S4-Ratchet); nach Test-Änderungen zusätzlich `task test:inventory` + Commit des Inventars. Starte KEINE Implementierung (nur Plan schreiben, dann STOPP). Führe danach `bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<date>-<slug>.md` aus. Gib den Plan-Pfad und eine 3-Zeilen-Zusammenfassung zurück."

### Schritt 4: Plan prüfen & übernehmen
Du behältst deinen vollen Brainstorming-Kontext: lies den vom Subagenten zurückgegebenen Plan und prüfe ihn gegen die im Brainstorming getroffenen Entscheidungen. Prüfe zusätzlich die Gate-Konformität (Checkliste in [plan-quality-gates.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)): S1-Zeilenbudgets pro Datei notiert? Finaler Verifikations-Task enthält `task test:all` + `task freshness:regenerate` + `task freshness:check`? Keine Brand-Domain-Literale in den Code-Snippets? Bei Lücken oder Abweichungen delegiere erneut (Schritt 3.7) mit konkreten Korrektur-Hinweisen. Erst wenn der Plan passt, weiter zu Schritt 4.5.

### Schritt 4.5: Ticket anlegen
Erstelle ein Plan-Ticket in der Datenbank:
```bash
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
**STOPP.** Informiere den User, dass der Plan bereit zur Implementierung ist. Der Plan liegt jetzt in der **Kommissionierung** (`/dev-status`) und wartet dort auf manuelle Freigabe. Er hat nun folgende Optionen:
1. **-> Manuell** ausführen lassen: Bitte den User, `dev-flow-execute` auf `feature/<slug>` aufzurufen (oder den „-> Manuell"-Hinweis in der Kommissionierung).
2. **-> Factory** übergeben: In der Kommissionierung (`/dev-status`) den Knopf **-> Factory** drücken — das verschiebt das Ticket in die Laderampe (`status=backlog`); der Factory-Dispatcher arbeitet es mit **Plan-Reuse** (kein Neu-Planen) ab. Äquivalent von der CLI:
```bash
bash scripts/ticket.sh enqueue --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" --plan "docs/superpowers/plans/<date>-<slug>.md"
```
Das Ticket wird `type=feature/status=backlog` und vom Factory-Dispatcher mit **Plan-Reuse** (kein Neu-Planen) abgearbeitet. STOPP danach.

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

### Schritt 5: Commit & Push — dann STOPP
Füge den failing Test und den Plan hinzu, committe und pushe auf den fix Branch.
**STOPP.** Weise den User darauf hin, `dev-flow-execute` aufzurufen.

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