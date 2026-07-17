---
name: dev-flow-chore
description: Use for maintenance work with no behavior change — docs, dependency bumps, config/rename, CI tweaks, cleanup. Executes and merges inline; no separate plan or dev-flow-execute handoff.
---

# dev-flow-chore — Wartung direkt ausführen & mergen

## Wann diese Skill greift

Eine **Chore**: Wartung ohne Verhaltensänderung — Doku, Dependency-Bumps, Config/Rename, CI-Tweaks,
Aufräumen. Chores brauchen **keinen** Plan und **keinen** `dev-flow-execute`-Handoff: sie werden in
einem Rutsch erledigt und gemergt. Für Features/Fixes stattdessen `dev-flow-plan` nutzen.

**Sage zu Beginn:** "Ich nutze dev-flow-chore und führe die Wartung direkt aus."

---

## Position im Git-Kreislauf

```
    ┌────────────────────────────────────────────────────┐
    ▼                                                    │
[ main ]                                                 │
    │                                                    │
    └──► [branch] ──► [ändern + testen] ──► [PR+merge] ──► AUSSTIEG
              DIESER SKILL (Kurzschluss — kein Plan-Handoff)   │
                                                               │
                                    zurück zu [ main ] ────────┘
```

**EINSTIEG:** `main` — synchronisiert, sauberer Stand  
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Kreislauf geschlossen  
**Kurzschluss:** kein Zwischenstopp bei `dev-flow-execute` — Chores sind einzügig

---

## Schritt 0: Reaper & Pull-First

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombies/stale Worktrees/tote Locks räumen
git fetch origin main
if git diff --quiet HEAD; then git pull --rebase origin main; else git stash && git pull --rebase origin main && git stash pop; fi
```

## Schritt 0.5: Wiederkehrend oder einmalig?

Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, rufe `/schedule` auf und richte
einen Cron-Job ein. **STOPP hier.**

## Schritt 1: Worktree anlegen & claimen

> **Ticket-vor-Branch-Check (T001917):** Bevor der Branch-Slug feststeht, prüfen ob für diese
> Chore bereits ein Ticket existiert (`TICKET_EXT_ID` gesetzt oder in `./scripts/ticket.sh list`
> auffindbar?). Existiert noch keines, **zuerst das Ticket anlegen** (Block in Schritt 1 unten)
> und dessen ID sofort in den Branch-Slug aufnehmen (z.B. `chore/lighthouse-ci-token-t001913`
> statt `chore/lighthouse-ci-token`) — nicht erst nach dem Worktree. Sonst schlägt
> `preflight-pr-scope.sh` beim PR fehl (PR-Titel-Ticket-ID ≠ Branch-Name) und der Branch muss
> nachträglich umbenannt werden (Zeitverlust, siehe T001913).

> **Test-only-Kurzpfad (kein Worktree):** Berührt die Chore **ausschließlich** Testdateien
> (`tests/**/*.bats`, `tests/spec/*.bats`, `website/**/*.test.ts`, Playwright-Specs) — z.B. "schreib
> einen Test für X" — dann entfällt `.worktrees/*` als Standardfall. Ein eigener Worktree pro Testdatei
> erzeugt nur IDE-Clutter (jede offene `.worktrees/*`-Kopie erscheint als eigener Ordner) ohne
> Isolationsgewinn, solange kein anderer Prozess konkurrierend im Haupt-Checkout schreibt. Prüfe das:
> ```bash
> bash scripts/agent-lock.sh list   # leer/keine fremde main-checkout- oder branch-Claim?
> ```
> Ist die Liste leer (solo, kein konkurrierender Prozess), arbeite **inline im Haupt-Checkout**:
> ```bash
> git checkout -b chore/<slug>
> bash scripts/agent-lock.sh claim main-checkout --branch "chore/<slug>" --label dev-flow-chore
> ```
> Der `.githooks/pre-commit`-Mutex blockt konkurrierende Commits anderer Sessions währenddessen.
> Zeigt `agent-lock.sh list` eine fremde lebende Claim, oder berührt die Chore auch Nicht-Testdateien
> (Implementierung + Test zusammen) → regulärer Worktree-Pfad unten.

Regulärer Pfad (Default für alles außer dem Test-only-Kurzpfad oben):
```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh chore/<slug> .worktrees/<slug>
cd .worktrees/<slug>
bash scripts/agent-lock.sh claim branch "chore/<slug>" --worktree "$PWD" --label dev-flow-chore
```

> Enthält `<slug>` eine wiederverwendete `TICKET_EXT_ID` (z.B. `T001869`), sollte deren Ticketnummer
> im Slug vorkommen (z.B. `doc-cleanup-t001869`) — `preflight-pr-scope.sh` prüft das PR-Titel↔Branch-
> Matching case-insensitiv (T001873), Groß-/Kleinschreibung im Slug spielt also keine Rolle.

Claim-Semantik, main-checkout-Sonderfall (`claim main-checkout`) und Release:
[session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md).

Überspringe die Ticket-Erstellung, wenn bereits eine `TICKET_EXT_ID` gesetzt ist (z.B.
bei Wiederverwendung eines bestehenden Tickets). Sonst lege ein minimales Audit-Ticket
an (type=task, status=done — Chores haben keinen Plan, nur eine Audit-Spur):
```bash
if [[ -z "${TICKET_EXT_ID:-}" ]]; then
  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "chore: <slug>" \
    --status done \
    --description "Branch: chore/<slug>"$'\n'"Kein Plan — direktes Chore.")
  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
fi
```

## Schritt 2: Änderungen vornehmen

Setze die Wartung um. Bei mechanischer Arbeit über mehrere Dateien kannst du an einen passend
provisionierten Subagenten delegieren (siehe [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) — Chores sind i.d.R. `haiku`/`sonnet`, Effort low).

## Schritt 3: Verifizieren

Verify-Block ausführen (die vier Befehle, Freshness-Guard, S1-Ratchet-Erklärung) — **SSOT:**
[verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md).

> **⚠ S1-Gate-Guard (Chores ohne Plan!):** Chores haben kein Zeilenbudget-Planungsschritt.
> Berührt die Chore Code-Dateien (`.ts/.svelte/.astro/.sh/.mjs/...`), vor dem Commit den
> **Restbudget-Check** aus dem verification-block laufen lassen (`plan-lint.sh residual_budget`-
> Schleife) — bei Restbudget ≤ 0 die Datei **echt verkleinern**, nicht kosmetisch zusammenziehen.

Siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm-Gotchas in Worktrees.

## Schritt 4: Commit, Push & PR

Läuft nach **`git-workflow` Schritt 2–4** (SSOT): git-crypt-Staging-Guard [T001210]
(explizite Pathspecs, NIE `git add -A`, Secret-in-index-Guard), Commit-Verifikation
`HEAD_SHA != BASE_SHA` [T000925], `preflight-pr-scope.sh` vor `gh pr create`,
REST-Fallback für Titel-Edits.

Chore-spezifisch: Titelformat `chore(<scope>): <subject> [$TICKET_EXT_ID]`. Die
`[T000XXX]`-Referenz wird von `.github/workflows/post-merge.yml` gelesen — das Ticket ist
bereits `done`, der Status-Update ist ein idempotenter No-op.

Rufe `commit-commands:commit-push-pr` auf (Claude Code slash-command) oder führe `gh pr create` manuell aus (beide Frameworks).

## Schritt 5: Merge wenn CI grün

**`git-workflow` Schritt 5–6** (SSOT): CI-Fix-Loop bis grün, dann aus dem Haupt-Repo
`gh pr merge --auto --squash --delete-branch`.

## Schritt 6: Worktree & Branch bereinigen

**`git-workflow` Schritt 7** (SSOT): Lock-Release
([session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md)),
dann `git worktree remove .worktrees/<slug> --force && git branch -D chore/<slug>` im Haupt-Repo.

Beim Test-only-Kurzpfad (Schritt 1) gibt es keinen Worktree zu entfernen — nur
`bash scripts/agent-lock.sh release main-checkout` und `git checkout main && git branch -D chore/<slug>`.

## Schritt 7: Deploy (falls nötig)

Nur wenn die Chore deploybare Pfade berührt — Mapping in
[deploy-routing](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md) (Single Source of Truth).

---

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 6:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `.worktrees/<slug>` gelöscht, Branch `chore/<slug>` gelöscht
- Ticket status = `done` (wurde beim Anlegen bereits gesetzt)
- Branch-Lock freigegeben

**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` oder erneutem `dev-flow-chore`.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Geschwister — Features/Fixes (mit Plan + Handoff) statt Chores |
| `git-workflow` | **SSOT für Schritt 4–6** — Commit/PR/Merge/Cleanup |
| `using-git-worktrees` | Hintergrund — wird hier durch `scripts/worktree-create.sh` (git-crypt-safe) ersetzt |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende über `mishap-tracker`
(Invoke `mishap-tracker` with your accumulated MISHAP_LOG).


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

