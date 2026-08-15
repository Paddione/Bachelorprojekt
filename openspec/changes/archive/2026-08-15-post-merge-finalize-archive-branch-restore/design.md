---
ticket_id: T006791
plan_ref: openspec/changes/post-merge-finalize-archive-branch-restore/tasks.md
status: active
date: 2026-08-15
---

# Design: Branch-Restore der Archiv-Sektion (T006791)

## Root-Cause-Analyse (belegt)

**Symptom (Fakt):** Nach einem Lauf der Archiv-Sektion (Schritt 8) von
`scripts/devflow-post-merge-finalize.sh` steht der Arbeitsbaum dauerhaft auf dem
Archiv-Branch `chore/plan-archive-<slug>-<ticket>` statt auf dem vorherigen Branch.
Betroffen ist der geteilte Arbeitsbaum: `ARCHIVE_DIR` ist entweder der Worktree
(`$WORKTREE`) oder das **Haupt-Checkout** (`$REPO_DIR`) — T002357-Fallenklasse.

**Beleg (MESSUNG, T002717 — Stand vor PR #4586):**

```bash
# Stand, gegen den gemessen wurde: main vor dem Fix-Merge (chore: auto-regenerate
# freshness artifacts (#4584)); nach PR #4586 ist die Variable auf main vorhanden.
PRE=8422d5b3993124642beec769264b891acc178960
git show "$PRE:scripts/devflow-post-merge-finalize.sh" | grep -c ARCHIVE_PREV_BRANCH   # → 0
```

Die Archiv-Sektion lief in einer Subshell mit `git checkout -B "$ARCHIVE_BRANCH"
origin/main` ohne Restore. Der BATS-Guard
`tests/spec/agent-skills/post-merge-finalize-guards.bats` Assertion 5
(ARCHIVE_PREV_BRANCH) lag gegen main als `skip` mit Verweis auf T006791 (via PR #4579).

**Hypothese vs. Ursache:** Die Ticket-Beschreibung nennt als Ursache „Restore fehlt".
Verifiziert: Der T006348-Plan (Befund 2) deklarierte zwei Teile — (a) ls-remote-Skip
(implementiert, PR #4572) und (b) `ARCHIVE_PREV_BRANCH` merken + zurückschalten
(NICHT implementiert). Der Fix ist damit nicht eine neue Erfindung, sondern die
nachgeholte Hälfte einer dokumentierten Entscheidung.

## Fix-Ansatz (Stand: PR #4586 + Review-Fixes PR #4596)

### 1. Capture vor der Sektion (im `else`-Zweig, nach dem ls-remote-Skip)

```bash
ARCHIVE_PREV_BRANCH="$(git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD)"
ARCHIVE_PREV_SHA="$(git -C "$ARCHIVE_DIR" rev-parse HEAD 2>/dev/null || true)"
```

Die SHA zusätzlich merken: auf detached HEAD liefert `rev-parse --abbrev-ref HEAD`
nur `"HEAD"` und wäre als Restore-Ziel unbrauchbar — der Restore holt den Zustand
dann per `git checkout --detach "$ARCHIVE_PREV_SHA"` zurück (Code-Review PR #4586,
Finding 9).

### 2. Subshell-EXIT-Trap mit Ownership-Guard

In der Sektions-Subshell wird eine Trap registriert, die bei **jedem** Subshell-Exit
läuft — Happy-Path (nach Push/PR) UND Fehlerpfade (gh pr create / gh pr merge FATAL
→ exit 1):

- **Ownership-Guard (T002357):** Restore nur, wenn `HEAD == $ARCHIVE_BRANCH` —
  hat eine parallele Session zwischenzeitlich den Branch gewechselt, bleibt deren
  Wechsel unangetastet (WARN statt Restore). Ohne den Guard wäre der Restore selbst
  eine T002357-Verletzung (Code-Review PR #4586, Finding 8).
- **Restore-Fehler:** `FATAL` auf stderr + `git status --short`-Dump (zeigt, welche
  Änderungen den Wechsel blockieren) + Hinweis, dass ein ggf. noch gehaltener
  agent-lock manuell geräumt werden muss; Exit 1 (kein stiller Erfolg, kein
  Ticket-`done` mit gewechseltem Arbeitsbaum).

### 3. Order-Swap in der Sektion (Code-Review PR #4586, Findings 1/3/4/7)

Neue Reihenfolge — **erst** auf den Archiv-Branch wechseln, **dann** archivieren
und direkt auf dem Archiv-Branch committen:

```bash
git fetch origin main
git checkout -B "$ARCHIVE_BRANCH" origin/main
bash scripts/openspec.sh archive "$SLUG"
task freshness:regenerate >/dev/null 2>&1 || true
git add <openSpec-Artefakte>
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"
git push -u origin "$ARCHIVE_BRANCH"
```

Eliminiert drei Fehlerklassen des ursprünglichen Ansatzes (Commit auf dem
Pre-Switch-Branch, dann cherry-pick):
1. **Kein Streu-Commit:** Der Archiv-Commit landet nie auf dem Arbeitsbaum-Branch
   der parallelen Session (empirisch belegt im Review: Commit erschien auf PREV).
2. **Kein cherry-pick:** entfällt komplett — kein Konfliktrisiko, kein
   „already applied"-Fehler nach Rebase, kein post-checkout-Hook-Dirty-Tree.
3. **Push-Berechtigung:** Der Push läuft auf dem frisch von `origin/main`
   abgezweigten Branch (T002256) — kein Rebase des bereits gepushten Branches.

### 4. Schritt 10: ausgecheckter Branch ist kein Fehler (Review-Finding 2)

Der Restore stellt den Haupt-Checkout auf den Ticket-Branch `$BRANCH` zurück. Ein
danach ausgecheckter Branch ist nicht löschbar (`cannot delete branch used by
worktree`) — der Delete-Block überspringt diesen Fall mit `mark_skip` (lokaler
Branch bleibt als Arbeitsbaum-Zustand erhalten, Remote-Delete via branch-reaper)
statt mit `ERROR ... exit 1`. Ohne diese Anpassung endete jeder Finalize-Lauf im
Main-Checkout-Fall dauerhaft rot — der Batch-Pfad wäre permanent gebrochen.

### Warum Subshell-Trap statt Restore im Hauptfluss?

Der Restore NACH der Subshell im Hauptfluss (naheliegende Variante) deckt nur den
Happy-Path: `set -euo pipefail` beendet das Skript bei einem Fehler in der Subshell
(z. B. `gh pr create` FATAL) sofort — der Restore im Hauptfluss liefe nie, und genau
der Fehlerfall ist die gefährlichste T002357-Variante (Skript bricht ab, Arbeitsbaum
bleibt auf dem Archiv-Branch, der geteilte Checkout ist für parallele Sessions
kaputt). Die Trap läuft bei jedem Subshell-Exit.

## Edge Cases

| Fall | Verhalten |
|---|---|
| Archiv-Branch existiert bereits remote | ls-remote-Skip — kein Branch-Wechsel, kein Capture, keine Subshell, kein Restore |
| Fehler bei fetch/`checkout -B` (vor dem Wechsel) | HEAD == PREV; Trap-Restore ist No-op (Ownership-Guard greift nicht, WARN-Zweig schweigt) |
| Fehler NACH `checkout -B` (archive, commit, push, pr create, merge) | Trap restauriert trotzdem; Subshell-Exit-Code bleibt 1; `git status --short` im Restore-Fehlerfall |
| HEAD war detached | SHA-Capture + Restore via `git checkout --detach "$SHA"` |
| `ARCHIVE_DIR == $REPO_DIR` (Haupt-Checkout) | `git -C "$ARCHIVE_DIR"` wirkt auf denselben Checkout — Restore greift |
| `ARCHIVE_DIR == $WORKTREE` | `git -C "$WORKTREE"` — geteiltes .git, Restore greift |
| Paralleler Wechsel während der Sektion | Ownership-Guard: WARN, kein Restore — der fremde Wechsel bleibt unangetastet (T002357) |
| Restore-Ziel zwischenzeitlich gelöscht / Checkout blockiert | `FATAL` + status-Dump + Lock-Hinweis auf stderr, Skript endet mit Exit 1 — kein falsches done |
| Restore stellt Haupt-Checkout auf $BRANCH, Schritt 10 will `branch -D $BRANCH` | mark_skip: ausgecheckter Branch ist nicht löschbar; lokaler Branch bleibt, Remote via branch-reaper |

## Test-Strategie

- Assertion 5 in `tests/spec/agent-skills/post-merge-finalize-guards.bats`:
  `skip` entfernt, prüft seit dem Review-Fix (PR #4596) zwei Signale —
  `ARCHIVE_PREV_BRANCH` (Capture) **und** `trap _restore_prev_branch EXIT`
  (Restore-Mechanismus). Die reine Capture-Variable wäre vakuos: ein Refactor,
  der die Trap entfernt, muss rot werden (Code-Review PR #4586, Finding 11).
- Zeilennummern-Kommentare in der BATS-Datei entfernt — Positionsangaben sind
  T003104-Fehlerklasse (Dokumentposition ist kein stabiles Signal).
- Zusätzlich zur Source-Grep-Absicherung wurde die Restore-Mechanik isoliert in
  einem Bare-Git-Repo mit Fake-openspec.sh verifiziert (Code-Review PR #4586) —
  ein voller BATS-Runtime-Test bleibt unmöglich: die Sektion ist nicht als
  Funktion isolierbar und Schritt 1 (ticket.sh get) braucht die Ticket-DB.
- Lokale Verifikation: `tests/unit/lib/bats-core/bin/bats
  tests/spec/agent-skills/post-merge-finalize-guards.bats` (8 Tests grün).
- Live-Verifikation: Finalize-Lauf für T006791 aus dem Haupt-Checkout nach dem
  Merge (Archiv-Sektion mit Restore + Schritt-10-Skip).
