---
title: "factory-worktree-reaper-lock-guard — Implementation Plan"
ticket_id: T002896
domains: [factory, devflow]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-worktree-reaper-lock-guard — Implementation Plan

_Ticket: T002896_

Root-Cause und Entscheidungen: siehe `proposal.md` und `design.md` in diesem Change-Ordner.
Kernbefund: `scripts/worktree-create.sh:257` (`git worktree remove --force "$WT_PATH"`) und
`scripts/factory/cleanup.sh` entfernen Worktrees/Branches ohne jede Agent-Lock-Pruefung — im
Gegensatz zu `scripts/agent-lock.sh reap`, das seinen eigenen Branch-Loeschschritt bereits gegen
die interne `_branch_is_live_claimed()` absichert.

## File Structure

```
scripts/agent-lock.sh                                                        (618 → ~636, Budget 800: 182 frei)
scripts/worktree-create.sh                                                   (516 → ~535, Budget 800: 284 frei)
scripts/factory/cleanup.sh                                                   (66 → ~85, Budget 800: 734 frei)
tests/spec/factory-reclaim-lock-respect/worktree-reaper-lock-guard-T002896.bats  (bereits angelegt, RED)
```

## Task 1 (p1) — `agent-lock.sh check-branch-live`: oeffentlicher Wrapper um `_branch_is_live_claimed`

**Datei:** `scripts/agent-lock.sh` (Ist 618 - Baseline nicht vorhanden, effektive Schwelle =
statisches Limit `.sh` 800 -> Budget 182).

Neuer Subcommand `check-branch-live <branch>`:
- Ruft die bestehende interne `_branch_is_live_claimed "$1"` auf (Zeile 98, bereits von
  `cmd_reap` fuer den Branch-Loeschschritt genutzt, T001448 M3 — keine neue Logik, nur ein
  neuer oeffentlicher Zugriffspunkt).
- Erfolg (`_branch_is_live_claimed` return 0 = live geclaimt) → `echo live`, `exit 0`.
- Kein live Claim → `echo free`, `exit 1`.
- Registrierung im `case "$cmd" in ... esac`-Dispatch (siehe bestehende `check)`/`list)`-
  Eintraege) und in der `--help`-Ausgabe (Konsistenz mit den anderen Subcommands).

Keine Aenderung an `_branch_is_live_claimed` selbst — sie ist bereits korrekt und getestet
(`tests/spec/factory-reclaim-lock-respect.bats`).

## Task 2 (p2) — `worktree-create.sh`: Idempotency-Remove respektiert live Fremd-Claims

**Datei:** `scripts/worktree-create.sh` (Ist 516 - Baseline nicht vorhanden, effektive Schwelle =
statisches Limit `.sh` 800 -> Budget 284).

Vor Zeile 257 (`git worktree remove --force "$WT_PATH" 2>/dev/null || true`) einen Guard
einziehen:

1. Ermittle den an `$WT_PATH` aktuell ausgecheckten Branch, falls der Pfad existiert:
   `git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null`.
2. Existiert dieser Branch und liefert
   `bash "$(dirname "$0")/agent-lock.sh" check-branch-live "$existing_branch"` `live` (Exit 0),
   BRICHT das Skript ab — **kein** `git worktree remove`, **kein** Rollback-Trap-Verhalten, da
   noch vor dessen Installation (analog zum bestehenden Exit-3-Pfad fuer "branch in use",
   Zeile 283-286, der ebenfalls VOR dem Skeleton-Schritt liegt und nichts anfasst):
   ```bash
   echo "worktree-create: Zielpfad $WT_PATH ist belegt von Branch $existing_branch mit live Agent-Lock — breche ab (T002896)." >&2
   exit 4
   ```
   Neuer, eigener Exit-Code 4 (unterscheidbar von Exit 3 "branch in use" — hier ist der
   *Zielpfad*, nicht der *angeforderte Branch*, der Konflikt).
3. Existiert kein Branch am Pfad, oder liefert der Check `free` (Exit != 0), laeuft die
   bestehende Zeile 257 unveraendert (Positiv-Anker: idempotente Neuanlage bleibt moeglich).

Kommentar im Skript ergaenzen, der auf T002896 und die Symmetrie zu Zeile 283-286 verweist
(vermeidet, dass ein spaeterer Leser den neuen Guard fuer redundant mit dem
"branch in use"-Check haelt — die beiden pruefen unterschiedliche Dinge: angeforderter Branch
vs. bereits belegter Zielpfad).

## Task 3 (p3) — `cleanup.sh`: Skip statt Removal bei live Fremd-Claim

**Datei:** `scripts/factory/cleanup.sh` (Ist 66 - Baseline nicht vorhanden, effektive Schwelle =
statisches Limit `.sh` 800 -> Budget 734).

Vor Schritt "1) Remove the worktree" (Zeile 33) einen Lock-Check einziehen, wenn `--branch`
gesetzt ist:

```bash
if [[ -n "$BRANCH" ]] && bash "$(dirname "$0")/../agent-lock.sh" check-branch-live "$BRANCH" >/dev/null 2>&1; then
  echo "cleanup.sh: branch $BRANCH traegt einen live Agent-Lock — Worktree- und Branch-Removal uebersprungen (T002896)" >&2
else
  # bestehender Schritt 1) Worktree entfernen — unveraendert
  ...
fi
```

Der EXIT-Trap (`_trap_cleanup`, Zeile 25-29) MUSS denselben Check bekommen — sonst entfernt ein
vorzeitiger Skript-Abbruch (z. B. durch `set -e` auf einem der spaeteren Schritte) den Worktree
trotzdem ueber den Trap-Pfad, waehrend der Hauptpfad ihn korrekt uebersprungen haette.

Schritt "3) Delete the local branch" (Zeile 49-59) bekommt denselben Guard: bei live Claim wird
`git branch -D` uebersprungen und die Skip-Meldung ins bestehende `cleaned=()`-Reporting
integriert (kein separates Logging-Schema).

`cleanup.sh` bleibt best-effort und exitet weiterhin immer 0 — der Guard aendert nur, WELCHE
Schritte laufen, nicht den Exit-Code-Vertrag des Skripts.

## Task 4 (p4, Tests) — Guard-Test verifizieren (bereits RED geschrieben)

Der Failing-Test liegt bereits im Repo:
`tests/spec/factory-reclaim-lock-respect/worktree-reaper-lock-guard-T002896.bats` — 6 Tests:
2× `check-branch-live` (live/free), 2× `worktree-create.sh` (Kollision mit/ohne Lock), 2×
`cleanup.sh` (Skip/Removal mit/ohne Lock). Jeder Negativtest ("wird NICHT entfernt") hat einen
Positiv-Anker im Nachbartest ("wird SEHR WOHL entfernt" ohne Lock) — verifiziert vakuum-frei
(T002356-M1).

- [ ] **Failing-Test-Step (RED) — bereits verifiziert.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect/worktree-reaper-lock-guard-T002896.bats
# expected: FAIL — 4 von 6 Tests rot (check-branch-live x2, worktree-create.sh-Kollision,
# cleanup.sh-Skip), 2 Positiv-Anker bereits gruen (Removal-ohne-Lock unveraendert)
```

- [ ] **Fix-Step (GREEN).** Nach Task 1-3: alle 6 Tests gruen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect/worktree-reaper-lock-guard-T002896.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/factory-reclaim-lock-respect
```

- [ ] **Regressionsnachweis** gegen die bestehende `agent-lock`- und `worktree-create`-Suite
      (kein Rueckschritt bei bestehenden Szenarien):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory-reclaim-lock-respect.bats
tests/unit/lib/bats-core/bin/bats tests/spec/worktree-divergence-guard-T002387.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/worktree-divergence-guard/
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats
```

## Task 5 (p5) — Final Verification

- [ ] **Steps:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
