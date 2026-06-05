---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in docs/superpowers/plans/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Schritt −1: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Synchronisiere `main` im Haupt-Repo:

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
```

---

## Schritt 0: Worktree-Konsistenz prüfen

```bash
# Branch-Guard [T000321]
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH="<feature-or-fix-branch>"
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "🛑 HALT: Branch Mismatch! Eine parallele Session hat den Branch gewechselt."
  exit 1
fi
```

---

## Schritt 0.5: Sync mit main & Rebase

```bash
git fetch origin main
git rebase origin/main
git submodule update --init --recursive
# Falls push fehlschlägt, wende --force-with-lease an
```

---

## Schritt 1: Plan finden & Ticket ID extrahieren

Finde den neuesten Plan in `docs/superpowers/plans/*.md` und extrahiere die Ticket-ID:

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
TICKET_ID=$(awk '/^ticket_id:/{print $2; exit}' "$PLAN_FILE")
```

---

## Schritt 1.5: Ticket auf `in_progress` setzen und touched_files registrieren

Falls eine Ticket-ID vorhanden ist, setze das Ticket auf in_progress:

```bash
./scripts/ticket.sh update-status --id "$TICKET_ID" --status in_progress
```

Falls der Plan die berührten Dateien kennt, registriere sie für die Conflict-Gate (damit ein paralleler Factory-Lauf die Kollision sieht):

```bash
./scripts/ticket.sh set-touched-files --id "$TICKET_ID" --files "<comma-separated-paths>"
```

---

## Schritt 1.7: Visual & Textual Assets laden (Visual Handoff)

Falls eine Ticket-ID vorhanden ist, lade alle Anhänge (wie Screenshots, Logdateien, Mockups) herunter:

```bash
ATTACHMENT_DIR="/tmp/ticket-attachments-$TICKET_ID"
./scripts/ticket.sh get-attachments --id "$TICKET_ID" --out-dir "$ATTACHMENT_DIR"
```

**⚠️ Pflicht für UI-Arbeiten:** Lies (mit dem `Read` Tool) alle heruntergeladenen Bilddateien und Textdateien in diesem Ordner ein, um ein pixelgenaues Verständnis des UI-Designs zu erlangen. Verlasse dich nicht auf Prose allein.

---

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

Statt deinen eigenen Kontext/Modell zurückzusetzen (das ließe dich den Faden verlieren), delegiere die **gesamte Implementierung an EINEN frischen Subagenten** — sauberer Kontext per Konstruktion, **Modell + Effort passend zum Charakter der Plan-Tasks**. Du behältst den vollen Plan-Kontext und verifizierst das Ergebnis anschließend unabhängig.

Spawne über das `Agent`/`Task`-Tool einen Subagenten, **provisioniert gemäß** [subagent-provisioning.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) (Modell · Effort · Kontext):
- **Modell — nach Plan-Charakter wählen, nicht pauschal:** mechanisch (Config/Doku/Single-File) → `haiku`; Standard-Feature/Fix (mehrere Dateien, klarer Plan) → `sonnet`; komplex/riskant (systemübergreifend, Architektur, Security, DB-/Schema-Migration, Auto-Deploy) → `opus`. Im Zweifel eine Stufe höher.
- **Effort per Prompt-Direktive** (das `Agent`-Tool kennt keinen Effort-Regler): mechanisch „Arbeite zügig und fokussiert."; komplex/riskant „Ultrathink. Denke sehr gründlich nach."
- `subagent_type: general-purpose`.
- **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit):
  - Absoluter Worktree-Pfad + Branch-Name; er arbeitet NUR relativ dazu.
  - Plan-Datei `docs/superpowers/plans/<slug>.md` + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
- **Auftrag:**
  - *Feature:* Rufe `superpowers:executing-plans` (in-context, KEIN weiterer Agenten-Fan-out) + `test-driven-development` auf und arbeite den Plan vollständig ab. Aktualisiere nach jedem Meilenstein die Checkbox im Plan (`- [ ] M1` → `- [x] M1`), committe und pushe.
  - *Fix:* Verifiziere zuerst, dass ein failing Test existiert, dann nach Rot-Grün-Prinzip bis grün.
  - Bei Kompilier-/Testfehlern: starte sofort `systematic-debugging`.
  - Falls Delegations-Tools `finishing-a-development-branch` aufrufen: Menü mit `--no-menu` / `MENU=skip` unterdrücken.
  - Erstelle KEINEN PR und merge nicht — stoppe nach grünen Tests und gib eine Zusammenfassung zurück (geänderte Dateien, Test-Status, offene Punkte).

Nimm das Ergebnis entgegen und mach bei Schritt 3 (unabhängige Verifikation) weiter.

---

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf, um die Verifikation strukturiert zu steuern.

```bash
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX>
task test:all
```

Siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm Gotchas in Worktrees.

---

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

---

## Schritt 3.8: Code Review Gate (Mandatory)

Vor dem PR-Merge muss eine unabhängige Überprüfung stattfinden.
1. Rufe das Skill **`requesting-code-review`** (oder `pr-review-toolkit:review-pr` bzw. einen Review-Subagenten) auf, um die Änderungen zu auditieren.
2. Behebe alle gefundenen Probleme und stelle sicher, dass der Reviewer "Approved" gibt, bevor du fortfährst.

---

## Schritt 4: Dev-Iteration (optional)

Rufe `dev-flow-iterate` auf, um Änderungen im dev-Cluster zu testen.

---

## Schritt 5: PR erstellen

```bash
# Branch-Guard prüfen
git add -A
git commit -m "<type>(<scope>): <subject>" # commitlint regeln beachten (<100 Zeichen body)
# Closes T000XXX im Body bei Fixes
```

Rufe `commit-commands:commit-push-pr` auf (oder führe `gh pr create` manuell aus).

---

## Schritt 6: Auto-Merge wenn CI grün

```bash
# Prüfe CI-Status (siehe gotchas [T000342])
# Merge PR aus dem Haupt-Repo, um Konflikte zu vermeiden
(cd "$MAIN_REPO" && gh pr merge --squash --delete-branch)
```

---

## Schritt 6.5: Ticket abschließen

Falls eine Ticket-ID vorhanden ist, schließe das Ticket:

```bash
RESOLUTION="shipped" # oder "fixed" bei Fixes
PR_NUM=$(gh pr view --json number -q '.number')

./scripts/ticket.sh update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
./scripts/ticket.sh add-comment --id "$TICKET_ID" --body "PR #$PR_NUM merged. Plan archived to tickets.ticket_plans."
```

---

## Schritt 7: Plan archivieren & Datei löschen

Übertrage den Plan in die Datenbank und lösche die lokale Datei:

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"

# Plan lokal löschen und Änderungen via PR committen
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"

# Archiver-Branch anlegen und mergen (wegen Branch-Protection)
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"
git push -u origin "$ARCHIVE_BRANCH"
gh pr create --title "chore(plans): archive $SLUG → postgres [$TICKET_ID]" --base main
gh pr merge --squash --delete-branch
```

---

## Schritt 7.5: Worktree & Branch bereinigen

Lösche den lokalen Worktree und Branch (im Haupt-Repo ausführen):

```bash
cd /home/patrick/Bachelorprojekt
git worktree remove "/tmp/wt-<slug>" --force
git branch -D "<branch>"
```

---

## Schritt 8: Post-Merge Deploy & Verify

Deployment ausführen basierend auf den geänderten Dateien:
- Astro/Website: `task feature:website`
- Brett: `task feature:brett`
- K8s/Manifeste: `task feature:deploy`

Führe danach `dev-flow-e2e` aus, um E2E Tests gegen die Live-Umgebung zu schreiben.

---


## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Voraussetzung — liefert den Implementierungsplan |
| `dev-flow-iterate` | Alternative — inkrementelle Dev-Iteration |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).