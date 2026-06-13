---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-13
---

# Dev-Flow Tracking Improvements

**Datum:** 2026-06-13  
**Branch:** feature/devflow-tracking-improvements  
**Scope:** Alle 9 identifizierten Tracking-Lücken im Entwicklungsprozess (Plan-Erstellung bis Feature-Abschluss)

---

## Problem

Die Code-Explorer-Analyse hat 9 konkrete Lücken identifiziert, die dazu führen dass Informationen im Entwicklungsprozess verloren gehen:

1. PR-Nummern nie in `ticket_links` geschrieben → Shipped-Tab zeigt immer `null`
2. `qa_review` ist ein Status ohne automatischen Ausgang → Tickets akkumulieren sich unsichtbar
3. `plan-frontmatter-hook.sh` schreibt falschen Status → aktive Pläne für `plan-context.sh` unsichtbar
4. ~20 Archive-Pläne haben `status: active` → Kontext-Rausch in Agent-Prompts
5. `mishap-tracker.sh` ist ein 8-Zeilen-Stub → Prozess-Friktionen werden nicht erfasst
6. Fix-Pfad ruft kein `stage-plan` auf → Fix-Tickets nicht in Kommissionierung sichtbar
7. Specs ohne maschinenlesbare Frontmatter-Referenzen → Spec↔Plan↔Ticket-Verbindung nur durch Namenskonvention
8. `cleanup.sh` ohne `trap EXIT` → Worktrees bleiben nach Factory-Crash zurück
9. Chores ohne Ticket → kein Audit-Trail für Wartungsarbeiten

---

## Kein Schema-Change

Alle Fixes sind rein script-, workflow- und skill-seitig. `ticket_links` und `ticket_comments` existieren bereits in der DB — die Lücken entstanden nur weil Scripts nie in diese Tabellen schrieben.

---

## Fix 1: PR-Tracking in ticket_links

### Problem
`factory-floor.ts` `getShipped()` liest PR-Nummern aus `ticket_links WHERE kind='pr'`. Kein Script schreibt je einen solchen Eintrag → `prNumber` im Shipped-Tab ist immer `null`.

### Lösung
`scripts/ticket.sh` bekommt neuen Subcommand:

```bash
./scripts/ticket.sh add-pr-link --id T000XXX --pr 1234
```

Schreibt:
```sql
INSERT INTO ticket_links (ticket_id, kind, ref, url)
VALUES (<uuid>, 'pr', '1234', 'https://github.com/Paddione/Bachelorprojekt/pull/1234')
ON CONFLICT DO NOTHING;
```

**Aufrufer:**
- `scripts/factory/pipeline.js`: direkt nach `gh pr create` (Deploy-Phase)
- `.claude/skills/dev-flow-execute/SKILL.md`: Schritt 6 nach PR-Erstellung

---

## Fix 2: qa_review → done via CI

### Problem
Kein automatischer Übergang von `qa_review` nach `done`. Tickets akkumulieren sich nach dem Merge ohne Sichtbarkeit (kein QA-Tab in DevStatusTabs).

### Lösung
Neues GitHub Actions Workflow `.github/workflows/post-merge.yml`:

```yaml
name: post-merge
on:
  push:
    branches: [main]
jobs:
  close-ticket:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Extract ticket-id and close
        run: |
          TICKET_ID=$(git log -1 --pretty=%s | grep -oE 'T[0-9]{6}' | head -1)
          if [[ -z "$TICKET_ID" ]]; then exit 0; fi
          # kubectl exec in shared-db → ticket.sh update-status
          # (analog zu bestehenden CI-Steps mit DB-Zugriff)
          bash scripts/ticket.sh update-status --id "$TICKET_ID" --status done
        env:
          KUBECONFIG: ${{ secrets.FLEET_KUBECONFIG }}
```

**Edge-cases:**
- Branch ohne Ticket-ID → `exit 0` (kein Fail)
- Chore-Tickets haben nach Fix 9 bereits Status `done` → `update-status` ist idempotent
- Benötigt `FLEET_KUBECONFIG` Secret in GitHub Actions (bereits vorhanden, genutzt von `build-website.yml`)

---

## Fix 3: plan-frontmatter-hook.sh schreibt status:active

### Problem
`plan-context.sh` filtert auf `status: active` im Plan-Frontmatter. `stage-plan` setzt in der DB `plan_staged`, aber `plan-frontmatter-hook.sh` schreibt keinen `status`-Wert → aktive Pläne unsichtbar für Agent-Kontext-Injektion.

### Lösung
`scripts/plan-frontmatter-hook.sh` ergänzt oder überschreibt das `status`-Feld:

```bash
# Nach dem Aufruf von stage-plan: setze status:active im Frontmatter
sed -i 's/^status: .*$/status: active/' "$PLAN_FILE"
# Falls kein status-Feld vorhanden: einfügen nach ticket_id-Zeile
```

Neues Mapping:
- Frontmatter `status: active` = DB `plan_staged` oder `backlog` oder `in_progress` (Plan ist aktiv)
- Frontmatter `status: completed` = DB `done` oder `archived` (Plan abgeschlossen)

**Abschluss-Pfad:** `dev-flow-execute` Schritt 7 (`archive-plan`) setzt **vor** dem `git rm` das Frontmatter auf `status: completed`. Damit akkumulieren sich zukünftige Pläne nach dem Archivieren nicht wieder als `active` in `docs/superpowers/plans/archive/` (Fix 4 ist einmalig; dieser Schritt verhindert das Wiederauftreten).

---

## Fix 4: Archive-Pläne batch-bereinigen

### Problem
~20+ Pläne in `docs/superpowers/plans/archive/` haben `status: active` → `plan-context.sh` injiziert sie in jeden Agent-Prompt als ob sie aktive Arbeit wären.

### Lösung
Neues einmaliges Skript `scripts/fix-archive-plan-status.sh`:

```bash
#!/usr/bin/env bash
# Einmalig ausführen, Ergebnis committen
find docs/superpowers/plans/archive/ -name "*.md" \
  | xargs grep -l "^status: active" \
  | while read f; do
      sed -i 's/^status: active$/status: completed/' "$f"
      echo "Fixed: $f"
    done
```

Wird als Teil dieses PRs ausgeführt und die geänderten Dateien werden committed.

---

## Fix 5: Mishap-Tracker implementieren

### Problem
`scripts/hooks/mishap-tracker.sh` ist ein 8-Zeilen-Stub der nichts tut. Prozess-Friktionen werden nicht erfasst.

### Lösung
Vollständige Implementierung:

```bash
#!/usr/bin/env bash
# Usage: mishap-tracker.sh --ticket T000XXX --friction "Beschreibung" --severity minor|major|critical
# Falls kein --ticket: schreibt in .mishaps.log

TICKET_ID=""
FRICTION=""
SEVERITY="minor"

while [[ $# -gt 0 ]]; do
  case $1 in
    --ticket) TICKET_ID="$2"; shift 2 ;;
    --friction) FRICTION="$2"; shift 2 ;;
    --severity) SEVERITY="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ -n "$TICKET_ID" ]]; then
  ./scripts/ticket.sh add-comment \
    --id "$TICKET_ID" \
    --body "🔧 MISHAP [${SEVERITY}]: ${FRICTION}"
else
  echo "$(date -Iseconds) [${SEVERITY}] ${FRICTION}" >> .mishaps.log
fi
```

`.mishaps.log` ist gitignored. Skills dokumentieren den Aufruf als letzten Schritt der Nachbereitung — optional, kein harter Fail.

**Integration:**
- `dev-flow-execute`: Schritt 8 (Nachbereitung) dokumentiert den Aufruf
- `dev-flow-plan`: Abschnitt "Nachbereitung & Mishap Report" bereits vorhanden, verweist auf das Skript

---

## Fix 6: Fix-Pfad in dev-flow-plan

### Problem
Der Fix-Pfad in `dev-flow-plan` ruft kein `stage-plan` auf und kein `agent-lock.sh claim ticket` → Fix-Tickets sind in der Kommissionierung unsichtbar und können nicht an die Factory übergeben werden.

### Lösung
`dev-flow-plan/SKILL.md` Fix-Pfad erhält zwei Ergänzungen:

**Schritt 2.5** (nach Worktree-Anlage):
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "fix/<slug>" --worktree "$PWD" --label dev-flow-plan
```

**Schritt 4.5** (nach Plan-Erstellung):
```bash
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "fix/<slug>" \
  --plan "docs/superpowers/plans/<date>-<slug>.md"
```

Fix-Tickets sind damit in der Kommissionierung sichtbar und können über den UI-Knopf oder `ticket.sh enqueue` an die Factory übergeben werden.

---

## Fix 7: Spec-Frontmatter-Standard

### Problem
100+ Spec-Dateien haben kein strukturiertes Frontmatter. Die Verbindung Spec↔Plan↔Ticket ist nur durch Namenskonvention erkennbar, nicht maschinenlesbar.

### Lösung
Neue Datei `docs/superpowers/specs/spec-frontmatter-standard.md` definiert das Format:

```yaml
---
ticket_id: T000XXX        # oder null wenn kein Ticket
plan_ref: docs/superpowers/plans/YYYY-MM-DD-<slug>.md  # oder null
status: active | completed
date: YYYY-MM-DD
---
```

`plan-frontmatter-hook.sh` bekommt einen `--spec <pfad>` Modus der das Frontmatter auf neue Spec-Dateien anwendet.

`dev-flow-plan` Schritt 3 (Spec-Erstellung nach Brainstorming) erhält explizite Anweisung, das Frontmatter zu setzen.

**Retroaktive Migration: nein.** Bestehende 100+ Specs bleiben unverändert.

---

## Fix 8: Worktree-Cleanup-Härtung

### Problem
`scripts/factory/cleanup.sh` ist "best-effort" ohne `trap`. Bei Agent-Timeout bleiben Worktrees unter `/tmp/wt-sf-*` zurück. Der Watchdog resettet Ticket-Status aber nicht den Worktree.

### Lösung

**`scripts/factory/cleanup.sh`** — trap on EXIT:
```bash
cleanup() {
  [[ -n "${WORKTREE_PATH:-}" ]] && \
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
}
trap cleanup EXIT
```

**`scripts/factory/watchdog.sh`** — Zombie-Worktrees aufräumen:
Wenn ein Ticket von `in_progress` zurück auf `triage` gesetzt wird, sucht der Watchdog nach `/tmp/wt-sf-*` Verzeichnissen deren Branch-Name dem Ticket entspricht und entfernt sie:
```bash
STALE_WT=$(git worktree list --porcelain | grep -B2 "branch refs/heads/feature/$SLUG" | grep "worktree" | awk '{print $2}')
[[ -n "$STALE_WT" ]] && git worktree remove "$STALE_WT" --force 2>/dev/null || true
```

Beide Fixes sind idempotent.

---

## Fix 9: Chore-Audit-Trail

### Problem
`dev-flow-chore` legt kein Ticket an → keine Sichtbarkeit in `/dev-status`, kein Audit-Trail für Wartungsarbeiten.

### Lösung
`dev-flow-chore/SKILL.md` legt nach dem Branch-Claim ein minimales Ticket an:

```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "chore: <slug>" \
  --status done \
  --description "Branch: chore/<slug>"$'\n'"Kein Plan — direktes Chore.")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```

Die Ticket-ID wird in die Commit-Message eingebettet: `chore(<scope>): <titel> [T000XXX]`. Der `post-merge.yml` CI-Step findet sie, prüft den Status (bereits `done`) und macht nichts weiter.

Kein stage-plan, kein Planungsbüro-Eintrag — nur ein `done`-Ticket als Audit-Spur.

---

## Geänderte Dateien

| Datei | Art | Beschreibung |
|-------|-----|--------------|
| `scripts/ticket.sh` | Änderung | Neuer Subcommand `add-pr-link` |
| `scripts/factory/pipeline.js` | Änderung | `add-pr-link` nach `gh pr create` |
| `scripts/factory/cleanup.sh` | Änderung | `trap cleanup EXIT` |
| `scripts/factory/watchdog.sh` | Änderung | Zombie-Worktree-Cleanup |
| `scripts/hooks/mishap-tracker.sh` | Änderung | Vollständige Implementierung |
| `scripts/plan-frontmatter-hook.sh` | Änderung | Schreibt `status:active` + `--spec`-Modus |
| `scripts/plan-context.sh` | Änderung | Sicherstellen dass `status:active`-Filter korrekt greift |
| `.claude/skills/dev-flow-plan/SKILL.md` | Änderung | Fix-Pfad: stage-plan + lock claim; Fix 7 Frontmatter-Anweisung |
| `.claude/skills/dev-flow-chore/SKILL.md` | Änderung | Minimales Ticket anlegen |
| `.claude/skills/dev-flow-execute/SKILL.md` | Änderung | Schritt 7: status:completed vor archive-plan; Schritt 6: add-pr-link |
| `.github/workflows/post-merge.yml` | Neu | qa_review → done nach PR-Merge |
| `scripts/fix-archive-plan-status.sh` | Neu | Einmaliger Batch: archive → status:completed |
| `docs/superpowers/specs/spec-frontmatter-standard.md` | Neu | Frontmatter-Standard-Dokumentation |

---

## Verifikation

```bash
task test:all
task freshness:regenerate
task freshness:check
```

Zusätzliche manuelle Prüfungen:
- `./scripts/ticket.sh add-pr-link --id T000001 --test` → row in ticket_links
- `post-merge.yml` via `act` lokal testen (Branch-Name mit T-ID)
- `plan-context.sh` nach Hook-Fix auf einem stage-plan-Ticket testen
- Archive-Batch-Skript ausführen, `git diff` prüft ~20 geänderte Dateien
- `mishap-tracker.sh --friction "Test" --severity minor` → .mishaps.log
