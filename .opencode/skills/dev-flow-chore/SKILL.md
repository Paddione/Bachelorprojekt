---
name: dev-flow-chore
description: 'Use for maintenance with NO behavior change — documentation, dependency bumps, config edits, renames, CI tweaks, dead-code and file cleanup. Triggers on chore, docs update, bump dependency, rename, tidy up, remove unused, CI config tweak. Executes and merges inline in one pass — no spec, no plan, no dev-flow-execute handoff. If the change alters what the software does, stop and use dev-flow-plan instead; that boundary decides the path, not the size of the diff.'
---

# dev-flow-chore — Wartung direkt ausführen & mergen

> **cwd-Regel (PFLICHT, T006367/T002357):** Git-Aufrufe immer als `git -C <worktree>` bzw. mit
> explizitem cd+guard — **nie auf implizites cwd vertrauen**. Nach dem Worktree-Wechsel tragen
> alle Read/Write/Edit-Pfade den Worktree-Präfix. Gilt für das ganze Dokument.

Der gemeinsame [Lifecycle-Vertrag](.agents/skills/references/dev-flow-lifecycle.md) besitzt hier den No-Behavior-Change-Einstieg und delegiert Git-, Verifikations- und Cleanup-Mechanik an `git-workflow` bzw. `verification-block`. Reine Playwright-Änderungen laufen als spezialisierter test-only Chore über `dev-flow-e2e`.

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

Läuft nach **`git-workflow` Schritt 0** (SSOT — dort die vollständige Sequenz inkl.
`git-stash-net.sh pop --by-message` und der Stash-Pop-Verifikation; hier keine eigene
Kopie pflegen). Nur chore-spezifisch: Bei fremder Aktivität im Haupt-Checkout wird der
lokale `main`-Sync übersprungen — `mc_foreign_activity_detected` aus
`scripts/lib/main-checkout-foreign-guard.sh` entscheidet das (T003078/T003097). Der
lokale `main`-Sync ist Hygiene, keine Korrektheitsvoraussetzung für den nachfolgenden
`worktree-create.sh`-Aufruf, der ohnehin von `origin/main` aus anlegt.

## Schritt 0.5: Wiederkehrend oder einmalig?

Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, rufe `/schedule` auf und richte
einen Cron-Job ein. **STOPP hier.**

## Schritt 1: Worktree anlegen & claimen

> **Test-only-Kurzpfad (kein Worktree):** Berührt die Chore **ausschließlich** Testdateien
> (`tests/py/**/*.py`, `components/website/**/*.test.ts`, Playwright-Specs) — z.B. "schreib
> einen Test für X" — dann entfällt der Worktree als Standardfall. Ein eigener Worktree pro Testdatei
> erzeugt nur IDE-Clutter (jede offene Worktree-Kopie erscheint als eigener Ordner) ohne
> Isolationsgewinn, solange kein anderer Prozess konkurrierend im Haupt-Checkout schreibt. Prüfe das:
> ```bash
> bash scripts/agent-lock.sh activity   # Locks + laufende Prozesse in Worktree-Pfaden [T003098] — list allein zeigt Sessions erst nach ihrem ersten Commit
> ```
> Ist die Liste leer (solo, kein konkurrierender Prozess), arbeite **inline im Haupt-Checkout**:
> ```bash
> git checkout -b chore/<slug>
> bash scripts/agent-lock.sh claim main-checkout --branch "chore/<slug>" --label dev-flow-chore
> ```
> Der `.githooks/pre-commit`-Mutex blockt konkurrierende Commits anderer Sessions währenddessen.
> Zeigt `agent-lock.sh activity` eine fremde lebende Aktivität, oder berührt die Chore auch Nicht-Testdateien
> (Implementierung + Test zusammen) → regulärer Worktree-Pfad unten.

Regulärer Pfad (Default für alles außer dem Test-only-Kurzpfad oben):
```bash
# git-crypt-safe: creates the worktree, handles git-crypt
WT="$HOME/.worktrees/Bachelorprojekt/chore/<slug>"   # globaler Agent-Guard: Worktrees nur unter ~/.worktrees
bash scripts/worktree-create.sh chore/<slug> "$WT"
cd "$WT"
bash scripts/agent-lock.sh claim branch "chore/<slug>" --worktree "$PWD" --label dev-flow-chore
```

> **Ab hier gilt die cwd-Regel oben:** Datei-Tool-Pfade tragen `$WT/...`, sonst
> trifft ein alter Hauptcheckout-Pfad still die falsche Arbeitskopie (T002350).

Claim-Semantik, main-checkout-Sonderfall (`claim main-checkout`) und Release:
[session-coordination](.agents/skills/references/session-coordination.md).

Kein Ticket: das Ticket-DB ist entfernt, Branch und PR sind die Audit-Spur.

## Schritt 2: Änderungen vornehmen

Setze die Wartung um. Bei mechanischer Arbeit über mehrere Dateien kannst du an einen passend
provisionierten Subagenten delegieren (siehe [subagent-provisioning](.agents/skills/references/subagent-provisioning.md) — Chores sind i.d.R. `haiku`/`sonnet`, Effort low).

## Schritt 3: Verifizieren

Verify-Block ausführen (die vier Befehle, Freshness-Guard, S1-Ratchet-Erklärung) — **SSOT:**
[verification-block](.agents/skills/references/verification-block.md).

> **⚠ S1-Gate-Guard (Chores ohne Plan!):** Chores haben kein Zeilenbudget-Planungsschritt.
> Berührt die Chore Code-Dateien (`.ts/.svelte/.astro/.sh/.mjs/...`), vor dem Commit den
> **Restbudget-Check** aus dem verification-block laufen lassen (`plan-lint.sh residual_budget`-
> Schleife) — bei Restbudget ≤ 0 die Datei **echt verkleinern**, nicht kosmetisch zusammenziehen.

Siehe [dev-flow-gotchas](.agents/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm-Gotchas in Worktrees.

## Schritt 4: Commit, Push & PR

Läuft nach **`git-workflow` Schritt 2–4** (SSOT): git-crypt-Staging-Guard [T001210]
(explizite Pathspecs, NIE `git add -A`, Secret-in-index-Guard), Commit-Verifikation
`HEAD_SHA != BASE_SHA` [T000925], `preflight-pr-scope.sh` vor `gh pr create`,
REST-Fallback für Titel-Edits.

Chore-spezifisch: Titelformat `chore(<scope>): <subject>`. Den Scope aus
`bash scripts/validate-commit-msg.sh scopes` waehlen.

Rufe `commit-commands:commit-push-pr` auf (Claude Code slash-command) oder führe `gh pr create` manuell aus (beide Frameworks).

## Schritt 5: Merge wenn CI grün

**`git-workflow` Schritt 5–6** (SSOT): CI-Fix-Loop bis grün, dann aus dem Haupt-Repo
`gh pr merge --auto --squash` (kein `--delete-branch` — Löschung in Schritt 6, T004612).

## Schritt 6: Worktree & Branch bereinigen

Nach bestätigtem Merge (`gh pr view "$PR_NUM" --json state` = `MERGED`) aus dem Haupt-Repo
aufräumen — Befehlsfolge: [worktree-cleanup](../git-workflow/references/worktree-cleanup.md)
(Lock freigeben, `git worktree unlock` + `remove`, lokalen und Remote-Branch löschen).
`devflow-post-merge-finalize.sh` braucht eine Ticket-ID und gilt für Chores nicht mehr.

Den tatsächlichen Endzustand prüfen: eigener Worktree, lokaler und Remote-Branch
entfernt, eigene Claims freigegeben. Die gemeinsame
[repo-hygiene-ops §2](../references/repo-hygiene-ops.md#2-stale-branches) beschreibt
die positive Prüfung und den Remote-Control-Ausnahmefall ohne Hook-Umgehung.

Beim Test-only-Kurzpfad gibt es keinen Worktree zu entfernen. Nur SID-eigene Claims
freigeben; einen fremd genutzten Hauptcheckout weder umschalten noch entfernen.
Solange der Chore-Branch dort ausgecheckt ist, den lokalen Branch erhalten und den
Cleanup als offen berichten. Für sichere Branch-/Remote-Nacharbeit dieselbe SSOT
anwenden; ein eigener Control-Worktree berechtigt nicht zum Wechseln fremder
Checkouts.

## Schritt 7: Deploy (falls nötig)

Nur wenn die Chore deploybare Pfade berührt — Mapping in
[deploy-routing](.agents/skills/references/deploy-routing.md) (Single Source of Truth).

---

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 6:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `$WT` gelöscht, Branch `chore/<slug>` gelöscht
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
