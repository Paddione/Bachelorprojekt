# Design: worktree-remove-managed

_Ticket: T900340_

## Entscheidungen

**D1 — Sperre bleibt.** `agent-skills.md` („Cross-Platform Worktree Prune Protection", T900046)
verlangt, dass `worktree-create.sh` jeden Worktree sperrt. Der Fix passt die Entferner an, nicht
den Erzeuger.

**D2 — Helper-Lib statt Inline-Zeilen (entschieden mit dem User).** Die fehlende `unlock`-Zeile
ist genau der Defekt: jede neue Remove-Stelle konnte sie vergessen, und vier von ihnen taten es.
Vorbild fuer die Lib-Form ist `scripts/lib/worktree-set.sh` (eine Ableitung, mehrere Konsumenten).
Verworfen: Inline-`unlock` an jeder Stelle (driftet wieder) und `--force --force` (umgeht
zusaetzlich die Pruefung auf fehlende Worktrees, ohne dass das im Aufruf sichtbar wird).

**D3 — Nur kaputte Aufrufer (entschieden mit dem User).** Die Factory-Pfade entsperren bereits
und funktionieren. Sie umzustellen verdoppelt den Diff ohne Verhaltensaenderung. Ausnahme: der Hauptpfad von
`factory/cleanup.sh` (Zeilen 47-48, `unlock` + `remove`) wird mit umgestellt, weil der EXIT-Trap
derselben Datei ohnehin auf den Helper wechselt — eine Datei, ein Entfernungsweg.

**D4 — Registrierungspruefung im Helper.** `worktree_remove_managed` entfernt nur Pfade, die in
`git worktree list --porcelain` des Repos stehen. `unlock` auf einen fremden Pfad waere harmlos,
`remove --force` auf einen falsch aufgeloesten Pfad nicht (vgl. T012240).

## Schnittstelle

```bash
source scripts/lib/worktree-remove.sh
worktree_remove_managed <repo> <path>   # 0 entfernt · !=0 nicht registriert oder remove scheiterte
```

Die Aufrufer behalten ihr Fehlerverhalten: finalize meldet weiter `ERROR: Schritt 10 …` und
beendet mit 1, `pr-refresh.sh` und `weekly-dep-schema-audit.sh` behalten ihr `|| true`.

## Tests

`tests/spec/agent-skills/worktree-remove-managed.bats`: Helper gegen gesperrten, ungesperrten und
nicht registrierten Pfad; finalize-Schritt-10-Block per Bereichsmuster gegen einen gesperrten
Worktree; Konventions-Guard ueber die vier Aufrufer.
