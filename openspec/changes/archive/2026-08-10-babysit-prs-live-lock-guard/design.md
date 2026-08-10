---
ticket_id: T003137
plan_ref: openspec/changes/babysit-prs-live-lock-guard/tasks.md
status: active
date: 2026-08-10
---

# Design: babysit-prs-live-lock-guard

_Ticket: T003137_

## Root-Cause (verifiziert, nicht Hypothese)

`scripts/factory/babysit-prs.sh` Zeile 222:

```bash
git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT"
```

verglichen mit `scripts/factory/cleanup.sh` Zeile 43-52, das denselben
`git worktree remove`-Schritt hinter einen `agent-lock.sh check-branch-live "$BRANCH"`-Guard
legt (aus T002896: "Der Factory-Autopilot darf aktiv geclaimte Fremd-Worktrees nicht
entfernen"). `babysit-prs.sh` führt strukturell dieselbe Operation aus — legt einen Worktree für
den PR-Branch an (`git worktree add "$WT" "$BRANCH_NAME"`, Zeile 191) und entfernt ihn wieder
(Zeile 222) — trägt aber keinen der beiden in T002896 eingeführten Guards.

Das ist per Code-Vergleich belegt (siehe Ticket-Beschreibung, gegen den Code re-verifiziert:
`cleanup.sh:29,43`, `watchdog.sh:76,80`, `babysit-prs.sh:222`). Nicht belegt und **nicht**
Gegenstand dieser Änderung: ob dieser fehlende Guard den Vorfall aus T003129 verursacht hat —
der Reap-Log zeigt dort das Gegenteil (Lock wurde stale, weil der Worktree schon fehlte).

## Fix-Ansatz

Denselben Guard wie `cleanup.sh` unmittelbar vor Zeile 222 einziehen:

```bash
if bash "${HERE}/../agent-lock.sh" check-branch-live "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "babysit-prs: branch ${BRANCH_NAME} traegt einen live Agent-Lock — Worktree-Removal uebersprungen (T002896)" >&2
else
  git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT" 2>/dev/null || true
fi
```

`$HERE` ist im Skript bereits als `scripts/factory`-Verzeichnis definiert (Zeile 23) — derselbe
Pfadausdruck wie in `cleanup.sh`. `$BRANCH_NAME` ist zu diesem Zeitpunkt im Skript bereits
gesetzt (Zeile 123, aus dem selektierten PR-Kandidaten).

Der `rm -rf`-Fallback bleibt **innerhalb** des Guards erhalten (für den Fall, dass
`git worktree remove` aus anderen Gründen scheitert, z. B. Dateisystem-Inkonsistenz) — er
verschwindet nur aus dem ungeschützten Pfad, in dem er sich bisher auch über einen erfolgreichen
Guard hinweggesetzt hätte.

## Subsysteme

Nur `scripts/factory/babysit-prs.sh`. Kein Änderungsbedarf an `agent-lock.sh` selbst
(`check-branch-live` existiert bereits seit T002896) oder an `cleanup.sh`/`watchdog.sh`.

## Edge-Case: Fehlerpfad nach fehlgeschlagenem `git worktree add` (Zeile 190-195)

```bash
WT="$(mktemp -d "${TMPDIR:-/tmp}/babysit-wt.XXXXXX")"
if ! git worktree add "$WT" "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "babysit-prs: worktree add failed for PR #${NUM}" >&2
  rm -rf "$WT"
  exit 0
fi
```

Geprüft und **absichtlich unverändert gelassen**: `$WT` ist hier ein von `babysit-prs.sh` selbst
per `mktemp -d` frisch angelegtes, leeres Verzeichnis. Schlägt `git worktree add` fehl (z. B. weil
der Branch bereits anderswo — mit einem live Agent-Lock — ausgecheckt ist), wurde `$WT` NIE als
Git-Worktree registriert. `rm -rf "$WT"` entfernt in diesem Zweig ausschließlich das eigene,
nie verwendete Scratch-Verzeichnis von `babysit-prs.sh` — niemals den fremden Worktree, dessen
Pfad an einer völlig anderen Stelle liegt. Ein `check-branch-live`-Guard wäre hier wirkungslos
und würde nur Verwirrung stiften (er würde die eigene Scratch-Cleanup-Zeile schützen, nicht den
fremden Worktree). Kein Fix nötig.

## Nicht-Ziele

- Keine Aufklärung des T003129-Vorfalls (Worktree-Verlust während eines laufenden Batches) —
  der Reap-Log widerlegt bereits die naheliegende Hypothese.
- Kein Nachziehen einer Dirty-Check-Prüfung analog `watchdog.sh` — außerhalb des Ticket-Scopes
  (nur die `check-branch-live`-Guard-Inkonsistenz).
