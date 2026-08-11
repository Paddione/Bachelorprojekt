# Proposal: post-merge-batch-closure

## Why

Ein Batch-PR schliesst nur seinen Parent, nie die mitgelieferten Kind-Tickets. Am 2026-08-11
waren dadurch 19 offene Tickets in Wahrheit laengst gemergt — 13 aus den PRs #4244/#4245/#4246,
sechs weitere aus #4258.

Ursache ist eine einzelne Zeile, `scripts/factory/auto-close-merged.sh:90`:

```bash
ticket=$(printf '%s' "$title" | sed -n 's/.*\[\(T[0-9]\{6\}\)\].*/\1/p' | head -1)
```

Der Ausdruck matcht ausschliesslich IDs in **eckigen** Klammern und nimmt davon die erste. Ein
Batch-PR-Titel traegt die gelieferten Kinder aber in **runden** Klammern:

```
feat(ci): Batch CI/Check-Auswertung Fixes (T003109,T002815,T002922) [T003540]
                                           └── Kinder ─────────────┘  └ Parent ┘
```

Der Schaden bleibt nicht bei Karteileichen stehen. Weil die Kinder offen aussehen, werden sie bei
der naechsten Triage erneut gruppiert: so entstand T003793 als Dublette zu dem laengst
geschlossenen T003490. Der Dedupe-Guard konnte das nicht fangen, weil er nur offene Tickets auf
Titelgleichheit prueft — und der Parent war bereits zu.

**Ortsbestimmung, weil sie nicht offensichtlich ist:** Die Closure liegt *nicht* in
`.github/workflows/post-merge.yml`. Die dortigen Jobs wurden mit E3/T002626 (ADR-006) entfernt,
seit die Ticket-Datenbank lokal liegt und GitHub Actions keinen Zugriff mehr haben. Ersatz ist der
lokal laufende Poller (`factory.timer`, ~5 min) → `scripts/factory/auto-close-merged.sh`. Ein Fix
in `post-merge.yml` liefe in einen Job, der nie ausgefuehrt wird.

**Warum der PR-Titel und nicht die `child_of`-Links.** Die strukturierte Quelle waere die
naheliegende Wahl, traegt hier aber nicht. Gemessen an den drei realen Batch-PRs:

| PR | `child_of` in der DB | runde Klammern im Titel | tatsaechlich geliefert |
|---|---|---|---|
| #4244 | 7 Kinder | 3 | **3** — Titel korrekt |
| #4245 | 6 | 6 | 6 — beide korrekt |
| #4246 | 4 | 7 | **7** — Titel korrekt |

`child_of` ist bei #4244 zu breit und bei #4246 zu schmal (drei Kinder haben gar keinen Link). Der
Grund ist inhaltlich: `child_of` beschreibt die Planungsabsicht ("gehoert thematisch zusammen"),
der Titel beschreibt die Lieferung ("das habe ich jetzt gemacht"). Laeuft ein Batch ueber mehrere
PRs, fallen beide auseinander — und die Closure will das zweite wissen.

**Warum der Vollstaendigkeitsguard entfaellt.** `check_partial_plan_completeness` (T002105) soll
Teil-Lieferungen abfangen, misst dafuer aber unchecked Boxes im Plan. Gemessen an denselben vier
Batches:

| Batch | Partials | unchecked | Realitaet |
|---|---|---|---|
| T003539 | 4 | 0 | P2–P4 nicht geliefert → haette faelschlich durchgelassen |
| T003540 | 7 | 93 | alles geliefert → haette faelschlich blockiert |
| T003541 | 6 | 3 | alles geliefert → haette faelschlich blockiert |
| T003490 | 5 | 3 | alles geliefert → haette faelschlich blockiert |

Drei Fehlalarme, ein Durchlasser. Die Plan-Boxen werden nicht gepflegt und taugen als
Entscheidungsgrundlage nicht. Hinzu kommt, dass der Guard ohnehin wirkungslos ist: er sucht das
Change-Verzeichnis per Glob `openspec/changes/*<ticket-id>*`, waehrend die Slugs sprechend
benannt sind (`batch-git-worktree-integrity`) und die Zuordnung in `.ticket` steht. Der Glob
trifft nichts, `change_dir` bleibt leer, der Guard gibt `0` zurueck.

Sobald der Titel die gelieferten Kinder benennt, ist der Guard entbehrlich: ein PR, der nur P1
liefert, nennt in den runden Klammern auch nur P1s Tickets.

## What

Two changes in `scripts/factory/auto-close-merged.sh`:

1. **Extract delivered children from the PR title.** IDs inside square brackets `[T…]` keep
   identifying the parent (unchanged). IDs inside round brackets `(T…,T…)` are read as the
   delivered children and closed with the same resolution derivation the parent already uses. A
   title without round-bracket IDs behaves exactly as today.

2. **Drop the partial-completeness guard call.** The `check_partial_plan_completeness` invocation
   is removed. `scripts/factory/merge-hooks.sh` itself stays in place — only the wiring goes.

Explicitly out of scope: why the plan checkboxes are unmaintained, and the remaining seven
T003797 children (missing `resolution` on 285 tickets, 37 stalled `triage` tickets, no reopen
path, `.ticket`-less skeletons). Those get their own changes.

_Ticket: T003797_
