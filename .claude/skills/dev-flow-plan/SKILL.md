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

## Schritt −1: Stale-Worktree-Audit

Bereinige staler Worktrees von bereits gemergten Branches:
```bash
git worktree list
# Überprüfe staler Worktrees und lösche sie ggf. mit:
# git worktree remove <path> --force && git branch -D <branch>
```

---

## Schritt 0: Pfad bestimmen

Wähle einen der Pfade (Feature/Fix/Chore) basierend auf der Anfrage und kläre dies mit dem User ab.

- **feature**: Neue Funktionen oder UI-Elemente.
- **fix**: Fehlerbehebung (erfordert Ticket-ID).
- **chore**: Wartung, Doku, Dependency-Bumps (keine Verhaltensänderung).

---

## Feature-Pfad

### Schritt 1: Worktree anlegen
Erstelle einen neuen Worktree für den Feature-Branch (niemals `.claude/worktrees/` verwenden!):
```bash
git worktree add -b feature/<slug> /tmp/wt-<slug> origin/main
cd /tmp/wt-<slug> && git submodule update --init --recursive
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

### Schritt 3.5: Playwright-Projekt-Gate
Falls neue E2E-Tests geplant sind, weise das passende Playwright-Projekt zu (siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für Zuordnungstabelle).

### Schritt 3.7: Kontext-Reset + Opus (xhigh)
Bevor der Plan geschrieben wird, verringere den Kontext-Ballast:
1. Committe und pushe die Spec-Datei auf den Feature-Branch.
2. Bitte den User, die Slash-Befehle `/model claude-opus-4-8` und danach `/compact` auszuführen (weise darauf hin, dass dies User-Befehle sind und du sie nicht selbst ausführen kannst).
3. Lese nach dem Reset die Spec-Datei neu ein.

### Schritt 4: Plan schreiben
Rufe `superpowers:writing-plans` auf. **Wichtig:** Weise die Skill ausdrücklich an, die Ausführung/Implementierung noch nicht zu starten (nur Plan schreiben und STOPPEN).
Wende danach das Frontmatter-Skript an:
```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/<date>-<slug>.md
```

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
  --description "Branch: feature/<slug>"$'\n'"Plan: docs/superpowers/plans/<date>-<slug>.md"$'\n'"Spec: docs/superpowers/specs/<date>-<slug>-design.md"$GRILLING_REF)

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)

sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" docs/superpowers/plans/<date>-<slug>.md
```

Hänge gesammelte Assets mit `bash scripts/ticket-attach.sh "$TICKET_UUID" <pfade>` an.

### Schritt 5: Commit & Push — dann STOPP
```bash
# Sicherheitscheck: Branch-Guard [T000321]
git add docs/superpowers/plans/<date>-<slug>.md
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```
**STOPP.** Informiere den User, dass der Plan bereit zur Implementierung ist, und bitte ihn, `dev-flow-execute` aufzulufen.

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
git worktree add -b fix/<slug> /tmp/wt-<slug> origin/main
cd /tmp/wt-<slug> && git submodule update --init --recursive
```

### Schritt 3: Failing Test schreiben
Schreibe einen automatisierten Test, der den Bug reproduziert und fehlschlägt (PASS/FAIL rot-grün Prinzip). Dies ist eine **harte Voraussetzung** für den Fix-Pfad.

### Schritt 4: Plan schreiben
Rufe `superpowers:writing-plans` auf. Wende das Frontmatter an und trage die Ticket-ID ein. Committe und pushe den Plan.

### Schritt 5: Commit & Push — dann STOPP
Füge den failing Test und den Plan hinzu, committe und pushe auf den fix Branch.
**STOPP.** Weise den User darauf hin, `dev-flow-execute` aufzurufen.

---

## Chore-Pfad

Chores brauchen keinen Plan, sie werden direkt ausgeführt und gemergt.

### Schritt 0.5: Wiederkehrend oder einmalig?
Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, rufe `/schedule` auf und richte einen Cron-Job ein. **STOPP hier.**

### Schritt 1-7: Direkt bearbeiten und mergen
1. Kurze Beschreibung formulieren.
2. Worktree anlegen: `/tmp/wt-<slug>`.
3. Änderungen vornehmen.
4. Verifizieren (`task test:all`, `task workspace:validate` etc.).
5. Committen, pushen und PR erstellen (`commit-commands:commit-push-pr`).
6. PR mergen (`gh pr merge --squash --delete-branch`).
7. Passenden Deploy-Task aufrufen (siehe Deploy-Tabelle in [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md)).

---

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).