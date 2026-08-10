# Proposal: factory-prep-worktree-reuse

## Why

Der Worktree-Pre-Create in `scripts/vda/factory-prep.sh` scheitert dauerhaft, wenn der
Branch des Tickets bereits in einem anderen Worktree ausgecheckt ist:

    scripts/worktree-create.sh "${branch}" "${wt_path}" "origin/${branch}"
    → "worktree-create: branch in use — <branch> ist bereits ausgecheckt in <pfad>" (exit 3)

Das Ticket wird dann bei **jedem** Tick geschedult, der Pre-Create scheitert, der Slot
wird wieder freigegeben (T003269 stellt den Vorzustand `plan_staged`/`backlog` wieder
her), und im naechsten Tick beginnt dasselbe von vorn. Die Bedingung heilt nicht von
selbst — ein dauerhafter, stiller Endlos-Loop.

Konkreter Dauerausloeser: der Mishap-Rollup (`scripts/factory/mishap-rollup.sh`) haelt
`chore/mishap-incident-rollup` permanent in `.worktrees/mishap-incident-rollup`
ausgecheckt (persistenter Branch, T002407). Das Container-Ticket steht dauerhaft in der
Queue — die Factory blockiert damit ihr eigenes Ticket bei jedem Tick.

Hinzu kommt ein Durchreichungs-Defekt: `factory-prep.sh` schreibt `worktree_path` zwar
in die Prep-JSON, aber weder `dispatcher.js` noch `pipeline.mjs` reichen ihn an den
Implementierungs-Schritt durch — `pipeline.mjs` berechnet `WORK_WT` selbst aus dem slug.
Ein wiederverwendeter (nicht-kanonischer) Worktree wuerde also nie bei der Pipeline
ankommen.

## What

- **V1 — Reuse eines bestehenden Worktrees.** Vor dem `worktree-create.sh`-Aufruf prueft
  `factory-prep.sh` per `git worktree list --porcelain`, ob der Ziel-Branch bereits in
  einem anderen Worktree ausgecheckt ist. Ist er das UND haelt keine live Session den
  Branch (`agent-lock.sh check-branch-live` = free) UND ist der Worktree sauber
  (`git status --porcelain` leer), wird dieser Worktree als `worktree_path` in den
  Launch uebernommen, statt zu scheitern. Bei Live-Lock oder dirty Worktree bleibt es
  beim sauberen SKIP (der fremde Stand darf nicht mitcommittet werden).
- **V4 — Eskalation nach n Fehlversuchen.** Jeder `worktree_failed`-SKIP inkrementiert
  einen Zaehler `prep_skip:<ext_id>` in `tickets.factory_control` (analog
  `factory_attempt:<ext_id>` vom Watchdog, T002389). Nach 3 aufeinanderfolgenden
  Fehlversuchen wird das Ticket sichtbar eskaliert: `ticket.sh unfactory` →
  `status=blocked` + `attention_mode=needs_human` + erklaerender Kommentar. Der Zaehler
  wird bei erfolgreichem Pre-Create zurueckgesetzt.
- **Durchreichung von `worktree_path`.** `dispatcher.js` und `pipeline.mjs` reichen den
  tatsaechlich verwendeten Worktree-Pfad durch: `pipeline.mjs` nutzt
  `A.worktree_path` als `WORK_WT`-Override, falls gesetzt (sonst bisherige Berechnung).

Nicht Teil dieses Changes: das stdout-Leck und der Status-Restore im SKIP-Pfad — beides
in T003269 erledigt. Der Mishap-Rollup-Worktree selbst wird nicht veraendert; die
Wiederverwendung macht den Endlos-Loop obsolet.

_Ticket: T003270_
