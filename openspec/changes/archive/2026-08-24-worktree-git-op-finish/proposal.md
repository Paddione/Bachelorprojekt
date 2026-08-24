# Proposal: worktree-git-op-finish

## Why

Der Guard erkennt einen hängengebliebenen Rebase genau, benennt ihn genau — und niemand räumt ihn ab.

**Symptom (beobachtet).** Im repo-hygiene-Lauf vom 2026-08-24 meldete
`scripts/worktree-git-op-guard.sh`:

```
worktree=.worktrees/openspec-closure-guard-spec-T015670 branch=chore/openspec-closure-guard-spec-T015670 \
  operation=rebase (merge backend) (all conflicts resolved, --continue ready)
```

Der Rebase war inhaltlich fertig: `rebase-merge/` vorhanden, „No commands remaining", Working Tree
sauber, alle Konflikte gelöst. Der rebasete Commit `c6b8c65f3` war bereits nach origin gepusht —
nur der lokale Rebase-Zustand blieb liegen, weil der erzeugende Lauf abbrach.

Auf GitHub stand PR #5191 dadurch auf `mergeStateStatus=DIRTY` und blockierte, obwohl die
nicht-invasive Konfliktprobe lokal sauber meldete:

```bash
git merge-tree --write-tree --name-only origin/main FETCH_HEAD   # rc=0, Tree 730386ef9
```

Nach `git rebase --continue` + `git rebase --quit` fiel der PR auf `BLOCKED` (nur noch laufende
CI), Auto-Merge griff, `mergedAt=2026-08-23T23:47:07Z`. Der PR hatte bis dahin Stunden blockiert,
und die `DIRTY`-Meldung lenkt auf einen Konflikt, den es nicht gab.

**Zweiter, davon unabhängiger Punkt — das Exit-Code-Loch.** `git rebase --continue` endete mit
**rc=0** und schrieb zugleich nach stderr:

```
error: update_ref failed for ref 'refs/heads/chore/openspec-closure-guard-spec-T015670':
  is at c6b8c65f… but expected 08ccf897…
```

Ein Abschluss, der `$?` als Urteil nimmt, meldet hier Erfolg, ohne den Endzustand geprüft zu
haben. Aufgeklärt hat den Fall erst der Vergleich von Branch-Ref und HEAD. Es ist dieselbe
Signalklasse, die `repo-hygiene-ops.md` §3 als Grundregel führt.

## What

Der Guard bekommt einen **opt-in** Abschlussmodus. Der Default bleibt unverändert: melden, nie
reparieren.

Die bestehende Zusage in `openspec/specs/agent-skills.md` verbietet dem Guard jedes Reparieren,
mit der Begründung, ein Rebase in einem fremden Worktree fortzusetzen könne einen falschen Commit
auf einem Branch erzeugen, den der Aufrufer nicht besitzt. Diese Begründung trägt für den
allgemeinen Fall — aber nicht für die enge Schnittmenge, in der **kein neuer Inhalt entsteht**:

- der Backend meldet `all conflicts resolved`,
- es sind keine Kommandos mehr offen (`rebase-merge/git-rebase-todo` leer oder nicht vorhanden),
- der Working Tree ist nach der Generat-Allowlist sauber.

Dort schreibt `git rebase --continue` nur den bereits gelösten Zustand fest. Fehlt eines der drei
Signale, bleibt es bei der Meldung.

Die Zusage wird deshalb **präzisiert, nicht aufgehoben** (MODIFIED-Delta): das Verbot gilt
unverändert für den Default-Aufruf, samt seinem Szenario „Der Guard repariert nichts". Nur ein
ausdrücklich angefordertes `--finish` darf handeln.

**Der Abschluss wird am Positiv-Signal belegt**, nicht am Exit-Code: `rebase-merge/` ist
verschwunden **und** `git rev-parse <branch>` == `git rev-parse HEAD`. Genau diese beiden
Prüfungen haben den Fundfall aufgeklärt; ein `$?`-basiertes Urteil hätte ihn verfehlt.

**Nicht in Scope.** Unterbrochene Merges, Cherry-Picks und Rebases mit offenen Konflikten bleiben
reine Meldung — bei ihnen ist die Auflösung eine inhaltliche Entscheidung, keine mechanische.

_Ticket: T015784_
