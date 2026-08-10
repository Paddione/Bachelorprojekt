---
title: "mishap-incident-rollup — Implementation Plan"
ticket_id: T003067
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup — Implementation Plan

_Container-Ticket: T003067_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-10 02:18 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-09 19:40 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | suspicious | git-workflow | Teilweise durchgelaufener `git stash pop` nach Rebase sieht aus wie ein erfolgreicher |
| 2 | degraded | git-workflow | Der Stash-Stack ist worktree-uebergreifend geteilt — als Sicherungsnetz bei Parallelarbeit unbrauchbar |
| 3 | drift | scripts/factory/mcp-go | Stale factory-mcp binary deployed via systemd (2026-08-04) |
| 4 | drift | tickets/update-status.sh · Terminal-Guard T002382 | Faelschlich als done angelegtes Ticket ist ueber den sanktionierten Pfad nicht reparierbar |
| 5 | suspicious | tests/spec · CI-Guards (T002407-M6b, T002500) | Zwei offene PRs scheitern am alten Guard, den ihre eigene Aenderung ersetzt |
| 6 | drift | skills/references/repo-hygiene-ops | branch-reaper.sh kann den in §2 beschriebenen Sweep gar nicht leisten — filtert hart auf EINE Ticket-ID |
| 7 | process | repo/pr-hygiene | 4 von 4 offenen PRs scheiterten am Freshness-Gate — test-inventory.json nie mitregeneriert |
| 8 | drift | repo/worktrees | Zwei verwaiste git-Worktrees im Scratchpad einer fremden, beendeten Session |
| 9 | degraded | scripts/openspec-embed (post-commit hook) | openspec-embed scheitert bei jedem Commit an Port 15432 — k3d-Port-Forward belegt ihn dauerhaft |
| 10 | degraded | skills/dev-flow-chore | dev-flow-chore Schritt 0 stasht den Haupt-Checkout ungefragt (Datenverlustrisiko bei Parallelsessions) |

**1. Teilweise durchgelaufener `git stash pop` nach Rebase sieht aus wie ein erfolgreicher** (suspicious, git-workflow)

Beobachtet beim Abschliessen von T002894 am 2026-08-09. Ablauf nach git-workflow Schritt 0: `git stash -u` → `git rebase origin/main` → `git stash pop`. Der Rebase loeste den post-rewrite-Hook aus, der `website/src/data/openspec-status.json` neu generierte — genau eine der gestashten Dateien. Der anschliessende `pop` konnte deshalb nur teilweise anwenden und meldete am Ende `The stash entry is kept in case you need it again`.

Das Tueckische ist der Endzustand: `git status --porcelain` zeigte danach EINE modifizierte Datei (`openspec-status.json`). Das sieht wie ein normaler, erfolgreicher Pop aus. Die eigentliche inhaltliche Arbeit — die Erweiterung von `scripts/one-shot/purge-fn-v8.sql` von einem auf sieben Guards — war NICHT im Arbeitsbaum, sondern lag weiterhin im Stash. Waere sie nicht aufgefallen, haette der PR die halbe Aenderung enthalten und die Verifikation gegen die DB waere trotzdem an einer spaeteren Stelle rot geworden — also mit einem irrefuehrenden Symptom statt mit "deine Aenderung fehlt".

Erkennungs- und Loesungsweg: `git stash list` nach dem Pop pruefen (ein verbliebener Eintrag IST der Befund), Inhalt per `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende Datei gezielt zurueckholen mit `git checkout "stash@{0}" -- <pfad>`.

Konventionsluecke (git-workflow Schritt 0): Der Skill schreibt die Sequenz `git stash` / `git pull --rebase` / `git stash pop` vor und warnt bereits vor der Branch-Switch-Race, aber nicht vor dem Teil-Pop. Vorschlag: Nach dem Pop pruefen, dass `git stash list` um genau den eigenen Eintrag kuerzer geworden ist, statt den Exit-Code oder die Statusanzeige als Beleg zu nehmen. Das ist dasselbe Muster wie bei der Merge-Verifikation per `mergedAt` — nicht auf die Abwesenheit eines Fehlers pruefen, sondern auf das positive Signal.
**2. Der Stash-Stack ist worktree-uebergreifend geteilt — als Sicherungsnetz bei Parallelarbeit unbrauchbar** (degraded, git-workflow)

Beobachtet am 2026-08-09. Vor einer Umstrukturierung im Hauptcheckout legte ich einen benannten Sicherungs-Stash an (`git stash push -u -m "archive-T002894 safety net" -- openspec website/src/data/openspec-status.json`); der Befehl meldete `Saved working directory and index state`. Wenige Minuten spaeter war der Eintrag aus `git stash list` verschwunden, waehrend zwei fremde Eintraege neu darin standen, darunter `On fix/sammel-bats-hygiene-T002925: WIP on fix/purge-test-data-schema-drift-T002894` — also von einer parallel laufenden Session.

Ursache: `refs/stash` liegt im gemeinsamen Git-Verzeichnis (`git rev-parse --git-common-dir`), nicht pro Worktree. Alle 15 Worktrees dieses Repos teilen sich EINEN Stash-Stack. Ein `git stash pop` in irgendeinem davon nimmt `stash@{0}` — und das kann der Eintrag einer anderen Session sein. Die Indizes verschieben sich ausserdem bei jedem fremden Push auf den Stack, sodass selbst ein gemerktes `stash@{N}` nach kurzer Zeit auf etwas anderes zeigt.

Konkreter Schaden hier: keiner — der Inhalt war regenerierbar (`scripts/openspec.sh archive` erneut im Worktree ausgefuehrt) und landete in PR #3982. Der Punkt ist die falsche Sicherheitsannahme: ein Stash fuehlt sich wie ein privates Sicherungsnetz an und ist in einem Multi-Worktree-Repo ein geteilter, von fremden Sessions veraenderbarer Stack.

Konventionsluecke (repo-hygiene §0 und git-workflow Schritt 0): Beide behandeln Stashes als lokalen Zustand. §0 sieht sogar ein "Stash-Inventar" ueber `git stash list` vor, ohne zu erwaehnen, dass die dort gelisteten Eintraege aus beliebigen Worktrees stammen koennen — die Zuordnung "welcher Stash gehoert zu welcher Arbeit" ist allein ueber die Nachricht moeglich, und nur wenn sie benannt wurde. Vorschlag: Bei Parallelarbeit statt `git stash` einen Wegwerf-Commit auf dem eigenen Branch verwenden (`git commit -m wip`, spaeter `reset --soft`) — der ist per Konstruktion an den Branch gebunden. Wo ein Stash noetig bleibt: immer `-m` mit Ticket-ID, und nie ueber den Index `stash@{0}` aufloesen, sondern ueber die Nachricht suchen.
**3. Stale factory-mcp binary deployed via systemd (2026-08-04)** (drift, scripts/factory/mcp-go)

Der systemd-user-Dienst factory-mcp.service lief mit einem am 2026-08-04 gebauten Binary (scripts/factory/mcp-go/bin/factory-mcp), das den T002830 is_test_data-Filter nicht enthaelt. Die Queue-Reads (factory_status/factory_queue) lieferten deshalb das Test-Fixture-Ticket T003020 (is_test_data=true) zurueck, obwohl alle aktuellen Quell-Pfade (mcp-go/main.go, mcp-server.mjs, queue.sh) den Filter haben. Nachweis: ls bin/factory-mcp (2026-08-04) vs. Quelle mit Filter; nach Rebuild (CGO_ENABLED=0 go build) + systemctl --user restart factory-mcp.service liefert die Queue T003020 nicht mehr. Der agents:factory-mcp:install-Task baut zwar, aber ein laufender Dienst wird nicht automatisch nach Quell-Aenderung neu gebaut/restartet — Drift-Luecke im Deploy-Flow.
**4. Faelschlich als done angelegtes Ticket ist ueber den sanktionierten Pfad nicht reparierbar** (drift, tickets/update-status.sh · Terminal-Guard T002382)

Beobachtet 2026-08-09 waehrend repo-hygiene §3.

T003025 wurde bereits als `status=done` mit `resolution=null` angelegt: `created_at == updated_at` (2026-08-09 15:41:36), das Ticket hat also nie einen Lebenszyklus durchlaufen. Ein Merge-Nachweis existiert nicht — `gh pr list --search T003025 --state all` liefert ausschliesslich #4004 mit `state=OPEN` und leerem `mergedAt`, `git log origin/main --grep=T003025` ist leer. PR #4004 ist zudem rot.

Die Korrektur ist ueber den sanktionierten Pfad NICHT moeglich: `mcp__ticket-mcp__transition_status({id: T003025, status: in_progress})` bricht mit Exit 2 ab — "Cannot transition from 'done' to 'in_progress' — terminal tickets can only transition to 'archived'" (Terminal-Guard T002382).

WARUM ES ZAEHLT: Der Terminal-Guard schuetzt gegen das Wiederaufreissen eines echt abgeschlossenen Tickets. Er trifft aber auch den Fall, in dem `done` nie gueltig war, weil es der Anfangszustand war. Damit ist ein per Fehleingabe geschlossenes Ticket nur noch per Direkt-SQL oder ueber `archived` + Neuanlage zu korrigieren; beides umgeht bzw. verliert die Historie. Ein `done` ohne `resolution` und ohne `done_at`-Lebenszyklus ist maschinell von einem gueltigen Abschluss unterscheidbar — der Guard koennte diesen Fall ausnehmen, statt ihn zu zementieren.

Kein Eingriff vorgenommen: der Guard wurde bewusst NICHT per SQL umgangen. Der Widerspruch ist als Kommentar an T003025 dokumentiert.

Angrenzend: T002845 ("18 Tickets stehen auf plan_staged ohne plan-Zeile/Branch") beschreibt dieselbe Klasse — Statuswert ohne den Zustand, den er behauptet.
**5. Zwei offene PRs scheitern am alten Guard, den ihre eigene Aenderung ersetzt** (suspicious, tests/spec · CI-Guards (T002407-M6b, T002500))

Beobachtet 2026-08-09 waehrend repo-hygiene §3 — zweimal gleichzeitig, gleiches Muster.

Beide PRs sind `mergeable=MERGEABLE`, aber rot, und in beiden Faellen ist der Fehlschlag die erwartbare Folge der PR-eigenen Aenderung:

1. PR #4006 (Branch fix/rollup-container-triage-status-T002876) laesst `ticket.sh rollup-container` den Container als `triage` statt `plan_staged` anlegen. Rot wird `Factory spec shard 4`: `not ok 135 T002407-M6b: ticket.sh rollup-container dokumentiert status=plan_staged (T002783)` — der Guard fordert weiter `plan_staged`.

2. PR #4004 (Branch chore/ci-shard-balance-T003025) gewichtet die Factory-Spec-Shards nach gemessener Laufzeit (junit-Timing + LPT). Rot wird `Factory spec shard 3`: `not ok 171 T002500: die Shards sind nach @test-Anzahl balanciert (schwerster <= 1.5x leichtester)` — der Guard misst weiter nach @test-Anzahl.

WARUM ES ZAEHLT: In beiden Faellen ist der rote Test kein Defekt-Nachweis, sondern ein nicht mitgezogener Guard. Der PR-Autor sieht einen roten Lauf, dessen Ursache nicht im geaenderten Verhalten liegt, sondern in der Zusicherung des ALTEN Verhaltens. Das ist die teuerste Form von rotem CI: sie sieht aus wie ein Fehler in der Aenderung. Dass es zweimal am selben Tag unabhaengig auftrat, spricht fuer eine strukturelle Luecke, nicht fuer zwei Fluechtigkeitsfehler — es fehlt ein Schritt, der beim Aendern einer Regel die Guards findet, die diese Regel festschreiben (grep auf die Ticket-ID/Regelformulierung in tests/spec/).

Anmerkung zu PR #4004: dort faellt zusaetzlich `not ok 550 T002721 Daemon raeumt PID- und Token-Datei beim Beenden auf` (31,5 s Laufzeit) — Timing-Verdacht, sachlich unabhaengig von der Shard-Gewichtung und hier nicht mitbewertet.
**6. branch-reaper.sh kann den in §2 beschriebenen Sweep gar nicht leisten — filtert hart auf EINE Ticket-ID** (drift, skills/references/repo-hygiene-ops)

BEOBACHTET (2026-08-09, repo-hygiene §2)

repo-hygiene-ops.md §2 "Verwaiste Remote-Branches (ohne PR) [T002520]" stellt
scripts/branch-reaper.sh als das Werkzeug vor, das die Klasse verwaister Branches
abdeckt, und nennt zur Begruendung eine Bestandsaufnahme ueber ALLE Remote-Branches
("am 2026-08-01: 24 von 26 Remote-Branches ohne jeden PR"). Der Aufruf zum Nachsehen
steht dort als:

    bash scripts/branch-reaper.sh --ticket T00XXXX --dry-run

VERIFIZIERT
scripts/branch-reaper.sh:120-123 selektiert so:

    git ls-remote --heads "$REMOTE" | grep -i -- "$TICKET_ID"

und :77 bricht ohne --ticket mit Exit 2 ab. Das Skript kann damit ausschliesslich
Branches EINES Tickets betrachten — den Bestandssweep, aus dem §2 seine Begruendung
zieht, leistet es prinzipiell nicht.

REAL EINGETRETEN
Der Runbook-Aufruf mit dem woertlichen Platzhalter liefert:
    $ bash scripts/branch-reaper.sh --ticket T000000 --dry-run
    Keine Remote-Branches mit Ticket-ID T000000 gefunden.
Exit 0, keine Zeile. Das ist von "es gibt keine verwaisten Branches" nicht zu
unterscheiden — dasselbe Muster "leere Antwort ist kein Urteil", das §0 und §3
bereits an anderer Stelle festhalten. Ich musste den Sweep von Hand fahren
(git branch -r durchgehen, pro Branch PR-Zustand und Blob-Abweichung pruefen).

MOEGLICHE AUFLOESUNGEN (nicht entschieden)
a) §2 praeziser fassen: branch-reaper ist der Post-Merge-Aufraeumer FUER EIN TICKET,
   nicht das Sweep-Werkzeug. Den manuellen Sweep dort als eigenen Block auffuehren.
b) branch-reaper um einen ticketlosen Modus erweitern (--all/--sweep), der ueber alle
   Remote-Heads laeuft und je Branch REAP/KEEP mit Begruendung ausgibt.
Beides ist vertretbar; b) waere die Variante, die den Runbook-Text einloest.
**7. 4 von 4 offenen PRs scheiterten am Freshness-Gate — test-inventory.json nie mitregeneriert** (process, repo/pr-hygiene)

BEOBACHTET (2026-08-09, repo-hygiene §3)

Alle vier zum Zeitpunkt des Laufs offenen PRs (#4014, #4015, #4016, #4017) scheiterten
am selben Required Check "BATS Unit + Quality Gates", Step "Ensure freshness artifacts
are up to date":

    ✗ website/src/data/test-inventory.json regenerated but not staged
    ERROR: 1 generated artifact(s) are not committed

Ursache in jedem einzelnen Fall identisch: der PR fuegt neue .bats-Dateien hinzu, ohne
`task freshness:regenerate` laufen zu lassen und das Inventar mitzucommitten. Belegt
je PR durch den Diff des nachtraeglichen Regen-Laufs — #4014 fehlten die zwei Eintraege
ci-cd/spec-test-no-fixed-sleep-polling und ci-cd/spec-test-no-tracked-file-mutation,
#4017 die zwei Eintraege active-sessions-hub/opencode-session-id-stable und
ci-cd/devflow-ci-watch-merged-exit.

WARUM DAS BEMERKENSWERT IST
Die Anforderung ist dokumentiert (CLAUDE.md → CI/CD → "Test inventory check") und
git-workflow Schritt 1 verlangt `task freshness:regenerate` explizit vor dem Commit.
Trotzdem liegt die Verletzungsquote hier bei 4/4. Eine Regel, die vollstaendig
dokumentiert ist und trotzdem von jedem PR verletzt wird, ist keine Wissensluecke
der Ausfuehrenden, sondern eine Luecke in der Durchsetzung: der Fehler faellt erst
in CI auf, also mehrere Minuten nach dem Push, und kostet dann pro PR eine
Regen-Commit-Push-Runde.

BEHOBEN IN DIESEM LAUF
#4014 (Commit e60f343d2) und #4017 (Commit 598f13bd9) regeneriert, gepusht,
Auto-Merge scharf. #4015/#4016 bewusst nicht angefasst — sie haben zusaetzlich
echte Testfehler (siehe unten) und gehoeren ihren Ticket-Ownern.

MOEGLICHE AUFLOESUNG (nicht entschieden)
Der pre-commit-Hook laeuft ohnehin schon (validate-commit-msg, gitleaks). Ein
`task freshness:check` an derselben Stelle wuerde den Befund vom CI-Zeitpunkt auf
den Commit-Zeitpunkt vorziehen. Kostenfrage: Laufzeit des Checks im Hook.
**8. Zwei verwaiste git-Worktrees im Scratchpad einer fremden, beendeten Session** (drift, repo/worktrees)

BEOBACHTET (2026-08-09, repo-hygiene §1)

`git worktree list` im Hauptcheckout fuehrte zwei Eintraege ausserhalb von
.worktrees/ auf:

  /tmp/claude-1000/-home-patrick-Bachelorprojekt/0a75f198-8466-4f3c-bcf5-744a89b9210f/scratchpad/mainwt   23b6061c0 (detached HEAD)
  /tmp/claude-1000/-home-patrick-Bachelorprojekt/0a75f198-8466-4f3c-bcf5-744a89b9210f/scratchpad/mainwt2  de8d93b6b (detached HEAD)

Die Session-UUID 0a75f198-… gehoert nicht zur laufenden Session. Beide Worktrees
standen auf detached HEAD auf Commits, die inzwischen in main sind (23b6061c0,
de8d93b6b), Arbeitsbaum in beiden nachweislich sauber (`git status --porcelain`
leer). Entfernt per `git worktree remove` (ohne --force) + `git worktree prune`.

WARUM DAS BEMERKENSWERT IST
Ein Worktree im Scratchpad-Verzeichnis wird beim Aufraeumen leicht uebersehen,
weil die uebliche Suche in .worktrees/ danebengreift — dieser Runbook-Lauf hat
sie nur gefunden, weil §1 `git worktree list` verlangt statt eines ls auf
.worktrees/. Solange die Eintraege liegen bleiben, haelt jeder von ihnen eine
Ref und verhindert, dass der zugehoerige Commit-Bereich garbage-collected wird;
ausserdem tauchen sie in jeder kuenftigen Worktree-Inventur als Rauschen auf.

Kein Datenverlust, kein akuter Schaden — der Befund ist, dass hier eine Session
beendet wurde, ohne ihren temporaeren Worktree abzuraeumen, und dass nichts
diesen Zustand von selbst aufloest.
**9. openspec-embed scheitert bei jedem Commit an Port 15432 — k3d-Port-Forward belegt ihn dauerhaft** (degraded, scripts/openspec-embed (post-commit hook))

BEOBACHTET (2026-08-09, dev-flow-plan T003045, Stage-Commit b78616a60)

Der post-commit-Hook `openspec-embed` scheiterte dreimal in Folge und gab auf:

  [openspec-embed-local] FEHLER: Port 15432 wird von einem fremden Prozess
  (PID 50718: kubectl --context k3d-mentolder-dev port-forward -n workspace
  svc/shared-db 15432:5432) belegt, nicht vom eigenen Port-Forward (PID 1660165).
  Beende den fremden Prozess oder setze OPENSPEC_EMBED_PF_PORT auf einen freien Port.
  [openspec-embed] retry 1/3 … retry 2/3 …
  [openspec-embed] WARN: embed failed for 'main-ci-branch-precondition'
                   after 3 attempts (non-fatal — see above)

Der Change 'main-ci-branch-precondition' ist damit nicht eingebettet. Die
Aehnlichkeitssuche (openspec_find_similar) findet ihn nicht — genau die Funktion,
die Doppelarbeit an derselben Sache verhindern soll.

EINORDNUNG — das Verhalten ist BESSER als frueher, nicht schlechter
Der Guard erkennt den Fremdprozess und verweigert die Arbeit. Aeltere Notizen
beschreiben denselben Portkonflikt mit stillem Fallback auf die falsche Datenbank
(Embedding landete in der Dev-DB, ohne dass etwas auffiel). Fail-loud statt
fail-silent ist die richtige Richtung; offen bleibt, dass der Konflikt bei jedem
einzelnen Commit erneut auftritt.

WARUM ES TROTZDEM STOERT
Der belegende Prozess ist kein Unfall, sondern ein dauerhaft laufender
Entwicklungs-Port-Forward auf die k3d-Dev-DB. Solange er laeuft — also im
Normalbetrieb dieser Maschine — schlaegt JEDER Commit mit openspec-Aenderungen
fehl. Der Hook kostet dabei 3 Versuche a 5 s Wartezeit, bevor er aufgibt.

MOEGLICHE AUFLOESUNGEN (nicht entschieden)
a) OPENSPEC_EMBED_PF_PORT im Repo auf einen Port ausserhalb des ueblichen
   Entwicklungsbereichs vorbelegen, statt 15432 zu teilen.
b) Freien Port dynamisch waehlen, statt einen festen zu belegen — der Hook
   braucht den Port nur fuer die Dauer seines eigenen Laufs.
c) Beim erkannten Fremdprozess sofort aufgeben statt 3x5 s zu warten; der
   Zustand aendert sich innerhalb von 15 s erfahrungsgemaess nicht.
**10. dev-flow-chore Schritt 0 stasht den Haupt-Checkout ungefragt (Datenverlustrisiko bei Parallelsessions)** (degraded, skills/dev-flow-chore)

BEOBACHTUNG (T003055, 2026-08-09): Schritt 0 von dev-flow-chore schreibt vor:
  git stash && git pull --rebase origin main && git stash pop
Zum Ausfuehrungszeitpunkt liefen im Haupt-Checkout DREI fremde Agent-Sessions (claude PID 1291909 seit 19:49, claude PID 2154793 seit 20:46 — beide mit --dangerously-skip-permissions —, opencode PID 2165174 seit 20:48). Sie hatten 7 uncommittete Dateien offen; .github/workflows/{ai-review,ci,e2e-pr}.yml waren 2 Minuten zuvor (20:49:31) geschrieben worden, tests/spec/ci-cd/fetch-refspec-forced.bats war untracked.

WARUM RELEVANT: git stash ist eine Mutation des Arbeitsbaums, den ein anderer Prozess offen haelt. Schreibt die fremde Session zwischen stash und pop weiter, kollidiert der pop und die Aufloesung ist manuell. Der Skill hat dafuer KEINEN Guard — er setzt implizit voraus, dass der Haupt-Checkout dem ausfuehrenden Agenten allein gehoert.

VERIFIKATION: Skill-Text .claude/skills/dev-flow-chore/SKILL.md Schritt 0; Prozessliste via ps; Datei-mtimes via ls --time-style. Der Schritt wurde in diesem Durchlauf bewusst NICHT ausgefuehrt; stattdessen wurde der Worktree direkt mit `git worktree add -b <branch> <pfad> origin/main` angelegt, was den Haupt-Checkout nicht beruehrt.

VORSCHLAG: Vor dem Stash pruefen, ob der Arbeitsbaum dirty ist UND ein fremder Prozess darin arbeitet; in dem Fall den Stash ueberspringen und direkt von origin/main aus den Worktree anlegen (der Rebase des lokalen main ist fuer die Chore ohnehin nicht noetig — BASE ist origin/main).

Zusammenhang: siehe die beiden weiteren Mishaps dieses Durchlaufs (worktree-create.sh:190, agent-lock Sichtbarkeitsfenster).
### Mishap-Rollup — 10 Eintraege (2026-08-09 20:54 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | skills/dev-flow-chore | dev-flow-chore Schritt 0 stasht den Haupt-Checkout ungefragt (Risiko bei Parallelsessions) |
| 2 | degraded | scripts/worktree-create.sh | worktree-create.sh Divergence-Guard stasht den Haupt-Checkout (gleiche Klasse wie dev-flow-chore Schritt 0) |
| 3 | degraded | scripts/agent-lock.sh | agent-lock zeigt eine Session erst ab ihrem ersten Commit — Sichtbarkeitsluecke im Vorab-Check |
| 4 | drift | tests/spec/dev-flow-plan (BATS-Fixture-Erstellung) | printf mit fuehrendem "-" wird als Option statt Format-String interpretiert |
| 5 | process | tests/spec/dev-flow-plan (BATS-Fixture-Design) | B1b-Prosa-Test-Entwurf war durch sort -u Pfad-Dedup unwirksam (kein echtes RED) |
| 6 | drift | scripts/openspec-embed (post-commit hook) | openspec-embed post-commit Hook scheitert erneut an Port-15432-Konflikt |
| 7 | degraded | ticket-ops / scripts/agent-lock.sh + scripts/ticket.sh | Ticket-Locks der auftraggebenden Session blockieren den Abschluss durch Subagent, MCP-Server und post-merge |
| 8 | drift | scripts/preflight-pr-scope.sh | preflight-pr-scope.sh liest die ERSTE Ticket-ID im PR-Titel — Titel mit zwei IDs faellt faelschlich durch |
| 9 | drift | tests/spec (repo-weit) | Reihenfolge-Guards mit "grep -n … | head -1" brechen an sachfremden Einfuegungen — 19 Dateien betroffen |
| 10 | suspicious | skills/git-workflow · .gitattributes merge=ours | Konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte ohne Konfliktmeldung |

**1. dev-flow-chore Schritt 0 stasht den Haupt-Checkout ungefragt (Risiko bei Parallelsessions)** (degraded, skills/dev-flow-chore)

BEOBACHTUNG (T003055, 2026-08-09): Schritt 0 von dev-flow-chore schreibt vor:
    git stash && git pull --rebase origin main && git stash pop
Zum Ausfuehrungszeitpunkt liefen im Haupt-Checkout DREI fremde Agent-Sessions: claude PID 1291909 (seit 19:49), claude PID 2154793 (seit 20:46) — beide mit --dangerously-skip-permissions —, opencode PID 2165174 (seit 20:48). Sie hatten 7 uncommittete Dateien offen; .github/workflows/{ai-review,ci,e2e-pr}.yml waren zwei Minuten zuvor (20:49:31) geschrieben worden, tests/spec/ci-cd/fetch-refspec-forced.bats war untracked.

WARUM RELEVANT: `git stash` mutiert den Arbeitsbaum, den ein anderer Prozess offen haelt. Schreibt die fremde Session zwischen stash und pop weiter, kollidiert der pop und die Aufloesung ist manuell. Der Skill hat dafuer keinen Guard — er setzt implizit voraus, dass der Haupt-Checkout dem ausfuehrenden Agenten allein gehoert.

VERIFIKATION: Skill-Text (dev-flow-chore Schritt 0); Prozessliste via ps; Datei-mtimes via `ls --time-style=+%H:%M:%S`. Der Schritt wurde bewusst NICHT ausgefuehrt; stattdessen `git worktree add -b <branch> <pfad> origin/main`, was den Haupt-Checkout nicht beruehrt. Ergebnis war unauffaellig — die Chore lief vollstaendig durch (PR #4037 gemergt).

VORSCHLAG: Vor dem Stash pruefen, ob der Arbeitsbaum dirty ist UND ein fremder Prozess darin arbeitet; dann den Stash ueberspringen und den Worktree direkt von origin/main anlegen. Der Rebase des lokalen main ist fuer die Chore ohnehin entbehrlich, weil BASE bereits origin/main ist.

Zusammenhang: gleiche Fehlerklasse wie der Divergence-Guard in scripts/worktree-create.sh:190; verschaerft durch das Sichtbarkeitsfenster von agent-lock (beide separat gemeldet).
**2. worktree-create.sh Divergence-Guard stasht den Haupt-Checkout (gleiche Klasse wie dev-flow-chore Schritt 0)** (degraded, scripts/worktree-create.sh)

BEOBACHTUNG (T003055, 2026-08-09): Der Divergence-Guard in scripts/worktree-create.sh (Zeilen 166-214) synchronisiert lokales main auf origin/main. Ist der Haupt-Checkout dabei dirty, stasht er ihn:
    Zeile 189-199: if ! git diff --quiet HEAD; then git stash push -m "worktree-create-auto-stash" ...
    Zeile 201:     git pull --rebase origin main
    Zeile 213:     _wc_stash_pop_or_warn

WARUM RELEVANT: Identische Fehlerklasse wie dev-flow-chore Schritt 0 (separat gemeldet). Zum Ausfuehrungszeitpunkt liefen drei fremde Agent-Sessions mit 7 uncommitteten Dateien im Haupt-Checkout; lokales main lag 2 Commits hinter origin/main, der Guard haette also gefeuert. Bemerkenswert: das Skript ist gegen den EIGENEN Stash bereits sorgfaeltig abgesichert (T002673 hat die stillen `|| true` entfernt, damit ein fehlgeschlagener Pop nicht unbemerkt bleibt) — es kennt aber keinen Begriff davon, dass der Arbeitsbaum einem ANDEREN Prozess gehoeren koennte.

VERIFIKATION: Quelltext gelesen (Zeilen 166-226); Divergenz gemessen (`git rev-list --count HEAD..origin/main` = 2); fremde Prozesse via ps belegt. Der Guard wurde bewusst umgangen: `git worktree add -b <branch> <pfad> origin/main` legt den Worktree ohne jede Mutation des Haupt-Checkouts an. Das Ergebnis war korrekt — BASE ist ohnehin origin/main (Zeile 226), der Sync des lokalen main ist fuer die Korrektheit des Worktrees nicht erforderlich.

VORSCHLAG: Den Sync des lokalen main vom Anlegen des Worktrees entkoppeln. Der Worktree braucht nur origin/main als BASE; der Sync ist Hygiene fuer den Haupt-Checkout und sollte uebersprungen (mit Hinweis) statt erzwungen werden, wenn der Arbeitsbaum dirty ist und ein fremder Prozess darin arbeitet.
**3. agent-lock zeigt eine Session erst ab ihrem ersten Commit — Sichtbarkeitsluecke im Vorab-Check** (degraded, scripts/agent-lock.sh)

BEOBACHTUNG (T003055, 2026-08-09): `bash scripts/agent-lock.sh list` gab um ca. 20:51 nur die Kopfzeile aus — keine einzige Claim —, obwohl zu diesem Zeitpunkt drei fremde Agent-Sessions aktiv im Haupt-Checkout schrieben (Dateien mit mtime 20:49:31). Verlaesslich waren nur `ps` und die Datei-mtimes, nicht das Werkzeug, das fuer genau diese Frage gebaut ist.

URSACHE (verifiziert, kein genereller Defekt): Der main-checkout-Claim entsteht im pre-commit-Hook (.githooks/pre-commit:7, Label "auto: pre-commit self-claim"), also erst beim ERSTEN COMMIT einer Session — nicht ab Arbeitsbeginn. Belegt durch den Zeitstempel der Lock-Datei: $(git rev-parse --git-common-dir)/agent-locks/main-checkout.json traegt mtime 20:53, mein list-Aufruf lag ~2 Minuten davor. Spaeter erschien der Claim dann korrekt (SID b5cfa0f7).

WARUM RELEVANT: Zwischen Arbeitsbeginn und erstem Commit ist eine Session unsichtbar. Das ist genau das Fenster, in dem die Stash-Schritte aus dev-flow-chore Schritt 0 und worktree-create.sh:190 zuschlagen (beide separat gemeldet) — der Guard sieht die Session nicht, die er schuetzen muesste. Wer `agent-lock.sh list` als Vorab-Check auf konkurrierende Arbeit nutzt (so vorgesehen in dev-flow-chore Schritt 1, Test-only-Kurzpfad: "leer/keine fremde main-checkout-Claim?"), bekommt ein falsch-negatives Ergebnis und arbeitet inline im Haupt-Checkout weiter.

ABGRENZUNG: Die Lock-Mechanik selbst funktioniert (Claim/Release/Reap liefen im Durchlauf korrekt). Es geht ausschliesslich um den Zeitpunkt der Sichtbarkeit.

VORSCHLAG: Entweder die Dokumentation des Vorab-Checks um diese Luecke ergaenzen (eine leere Liste beweist NICHT, dass niemand arbeitet — zusaetzlich Prozess-/mtime-Pruefung), oder den Claim frueher setzen (bei Session-Start statt beim ersten Commit).
**4. printf mit fuehrendem "-" wird als Option statt Format-String interpretiert** (drift, tests/spec/dev-flow-plan (BATS-Fixture-Erstellung))

Beim Schreiben der BATS-Fixture tests/spec/dev-flow-plan/plan-lint-w3-prose-path.bats: `printf '- [ ] **Step 1: ...**\n\n'` scheitert mit "printf: - : invalid option", weil printf den fuehrenden Bindestrich als Optionsflag liest statt als Formatstring-Zeichen. Fix: `printf -- '...'`. Generisches Bash-Footgun beim Erzeugen von Markdown-Fixtures mit Checklisten-Bullets ("- [ ] ..."), kein Skill-/Repo-Defekt — koennte als Hinweis in die BATS-Fixture-Konventionen (CLAUDE.md) aufgenommen werden, da Markdown-Checklisten-Zeilen in Fixtures haeufig vorkommen.
**5. B1b-Prosa-Test-Entwurf war durch sort -u Pfad-Dedup unwirksam (kein echtes RED)** (process, tests/spec/dev-flow-plan (BATS-Fixture-Design))

Erster Entwurf von tests/spec/dev-flow-plan/plan-lint-b1b-prose-path.bats testete denselben Pfad (InboxApp.svelte) sowohl in der File-Structure-Tabelle als auch zusaetzlich in einem Prosa-Satz. Weil plan-lint.sh Pfad-Tokens vor der Verarbeitung per `sort -u` dedupliziert, war das Ergebnis unabhaengig davon, ob der Fix (struktureller Zeilenfilter) angewendet wurde oder nicht — der Test waere auch bei einem ungefixten Linter gruen gewesen (kein echtes RED, T002448-M4-widrig). Behoben durch Umstellung auf zwei DISTINKTE budget-erschoepfte Dateien: eine echte Tabellenzeile (InboxApp.svelte) und eine reine Prosa-Erwaehnung einer ANDEREN Datei (InboxDetail.svelte), die tatsaechlich nur ueber den ungefilterten Dokumentenscan gefunden werden kann. Lehrreich fuer aehnliche Positiv-/Negativ-Fixtures gegen dedupliziende Linter-Logik.
**6. openspec-embed post-commit Hook scheitert erneut an Port-15432-Konflikt** (drift, scripts/openspec-embed (post-commit hook))

Beim Commit fuer T002807 (openspec change plan-lint-w3-prose-path) schlug der openspec-embed post-commit Hook dreimal mit "Port 15432 wird von einem fremden Prozess belegt (kubectl port-forward -n workspace svc/shared-db)" fehl, bevor er non-fatal aufgab. Bekanntes, bereits dokumentiertes Verhalten (siehe User-MEMORY openspec-embed-port-collision.md) — kein neuer Defekt, aber weiterhin sichtbares Rauschen bei jedem Commit, solange ein k3d-dev-Port-Forward auf demselben Port laeuft. Nur zur Haeufigkeits-Dokumentation gemeldet, keine Handlungsaufforderung.
**7. Ticket-Locks der auftraggebenden Session blockieren den Abschluss durch Subagent, MCP-Server und post-merge** (degraded, ticket-ops / scripts/agent-lock.sh + scripts/ticket.sh)

Beobachtet 2026-08-09 in einem ticket-ops-Lauf, DREIMAL (Einheiten A, B, F eines Welle-1-Dispatch).

ABLAUF
ticket-ops Phase 3.6 schreibt vor, vor dem Dispatch fuer jedes Wave-Ticket `agent-lock.sh claim ticket <id>` auszufuehren. Das geschah fuer 14 Tickets. Die dispatchten Subagenten mergten ihre PRs erfolgreich — konnten die Tickets danach aber nicht schliessen:

    ERROR: Ticket T002825 ist gesperrt (agent-lock) — Status-Schreibvorgang verweigert.
           Halter: tool=claude, label=ticket-ops, sid=c9c84254-...
           Eigene SID: 06fb98cf-... (Shell-PID 142734)
           Falls der Halter diese Session ist, gezielt durchlassen: TICKET_LOCK_OVERRIDE=1

DREI AKTEURE, DIE AM EIGENEN LOCK SCHEITERN
(a) Der Subagent: hat gemergt, darf nicht schliessen (fremde SID) — korrektes Verhalten, aber es zerreisst den Vorgang.
(b) Der Lock-HALTER selbst: `ticket.sh` laeuft im ticket-mcp-Server unter EIGENER SID und sieht den Lock der aufrufenden Session als fremd. Ich hielt den Lock und wurde von ihm ausgesperrt.
(c) Laut Subagent-Meldung duerfte derselbe Lock auch post-merge.yml blockiert haben.

WARUM DER FEHLERTEXT IN DIE IRRE FUEHRT
Die Empfehlung "Falls der Halter diese Session ist, TICKET_LOCK_OVERRIDE=1" liest sich wie der vorgesehene Weg. Sie ist hier falsch: der Halter IST dieselbe logische Session, nur unter anderer SID — und ein Override haette den Schutz auch gegenueber echten Fremdsessions abgeschaltet. Der korrekte Ausweg war ein regulaeres `release` NACH getaner Arbeit, ohne Override.

STRUKTURELLER KERN
Der Mechanismus gegen Doppelbearbeitung verhindert hier nicht die Doppelbearbeitung, sondern den ABSCHLUSS — und zwar fuer drei verschiedene Prozesse derselben Arbeit. Die Annahme "eine Session = eine SID" haelt nicht, sobald MCP-Server, Subagenten und CI-Workflows im selben Vorgang schreiben.

ZU ERWAEGEN (nicht entschieden)
- ticket-ops Phase 3.6: Lock nach dem Dispatch freigeben statt bis zum Abschluss halten — der Worktree ist dann der Kollisionsschutz.
- Oder eine Vererbungskennung (Parent-SID), damit Subagent und MCP-Server als derselbe Halter gelten.
- Mindestens: den Fehlertext um den regulaeren Release-Pfad ergaenzen, statt nur den Override zu nennen.

VERWANDT: T002849 (Lebendigkeitserkennung in agent-lock.sh), T002826 (stiller claim-Fehlschlag), Buffer-Eintrag "agent-lock zeigt eine Session erst ab ihrem ersten Commit" vom selben Tag.
**8. preflight-pr-scope.sh liest die ERSTE Ticket-ID im PR-Titel — Titel mit zwei IDs faellt faelschlich durch** (drift, scripts/preflight-pr-scope.sh)

Beobachtet 2026-08-09 beim Anlegen von PR #4043.

VERIFIZIERT (scripts/preflight-pr-scope.sh:46 und :52):
    TICKET_ID="$(echo "$TITLE" | grep -oP '\[T\d{6}\]|T\d{6}' | tr -d '[]' | head -n 1 || true)"
    ...
    if [[ "$BRANCH_LC" != *"$TICKET_LC"* ]]; then
      echo "preflight-pr-scope: FATAL: PR title ticket ID '$TICKET_ID' does not match current branch name ..."

`head -n 1` nimmt die erste ID im Titel — unabhaengig davon, ob sie das bearbeitete Ticket bezeichnet. Ein Titel, der ein anderes Ticket ERWAEHNT bevor er das eigene nennt (hier: eine Referenz auf T002629 vor dem eigentlichen [T002825]), scheitert mit FATAL, obwohl Branch und Arbeitsticket zusammenpassen.

WARUM DAS ZAEHLT
Der Guard prueft nicht, was er zu pruefen vorgibt. Seine Aussage soll sein "der PR gehoert zum Branch"; gemessen wird "die erste Zeichenkette im Titel, die wie eine Ticket-ID aussieht, steht im Branchnamen". Die Fehlermeldung schlaegt dann eine Branch-Umbenennung auf das FALSCHE Ticket vor (`_suggested_branch="${CURRENT_BRANCH}-${TICKET_LC}"`) — wer ihr folgt, benennt den Branch nach dem nur erwaehnten Ticket um.

Der Workaround (Zweitticket in den Body statt in den Titel) funktioniert, ist aber unsichtbar, solange man den Guard nicht liest.

ZU ERWAEGEN: alle IDs im Titel einsammeln und den Guard bestehen lassen, wenn IRGENDEINE davon zum Branch passt — statt nur der ersten. Das ist dieselbe Klasse wie die Reihenfolge-Guards mit `grep -n … | head -1`: der erste Treffer ist nicht der gemeinte Treffer.

Gefunden waehrend eines ticket-ops-Welle-1-Dispatch (Einheit F).
**9. Reihenfolge-Guards mit "grep -n … | head -1" brechen an sachfremden Einfuegungen — 19 Dateien betroffen** (drift, tests/spec (repo-weit))

Beobachtet 2026-08-09 waehrend eines ticket-ops-Welle-1-Dispatch (Einheit A, PR #4046).

WAS PASSIERTE
Der bestehende Guard tests/spec/dev-flow-chore-ticket-ops-mishaps.bats (aus T001210) prueft, dass eine Dedupe-Regel hinter der Ueberschrift "## 4." in repo-hygiene-ops.md steht. Er sucht dazu den ERSTEN `dedup`-Treffer im GANZEN Dokument und vergleicht dessen Zeilennummer. Ein neu hinzugefuegter Verweis in §3 kam ihm zuvor — der Guard wurde rot, obwohl §4 voellig unveraendert blieb.

Gefixt durch Einschraenkung der Suche auf den Bereich ab "## 4." — das ist die Aussage, die der Guard treffen wollte.

REICHWEITE (verifiziert)
    $ grep -rlE 'grep -n[^|]*\| *head -1' tests/spec/ | wc -l
    19
Neunzehn Guard-Dateien tragen dasselbe Muster, darunter tests/spec/dev-flow-plan.bats, ticket-system.bats, openspec-workflow.bats, mishap-categorize-erden.bats. Nicht jeder davon ist zwangslaeufig defekt — aber jeder, der eine Reihenfolge- oder Positionsaussage trifft, ist gegen unverwandte Einfuegungen oberhalb der gemeinten Stelle nicht robust.

STRUKTURELLER KERN
Der Guard misst die Position des ersten Zufallstreffers statt der Aussage, die er treffen will. Ein solcher Test wird rot, ohne dass das Geprueefte sich geaendert hat, und meldet damit einen Defekt, den es nicht gibt — er kostet Diagnosezeit an der falschen Stelle und erzeugt Druck, die eigentlich korrekte Aenderung zurueckzunehmen.

Das ist dieselbe Familie wie die Konvention T002716 ("Semantik statt Darstellung"): dort bricht eine Zusicherung am Ausgabeformat eines Werkzeugs, hier an der Dokumentposition eines beliebigen anderen Treffers. Die Regel deckt diesen Fall bislang nicht ausdruecklich ab.

ZU ERWAEGEN: die Suche in solchen Guards grundsaetzlich auf den relevanten Abschnitt eingrenzen (awk-Bereichsmuster oder sed-Range), statt eine dokumentweite Suche mit `head -1` zu beschneiden. Und T002716 um den Positions-Fall erweitern.
**10. Konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte ohne Konfliktmeldung** (suspicious, skills/git-workflow · .gitattributes merge=ours)

Beobachtet 2026-08-09 waehrend eines ticket-ops-Welle-1-Dispatch (Einheit B, PR #4050).

WAS PASSIERTE
Ein `git rebase` gegen origin/main lief KONFLIKTFREI durch. Dabei wurden die mitcommitteten generierten Artefakte website/src/data/test-inventory.json und docs/code-quality/repo-index.json ohne jede Konfliktmeldung auf die main-Version aufgeloest und fielen damit aus dem Commit. `task freshness:check` wurde daraufhin erneut rot — nachdem er vor dem Rebase gruen war.

Ursache ist der merge=ours-Treiber in .gitattributes fuer die Freshness-Generate: er loest zugunsten einer Seite auf, statt einen Konflikt zu melden. Das ist fuer den Merge-Fall gewollt (sonst konfligierte jeder PR an diesen Dateien), hat im Rebase-Fall aber die Nebenwirkung, dass eigene, absichtlich mitgefuehrte Regenerate still verschwinden.

STRUKTURELLER KERN
Ein gruener Rebase belegt NICHT, dass die Artefakte noch im Commit sind. Das Erfolgssignal des Rebase sagt nichts ueber die Vollstaendigkeit seines Ergebnisses — dieselbe Familie wie "der Erfolg des LETZTEN Kommandos in einer Kette sagt nichts ueber den Erfolg des vorherigen" (T002815) und wie die soeben in repo-hygiene-ops §3 aufgenommene Regel "ein leeres Signal ist kein Urteil".

Besonders tueckisch, weil die Gegenprobe billig ist und trotzdem niemand sie faehrt: nach dem Rebase `git show --stat HEAD` auf die Artefaktpfade oder schlicht `task freshness:check` erneut laufen lassen.

ZU ERWAEGEN: in git-workflow nach jedem Rebase eine Freshness-Nachpruefung vorschreiben, bevor gepusht wird — und explizit benennen, dass merge=ours hier ohne Konfliktmarker zuschlaegt.

VERWANDT: T002823 (merge=ours-Phantomkonflikt gegenueber GitHub — dieselbe .gitattributes-Ursache, andere Richtung).
## Kanonischer Rollup-Container (Entscheidung ticket-ops 2026-08-09)

**Dieses Ticket NICHT schliessen.** Der Hinweis stammt aus dem Vorgaenger-Container T002784 und gilt hier unveraendert weiter:

Ein geschlossener oder blockierter Container laesst den Mishap-Flush ins Leere laufen, **ohne dass es auffaellt**. Genau diese Kette ist bereits zweimal gerissen:

- T002783: die Vorgaenger T002597 und T002601 standen beide auf `done` und waren damit fuer `scripts/factory/mishap-rollup.sh` unsichtbar.
- 2026-08-09: T002784 stand auf `blocked` und wurde ebenfalls nicht mehr aufgeloest; dieser Container hier musste manuell angelegt werden, weil `ticket.sh rollup-container` zusaetzlich am Leerfall-Defekt T003068 scheiterte.

Konsequenz: Der Container muss auf einem **offenen, nicht-terminalen** Status stehen (`triage`). T002784 wurde als `done/obsolete` geschlossen, `duplicate_of` → T003067.

Verwandt: T003068 (rollup-container kann sich bei leerer Trefferliste nicht selbst heilen) — solange dieser Defekt besteht, ist der Container hier die einzige Absicherung des Mishap-Meldewegs.
### Mishap-Rollup — 10 Eintraege (2026-08-09 21:40 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | tests/spec (repo-weit) · Shell-Konventionen | grep -qF schuetzt NICHT vor Options-Parsing — jeder Guard, der auf ein CLI-Flag im Text greppt, scheitert |
| 2 | suspicious | skills/repo-hygiene · gh-Warteschleifen | gh pr checks --jq 'all(...)' ist auf der leeren Checkliste vakuos true — CI-Warteschleife bricht sofort ab |
| 3 | degraded | scripts/agent-lock.sh | agent-lock.sh check detektiert SID nicht aus Worktree-Pfaden — TICKET_LOCK_OVERRIDE als Workaround nötig |
| 4 | process | dev-flow-plan | dev-flow-plan Schritt 5 verlangt ticket-scoped agent-lock, den der ticket-ops-Dispatch verbietet |
| 5 | suspicious | scripts/plan-qa-check.sh | plan-qa-check.sh liefert Parse-Fehler statt inhaltlicher QA-Rückmeldung |
| 6 | drift | scripts/plan-touched-files.sh | touched_files-Ableitung nimmt reine Lesebefehl-Pfade als geänderte Dateien auf |
| 7 | suspicious | skills/dev-flow-plan · scripts/hooks/worktree-write-guard.sh | worktree-write-guard blockiert Sub-Agenten in vom Orchestrator vorbereiteten Worktrees ohne eigenen agent-lock-Claim |
| 8 | drift | scripts/openspec-embed-local.sh | openspec-embed-local.sh scheitert weiterhin an Port-15432-Kollision bei Plan-Stage-Commits (bekanntes Muster, erneut bestaetigt) |
| 9 | degraded | skills/ticket-ops + skills/dev-flow-plan + scripts/hooks/worktree-write-guard.sh | Drei Regelwerke widersprechen sich beim agent-lock-Scope — Planungsagenten kommen ohne bewusste Abweichung nicht durch |
| 10 | suspicious | skills/ticket-ops Phase 1 (Dedupe-Guard) | ticket-ops-Dedupe-Guard vergleicht Titel exakt und fand 1 von 6 Dubletten — die dominante Dublettenklasse entgeht ihm strukturell |

**1. grep -qF schuetzt NICHT vor Options-Parsing — jeder Guard, der auf ein CLI-Flag im Text greppt, scheitert** (drift, tests/spec (repo-weit) · Shell-Konventionen)

Beobachtet 2026-08-09 waehrend eines ticket-ops-Welle-1-Dispatch (Einheit B) beim Schreiben eines Guards, der die Erwaehnung von `--draft` in einem Skill-Dokument pruefen sollte.

VERIFIZIERT (Output-Verifikation, im Hauptcheckout nachgestellt):
    $ echo "text mit --draft drin" | grep -qF '--draft'; echo "exit=$?"
    ugrep: invalid option --draft, did you mean --decompress, --delay=, --depth=, ...
    exit=2

    $ echo "text mit --draft drin" | grep -qF -e '--draft'; echo "exit=$?"
    mit -e: exit=0

`-F` macht das Muster nur zu einer festen Zeichenkette statt einer Regex — es verhindert NICHT, dass das Argument zuvor als Option geparst wird. Nur `-e` (oder `--`) markiert es als Muster.

WARUM DAS ZAEHLT
Der Exit-Code ist 2, nicht 1. Ein Guard der Form `grep -qF '--flag' datei || fail` bricht damit nicht mit "nicht gefunden" ab, sondern mit einem Werkzeugfehler — und in einer `if`-Bedingung sind beide ununterscheidbar falsch. Der Test meldet dann "das Flag fehlt im Dokument", obwohl es dasteht. Betrifft jeden Guard, der ein CLI-Flag, einen Long-Option-Namen oder irgendein mit `-` beginnendes Token im Text sucht — und das ist in einem Repo mit dokumentierten Runbooks kein Randfall.

NEBENBEFUND ZUM UMFELD: Die Fehlermeldung stammt von `ugrep`, nicht von GNU grep — auf diesem Host ist `grep` ein ugrep-Alias. Der Wortlaut der Meldung unterscheidet sich damit zwischen lokaler Shell und CI-Runner; ein Guard, der auf den Meldungstext prueft, waere aus genau diesem Grund unzuverlaessig (T002716).

VERWANDT: Buffer-Eintrag "printf mit fuehrendem '-' wird als Option statt Format-String interpretiert" vom selben Tag — dieselbe Klasse bei einem anderen Werkzeug. Es lohnt, das als eine Regel zu fassen statt als zwei Einzelfaelle.
**2. gh pr checks --jq 'all(...)' ist auf der leeren Checkliste vakuos true — CI-Warteschleife bricht sofort ab** (suspicious, skills/repo-hygiene · gh-Warteschleifen)

Beobachtet 2026-08-09 waehrend eines ticket-ops-Welle-1-Dispatch (Einheit B, PR #4050).

WAS PASSIERTE
Der PR stand auf mergeStateStatus=DIRTY. Bei einem Konflikt startet GitHub die CI gar nicht erst — die Checkliste bleibt LEER. Eine Warteschleife der Form

    gh pr checks <n> --json bucket --jq 'all(.bucket != "pending")'

liefert auf der leeren Liste `true`. Das ist die korrekte jq-Semantik (`all` ueber eine leere Menge ist wahr), aber die Schleife liest daraus "keine Checks mehr pending" und bricht sofort ab. Der Zustand liest sich als "CI durchgelaufen", waehrend in Wahrheit nie eine Pruefung stattgefunden hat.

BELASTBAR IST ERST: `mergeStateStatus != DIRTY` UND eine NICHTLEERE Checkliste. Nach einem Rebase erschienen 15 Checks.

VERHAELTNIS ZU T002822 (im SELBEN Lauf behoben, PR #4046)
T002822 beschrieb dieselbe Ursache (CONFLICTING PR unterdrueckt CI) und wurde in repo-hygiene-ops.md §3 unter der neuen Regel "ein leeres Signal ist kein Urteil" aufgenommen, mit der Gegenprobe ueber mergeStateStatus und einen lokalen Probe-Merge.

GEPRUEFT, OB BEREITS ABGEDECKT — NEIN: Die neue §3-Fassung auf origin/main enthaelt keine Stelle zu `all(...)`, `jq` in diesem Zusammenhang oder zum vakuosen Wahrheitswert ueber leeren Mengen. Sie warnt davor, eine leere Checkliste als Urteil zu LESEN; sie deckt nicht den Fall, dass ein AUTOMATISIERTES Praedikat sie stillschweigend als Erfolg auswertet. Das ist die schaerfere Variante: bei der manuellen Lesart sieht man wenigstens die leere Liste, bei der Warteschleife sieht man nur `true`.

ZU ERWAEGEN: §3 um eine Zeile zum vakuosen `all()` ergaenzen und, wo im Repo solche Warteschleifen existieren (devflow-ci-watch.sh, Auto-Merge-Wartepfade), die Nichtleere-Bedingung ergaenzen. Allgemeiner: jedes Praedikat ueber einer moeglicherweise leeren Menge braucht eine vorgeschaltete Nichtleere-Pruefung — dieselbe Struktur wie die Positiv-Anker-Pflicht bei Negativtests (T002356-M1), wo ein Test ueber einer leeren Kandidatenliste ebenfalls vakuos besteht.
**3. agent-lock.sh check detektiert SID nicht aus Worktree-Pfaden — TICKET_LOCK_OVERRIDE als Workaround nötig** (degraded, scripts/agent-lock.sh)

BEOBACHTUNG (2026-08-09, T002807 + T002849): `agent-lock.sh check ticket <id>` meldet stets `Eigene SID: <nicht gesetzt>` bei Aufrufen aus einem `.worktrees/`-Pfad, obwohl `check-and-claim` (gleiche Session, gleicher Worktree-Pfad) den Lock erfolgreich anlegt. `ticket.sh update-status` bricht deshalb mit Exit 7 ab (`Ticket X ist gesperrt`). Workaround: `TICKET_LOCK_OVERRIDE=1 bash scripts/ticket.sh update-status ...`.

VERIFIZIERT: sowohl in `.worktrees/plan-lint-w3-prosa-T002807` als auch in `.worktrees/agent-lock-liveness-T002849` reproduziert. Der Hauptcheckout (`/home/patrick/Bachelorprojekt`) zeigt das Problem nicht — `check` meldet dort `mine`.

URSACHE VERMUTET: `_my_sid()` in `agent-lock.sh` nutzt `git rev-parse --show-toplevel` o.Ä. als Pfadanker, der in Worktrees (deren `.git` eine Datei mit `gitdir:`-Verweis ist) anders auflöst. Die `check-and-claim`-Funktion ermittelt die SID über einen anderen Code-Pfad (`scripts/agent-lock-identity.sh`).
**4. dev-flow-plan Schritt 5 verlangt ticket-scoped agent-lock, den der ticket-ops-Dispatch verbietet** (process, dev-flow-plan)

Bei T002999 (Welle-1-Dispatch) standen zwei Vorgaben gegeneinander:

1. Der Dispatch verbietet ausdruecklich einen agent-lock im **ticket**-Scope (T003102 — blockiert den spaeteren Abschluss).
2. `dev-flow-plan` Schritt 5 (Pre-Commit Guard, Punkt 3) verlangt genau diese Lock-Datei: `$(git rev-parse --git-common-dir)/agent-locks/ticket__<ID>.json` — fehlt sie, soll der Commit mit FATAL abbrechen.

Zusaetzlich blockierte `scripts/hooks/worktree-write-guard.sh` jeden Write im eigenen Worktree, solange gar kein Claim existierte. Aufloesung war ein **branch**-scoped Claim (`agent-lock.sh claim branch`) — Regel 2 des Guards greift auf den Branch-Claim, nicht auf den Ticket-Claim. Damit sind beide Vorgaben erfuellbar, aber das steht nirgends: Schritt 5 nennt nur den Ticket-Claim.

Nebenbefund zur Meldung des Guards: unter "Dieser Session gehoeren:" listet er die Worktrees **fremder** Sessions (hier zwei andere T003xxx-Worktrees, doppelt). Das liest sich, als besaesse die eigene Session diese Verzeichnisse, und fuehrt beim Debuggen in die falsche Richtung.

Vorschlag: Schritt 5 Punkt 3 auf "ticket- ODER branch-scoped Claim" lockern und die Guard-Meldung auf "Geclaimt von anderen Sessions" umformulieren.
**5. plan-qa-check.sh liefert Parse-Fehler statt inhaltlicher QA-Rückmeldung** (suspicious, scripts/plan-qa-check.sh)

Beim Plan-Stage für T003077 (openspec-embed-dynamic-port) lieferte die advisory LLM-QA (scripts/plan-qa-check.sh) in Iteration 2 "FAIL — Missing criteria: Could not parse missing items" statt einer inhaltlichen Rückmeldung — ein Parse-Fehler des LLM-Antwortformats, keine echte Lücke (das harte Gate scripts/plan-lint.sh war zu diesem Zeitpunkt bereits PASS). Nicht blockierend (Skill-Konvention: bricht nie, `|| true`), aber Rauschen, das potenziell bei jedem Plan-Stage-Lauf auftritt und den Nutzen der advisory QA mindert.
**6. touched_files-Ableitung nimmt reine Lesebefehl-Pfade als geänderte Dateien auf** (drift, scripts/plan-touched-files.sh)

scripts/ticket.sh stage-plan (Ableitung via plan-touched-files.sh) trug für T003077 (openspec-embed-dynamic-port) docs/code-quality/baseline.json und docs/code-quality/gates.yaml als touched_files ein, obwohl der Plan diese Dateien nur per jq/grep-Lesebefehl referenziert (zur S1-Budget-Ermittlung in der Plan-Prosa), nicht verändert. touched_files zeigt dadurch zwei Dateien, die dieser Fix nicht anfasst — die Ableitung unterscheidet nicht zwischen "im Plan als MODIFIED/NEW markierter Pfad" und "im Plan als Lesebefehl-Argument zitierter Pfad".
**7. worktree-write-guard blockiert Sub-Agenten in vom Orchestrator vorbereiteten Worktrees ohne eigenen agent-lock-Claim** (suspicious, skills/dev-flow-plan · scripts/hooks/worktree-write-guard.sh)

Beobachtet 2026-08-09 waehrend eines ticket-ops-Welle-1-Dispatch fuer T003075. Der Dispatch-Prompt wies an, ausschliesslich im vom Orchestrator vorab angelegten Worktree /home/patrick/Bachelorprojekt/.worktrees/freshness-gate-artifacts-T003075 zu arbeiten, und untersagte explizit einen ticket-scoped agent-lock-Claim ("KEIN agent-lock im ticket-Scope (T003102)"). Der erste Write-Tool-Aufruf auf einen Pfad unter diesem Worktree wurde dennoch von scripts/hooks/worktree-write-guard.sh abgelehnt: der Guard erlaubt Schreibzugriffe nur unter Pfaden, die per agent-lock.sh claim branch/ticket IN DIESER SESSION geclaimt wurden — ein vom Orchestrator vorab angelegter Worktree ohne eigenen Claim der Sub-Agenten-Session zaehlt nicht als "eigener" Pfad. Geloest durch `bash scripts/agent-lock.sh claim branch "fix/freshness-gate-artifacts-T003075" --worktree "$PWD" --label dev-flow-plan` vor dem ersten Write — das ist ein BRANCH-Scope-Claim, kein TICKET-Scope-Claim, widerspricht also der Anweisung nicht direkt, aber die Unterscheidung war im Dispatch-Prompt nicht klar genug: der Fehler musste erst live gegen den Write-Guard reproduziert werden, um zu verstehen, welcher Claim fehlte. Vorschlag: Dispatch-Prompts fuer ticket-ops-Wellen, die einen vorab angelegten Worktree uebergeben, sollten explizit nennen, ob/welcher agent-lock-Claim (branch vs. ticket) vom Sub-Agenten selbst noch zu setzen ist, um Write-Zugriff zu erhalten.
**8. openspec-embed-local.sh scheitert weiterhin an Port-15432-Kollision bei Plan-Stage-Commits (bekanntes Muster, erneut bestaetigt)** (drift, scripts/openspec-embed-local.sh)

Beim Plan-Stage-Commit fuer T003075 (2026-08-09) loeste der post-commit-Hook openspec-embed-local.sh aus, welches 3x mit "Port 15432 wird von einem fremden Prozess belegt (kubectl port-forward svc/shared-db)" scheiterte, bevor es non-fatal aufgab. Kein neuer Befund — deckt sich mit dem bereits dokumentierten Muster (openspec-embed scheitert an Port 15432, k3d-Forward belegt ihn). Bestaetigt lediglich, dass das Problem in Multi-Session-Umgebungen mit parallelen kubectl-Port-Forwards weiterhin regelmaessig auftritt und bei jedem betroffenen Plan-Stage-Commit sichtbare Fehlermeldungen erzeugt (non-fatal, aber Rauschen im Session-Log).
**9. Drei Regelwerke widersprechen sich beim agent-lock-Scope — Planungsagenten kommen ohne bewusste Abweichung nicht durch** (degraded, skills/ticket-ops + skills/dev-flow-plan + scripts/hooks/worktree-write-guard.sh)

Beobachtet 2026-08-09 in einem ticket-ops-Welle-1-Dispatch mit 6 parallelen dev-flow-plan-Agenten. VERIFIZIERT durch Code-Lesung, nicht nur berichtet.

DER WIDERSPRUCH (drei Stellen, paarweise unvereinbar):

(a) ticket-ops Step 3.6 (.claude/skills/references/ticket-ops-procedures.md) schreibt vor:
    `agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label ticket-ops`

(b) T003102 belegt (dort dreimal in einem einzigen Lauf beobachtet), dass genau dieser
    ticket-scoped Lock danach den ABSCHLUSS blockiert: Subagent, ticket-mcp-Server und
    post-merge.yml schreiben je unter eigener SID und sehen den Lock der aufrufenden
    Session als fremd. Der Halter sperrt sich selbst aus.

(c) dev-flow-plan/SKILL.md:217 fordert dieselbe Datei fail-closed als Vorbedingung des
    Stage-Commits:
        LOCK_FILE="$(git rev-parse --git-common-dir)/agent-locks/ticket__${TICKET_EXT_ID}.json"
        [ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock-Claim ..."; exit 1; }

(d) scripts/hooks/worktree-write-guard.sh Regel 2 (Zeile 147-165) verweigert ohne
    irgendeinen eigenen Claim jeden Write im zugewiesenen Worktree — exit 2.

WAS TATSAECHLICH PASSIERTE: Der Orchestrator untersagte den Agenten wegen (b) den
ticket-Lock. Daraufhin blockierte (d) bei 4 von 6 Agenten den ersten Testdatei-Write.
Alle vier loesten es unabhaengig voneinander identisch auf — branch-scoped Claim, auf
den Regel 2 ebenfalls greift. Zwei weitere Agenten (T003068, T003077) setzten entgegen
der Anweisung doch ticket-Locks; diese mussten nach dem Lauf manuell freigegeben werden,
um die (b)-Blockade zu vermeiden.

DIE AUFLOESUNG, DIE NIRGENDS DOKUMENTIERT IST:
    bash scripts/agent-lock.sh claim branch <branch> --worktree <pfad> --branch <branch>
Der branch-scoped Claim befriedigt (d), erfuellt den Zweck des Kollisionsschutzes und
erzeugt die Abschluss-Blockade aus (b) NICHT. Er steht derzeit in keinem der drei
Regelwerke — jeder Agent musste ihn neu herleiten.

ZU AENDERN:
1. ticket-ops Step 3.6: claim branch statt claim ticket vorschreiben.
2. dev-flow-plan Schritt 5 Punkt 3: branch-scoped Lock-Datei akzeptieren
   (branch__<slug>.json) statt ticket__<id>.json fail-closed zu fordern.
3. Beide Stellen mit einem Verweis auf T003102 versehen, damit die Begruendung nicht
   erneut hergeleitet werden muss.

Hinweis: WORKTREE_GUARD_BYPASS=1 per Bash-Export wirkt NICHT — der Hook laeuft pro
Tool-Aufruf in einem eigenen Prozess (von einem Agenten geprueft).
**10. ticket-ops-Dedupe-Guard vergleicht Titel exakt und fand 1 von 6 Dubletten — die dominante Dublettenklasse entgeht ihm strukturell** (suspicious, skills/ticket-ops Phase 1 (Dedupe-Guard))

Beobachtet 2026-08-09 im ticket-ops-Vollduchlauf ueber 88 offene Tickets. GEMESSEN, nicht vermutet: die Exakt-Titel-Query fand genau ein Paar, die manuelle semantische Durchsicht fuenf weitere.

DIE QUERY (Skill-Body-Invariante "Dedupe-Guard vor jeder Intake-Zeile"):
    GROUP BY lower(regexp_replace(title,'\s+',' ','g')) HAVING count(*) > 1
Sie findet nur Tickets mit WORTGLEICHEM Titel.

GEFUNDEN: 1 Paar (T002784 / T003067, beide "Mishap Rollup — fortlaufende Sammlung").

UEBERSEHEN: 5 Paare, alle semantisch identisch, alle mit unterschiedlichem Titel:
- T002765 / T002911 — beide scripts/plan-touched-files.sh nimmt Prosa-Pfade auf.
  Beide nennen sogar DASSELBE Beispiel: docs/code-quality/gates.yaml.
- T003077 / T003101 — beide openspec-embed scheitert an Port-15432-Kollision.
- T002877 / T002910 — beide openspec-embed completeness gate (12/57 bzw. 14/58 Dokumente).
- T003001 / T003006 — beide spec-tracked-file-guard.bats unter bats -j, beide aus PR #3974.
- T003078 / T003096 — wortgleiche BESCHREIBUNG, minimal abweichender Titel (der Guard
  vergleicht nur den Titel, deshalb entging auch dieses Paar).

WARUM DAS STRUKTURELL IST: Die dominante Dublettenquelle in diesem Repo sind
Mishap-Reports. Jeder wird unabhaengig formuliert — dieselbe Beobachtung, andere Worte.
Ein Titelvergleich kann diese Klasse per Konstruktion nicht fassen. Waehrend dieses
Laufs meldete ein Planungsagent den plan-touched-files-Defekt zum VIERTEN Mal als
vermeintlich neuen Befund.

VORHANDENE BAUSTEINE FUER EINEN BESSEREN GUARD:
- mcp__factory-mcp__openspec_find_similar (semantische Aehnlichkeitssuche, bereits im Einsatz)
- bge-mcp (bge_embed + bge_rerank)
- Als billige Naeherung ohne Embedding: Gleichheit von (component, areas) plus
  Ueberlappung der in der Beschreibung genannten Dateipfade. Alle fuenf uebersehenen
  Paare teilen Komponente UND mindestens einen Dateipfad — diese Heuristik allein
  haette sie gefunden.

FOLGEKOSTEN, falls unveraendert: Beinahe-Duplikate werden getrennt geplant und getrennt
dispatcht. In diesem Lauf haette das drei Agenten gleichzeitig an denselben roten
Shard-4-Guard gesetzt (T002941 / T003001 / T003006).
### Mishap-Rollup — 10 Eintraege (2026-08-09 23:49 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | scripts/hooks/worktree-write-guard.sh | worktree-write-guard: SID-basiertes Besitzmodell unterscheidet nebenlaeufige Subagenten einer Session nicht — Meldung fuehrt in die Irre |
| 2 | suspicious | skills/ticket-ops Step 3.6 (Dispatch-Prompt) | ticket-ops-Dispatchvorlage sagt nicht, welchen Lock-Scope der Subagent selbst setzen soll |
| 3 | process | skills/repo-hygiene (repo-hygiene-ops.md §1) | repo-hygiene §1: Freshness-Generat macht jeden fertigen Worktree dauerhaft dirty — `worktree remove` ohne `--force` schlägt regelhaft fehl |
| 4 | process | scripts/ticket.sh + ticket-mcp (mishap-buffer) | Mishap-Buffer kennt keinen Rücknahmepfad — ein behobener Befund erscheint beim Flush trotzdem als offener Punkt im Rollup |
| 5 | drift | scripts/openspec.sh | Half-archived change mcp-config-mutation-race detected during repo-hygiene |
| 6 | suspicious | ci/freshness-gate | Archive PR #4083 failed freshness gate — openspec-status.json not committed after archive |
| 7 | suspicious | scripts/factory/babysit-prs.sh | babysit-prs.sh entfernt Worktrees ohne den live-Lock-Guard aus T002896 |
| 8 | degraded | Taskfile.yml:test:changed | test:changed startet Live-E2E gegen korczewski bei reiner openspec/-Aenderung |
| 9 | drift | scripts/validate-commit-msg.sh | Commit-Scope 'openspec' abgelehnt, obwohl das ganze Repo von OpenSpec spricht |
| 10 | degraded | scripts/openspec.sh | openspec.sh archive skaliert nicht im Batch (~3s pro Change, Node-Start je Delta) |

**1. worktree-write-guard: SID-basiertes Besitzmodell unterscheidet nebenlaeufige Subagenten einer Session nicht — Meldung fuehrt in die Irre** (degraded, scripts/hooks/worktree-write-guard.sh)

Beobachtet 2026-08-09 bei einem ticket-ops-Dispatch mit 6 parallelen Subagenten. WICHTIG: Der urspruengliche Agentenbericht war ungenau; die hier beschriebene Fassung ist gegen den Quellcode korrigiert.

BERICHTET WURDE: "Die Meldung listet unter 'Dieser Session gehoeren:' die Worktrees FREMDER Sessions auf."

TATSAECHLICH (scripts/hooks/worktree-write-guard.sh:132-157): `MY_WTS` sammelt alle
Worktrees, deren Lock-Owner dieselbe SID traegt. Alle sechs Subagenten liefen unter
DERSELBEN Session-SID (im Lock-Bestand nachgeprueft: sechs branch-Claims, identisches
owner_sid). Aus Sicht des Guards gehoerten die Worktrees also korrekt "dieser Session".
Die Meldung ist im Modell des Guards richtig — sie wurde nur als "fremd" gelesen.

DER EIGENTLICHE DEFEKT liegt eine Ebene tiefer: das SID-basierte Besitzmodell kann
NEBENLAEUFIGE SUBAGENTEN einer Session nicht voneinander unterscheiden. Fuer Regel 2
(Zeile 147-152) heisst das: Agent A darf in Agent B's Worktree schreiben, weil beide
dieselbe SID tragen. Der Guard schuetzt gegen fremde SESSIONS, nicht gegen paralleles
Arbeiten INNERHALB einer Session — genau das Szenario, das ticket-ops erzeugt.

DAS IST DIESELBE GEBROCHENE ANNAHME WIE IN T003102: "eine Session = eine SID" haelt
nicht, sobald MCP-Server, Subagenten und CI-Workflows im selben Vorgang schreiben.
Dort verhindert sie den Abschluss, hier den Schutz. Beide Tickets sollten gemeinsam
betrachtet werden — eine Vererbungskennung (Parent-SID plus Actor-Kennung) wuerde
beide Faelle adressieren.

ZUSATZBEFUND: In der Auflistung erschienen Worktrees doppelt. Ursache ist plausibel,
dass mehrere Locks unterschiedlichen Scopes (branch- und worktree-Scope) auf denselben
Pfad zeigen und die Schleife jeden Treffer anhaengt, ohne zu deduplizieren
(Zeile 138: `MY_WTS+=("$wt")` ohne Existenzpruefung).

KLEINE VERBESSERUNG UNABHAENGIG DAVON: Die Meldezeile "Dieser Session gehoeren:" sollte
sagen, WOHER der Besitz stammt (z. B. "Claims dieser SID (auch anderer Subagenten):"),
damit sie nicht als Eigenbesitz des aufrufenden Akteurs gelesen wird. Genau diese
Fehllesung kostete beim Debuggen Zeit.
**2. ticket-ops-Dispatchvorlage sagt nicht, welchen Lock-Scope der Subagent selbst setzen soll** (suspicious, skills/ticket-ops Step 3.6 (Dispatch-Prompt))

Beobachtet 2026-08-09, von einem der sechs Welle-1-Agenten ausdruecklich als Verbesserungswunsch zurueckgemeldet ("Dispatch-Prompt sollte kuenftig klarstellen, welcher Claim (branch vs. ticket) vom Sub-Agenten selbst zu setzen ist").

BEFUND: ticket-ops Step 3.6 beschreibt die Lock-Vergabe ausschliesslich aus Sicht des
ORCHESTRATORS ("agent-lock.sh claim ticket <ext-id> ... --label ticket-ops"). Was der
dispatchte Subagent in seinem Worktree selbst claimen muss, steht nirgends — obwohl
scripts/hooks/worktree-write-guard.sh Regel 2 ohne eigenen Claim jeden Write ablehnt.

FOLGE IN DIESEM LAUF: Vier von sechs Agenten liefen in die Guard-Blockade und mussten
den richtigen Claim selbst herleiten. Zwei setzten den falschen (ticket-scoped), der
nach T003102 den spaeteren Abschluss blockiert und vom Orchestrator manuell wieder
freigegeben werden musste. Sechs Agenten, vier unabhaengige Herleitungen desselben
Schrittes, zwei Fehlgriffe — das ist ein Vorlagen-Problem, kein Agenten-Problem.

ZU ERGAENZEN in der Dispatch-Vorlage von Step 3.6, woertlich als Prompt-Baustein:
    "Setze zu Beginn im Worktree:
       bash scripts/agent-lock.sh claim branch <branch> --worktree <pfad> --branch <branch>
     Setze KEINEN ticket-scoped Lock (T003102 — blockiert den spaeteren Abschluss durch
     Subagent, ticket-mcp und post-merge.yml).
     Gib den Branch-Lock am Ende deiner Arbeit wieder frei."

Haengt inhaltlich am Mishap "Drei Regelwerke widersprechen sich beim agent-lock-Scope"
aus demselben Lauf — dort liegt die Ursache, hier die konkrete Textstelle, die sie
weitertraegt.
**3. repo-hygiene §1: Freshness-Generat macht jeden fertigen Worktree dauerhaft dirty — `worktree remove` ohne `--force` schlägt regelhaft fehl** (process, skills/repo-hygiene (repo-hygiene-ops.md §1))

BEOBACHTET (repo-hygiene-Lauf 2026-08-09/10, Worktree .worktrees/factory-worktree-reaper-T002896)

repo-hygiene-ops.md §1 schreibt vor, `git worktree remove <pfad>` OHNE `--force` aufzurufen, und begründet das ausdrücklich als "Schutz bei ungetrackten Dateien". Dieser Schutz greift in der Praxis nicht, weil er regelhaft am falschen Signal scheitert.

BEFUND
Der Worktree war inhaltlich vollständig abgeschlossen: PR #4068 gemergt (mergedAt 2026-08-09T21:55:02Z), Squash-Commit e78a30777 in origin/main, Upstream [gone]. Der Blob-Vergleich pro Datei gegen origin/main (§2-Form) zeigte genau EINE Abweichung: website/src/data/openspec-status.json — ein reines Freshness-Generat. Der Inhalt der Abweichung war ausschliesslich regenerierter Archivstatus FREMDER Tickets (T002814 plan_staged -> archived, T002849 zusaetzlicher archived-Eintrag), also kein Byte eigener Arbeit.

`git status --porcelain` meldet dafuer ` M website/src/data/openspec-status.json`. Nach der woertlichen Regel aus §1 ("MUSS leer sein — sonst kein Remove") ist der Worktree damit nicht entfernbar, und `git worktree remove` ohne `--force` verweigert.

WARUM DAS STOERT
Das ist keine Ausnahme, sondern der Normalfall: jeder Worktree, in dem ein Plan gestaged oder archiviert wurde, traegt danach ein regeneriertes openspec-status.json. Der Aufraeumpfad landet damit routinemaessig im `--force`-Zweig — also in genau der Eskalation, die §1 als bewusste Ausnahme kennzeichnet. Ein Schutzmechanismus, der bei fast jedem legitimen Aufruf uebersprungen werden muss, schuetzt nicht mehr: er trainiert `--force` als Standardgriff an, und dann faellt echte ungesicherte Arbeit im selben Zweig nicht mehr auf.

ABGRENZUNG
Der Vorcheck selbst ist nicht falsch — er misst nur zu grob. Die verlaessliche Messung stand im selben Runbook bereits daneben (§2, Blob-Vergleich pro Datei gegen origin/main); sie unterscheidet Generat von Arbeit, `git status --porcelain` nicht.

MOEGLICHE AUFLOESUNG (nicht entschieden)
a) §1-Vorcheck um eine Generat-Allowlist ergaenzen (dieselbe, die scripts/branch-reaper.sh bereits fuehrt): Abweichungen ausschliesslich in Plan-/Generat-Pfaden gelten als sauber, `--force` ist dann keine Eskalation mehr, sondern der belegte Normalfall.
b) Vor dem Remove `git checkout -- <generat-pfade>` im Worktree, damit der Vorcheck wieder eine echte Aussage trifft.
**4. Mishap-Buffer kennt keinen Rücknahmepfad — ein behobener Befund erscheint beim Flush trotzdem als offener Punkt im Rollup** (process, scripts/ticket.sh + ticket-mcp (mishap-buffer))

BEOBACHTET (2026-08-09/10, repo-hygiene-Lauf + anschliessende Chore T003121)

ABLAUF
1. 22:02Z: Befund als Mishap gemeldet — "repo-hygiene §1: Freshness-Generat macht jeden fertigen Worktree dauerhaft dirty" (Buffer-Eintrag 3/10).
2. Direkt danach in derselben Sitzung behoben: Ticket T003121, PR #4075, gemergt 22:35Z. Der Befund existiert seit 33 Minuten nicht mehr.
3. Der Buffer-Eintrag steht unveraendert weiter drin. `get_mishap_buffer` zeigt ihn, `report_mishap` kann nur anfuegen, `flush_mishap_buffer` schreibt ALLE Eintraege in den Rollup-Container.

WIRKUNG
Beim naechsten Flush (spaetestens bei 10 Eintraegen oder nach 7 Tagen) landet ein bereits geschlossener Befund als offener Punkt im Rollup-Ticket. Wer den Rollup abarbeitet, untersucht etwas, das auf main schon behoben ist — im Zweifel inklusive erneutem Fix. Das Fenster ist genau die Spanne zwischen Erfassung und Flush, also bis zu 7 Tage; in dieser Spanne liegt jeder Befund, den eine Sitzung selbst behebt, und "selbst beheben" ist der Normalfall, nicht die Ausnahme.

ABGRENZUNG — das ist NICHT der Dedupe-Fall aus T002844
T002844 beschreibt die umgekehrte Richtung: der Buffer ist fuer die Ticket-Suche unsichtbar, deshalb entsteht ein DUPLIKAT. Hier ist der Eintrag sichtbar und korrekt erfasst — er ist nur inzwischen GEGENSTANDSLOS, und dafuer gibt es keinen Weg. Beide Faelle teilen die Ursache (Buffer und Tickets sind zwei Zustandsraeume ohne Verbindung), aber nicht die Auswirkung.

UMGEHUNG im aktuellen Lauf
Hinweis als Kommentar an T003121 gehaengt, damit die Spur beim Rollup auffindbar ist. Das ist Handarbeit und traegt nur, solange jemand daran denkt.

MOEGLICHE AUFLOESUNGEN (nicht entschieden)
a) `resolve_mishap`/`withdraw_mishap` mit Index oder Titel-Match, das den Eintrag mit Verweis auf das loesende Ticket aus dem Buffer nimmt.
b) Beim Flush jeden Eintrag gegen die Tickets pruefen und geschlossene als "bereits behoben durch T00XXXX" markieren statt sie als offenen Punkt zu fuehren — loest zugleich die Richtung aus T002844, weil beide Quellen dann in EINEM Aufruf zusammenkommen.
c) Nichts tun und die Handarbeit als Konvention im mishap-tracker-Skill festhalten (schwaechste Variante, aber billig).
**5. Half-archived change mcp-config-mutation-race detected during repo-hygiene** (drift, scripts/openspec.sh)

During repo-hygiene run, mcp-config-mutation-race was found in a half-archived state: the archive target 2026-08-10-mcp-config-mutation-race already existed in openspec/changes/archive/ while the source directory was still present in openspec/changes/. openspec.sh archive refuses to re-archive an existing target. The half-archive-check.sh script detected it correctly. Manual cleanup: verify delta was in SSOT, then rm -rf the source. Root cause unknown — possibly a prior archive that crashed after moving files but before removing source.
**6. Archive PR #4083 failed freshness gate — openspec-status.json not committed after archive** (suspicious, ci/freshness-gate)

PR #4083 (archive-only, no code changes) failed CI because website/src/data/openspec-status.json was regenerated by task freshness:check but not committed to the PR branch. The pre-commit hook did not catch this because the archive work was done in a worktree where the artifact was staged but the commit didn't include it. The openspec archive operation (moving/deleting change dirs) changes the openspec status map, which in turn triggers a freshness regeneration — but the regenerated artifact wasn't added to the commit.
**7. babysit-prs.sh entfernt Worktrees ohne den live-Lock-Guard aus T002896** (suspicious, scripts/factory/babysit-prs.sh)

Beobachtung (T003129): Ein aktiver Worktree unter .worktrees/openspec-archive-backlog-T003129 verschwand mitten in einem laufenden Batch ("getcwd: cannot access parent directories"), obwohl der Branch einen frisch geclaimten, lebenden agent-lock trug. 41 bereits verarbeitete Archivierungen gingen verloren, der Lauf musste komplett neu aufgesetzt werden.

Verifikation korrigiert die naheliegende Hypothese: .git/agent-locks/.reap.log zeigt fuer 01:27:45 den Eintrag "branch/chore/openspec-archive-backlog-T003129 worktree-missing". Der Lock wurde also stale, WEIL der Worktree fehlte — nicht umgekehrt. agent-lock hat korrekt gearbeitet; "agent-lock.sh reap" ruft ohnehin nur "git worktree prune" auf und entfernt keine existierenden Verzeichnisse.

Wer den Worktree entfernt hat, bleibt ungeklaert. Bei der Suche nach Kandidaten faellt aber eine reale Inkonsistenz auf, unabhaengig davon ob sie hier zugeschlagen hat:

- scripts/factory/cleanup.sh prueft VOR dem Removal "agent-lock.sh check-branch-live" und ueberspringt dann (Guard aus T002896, an zwei Stellen: EXIT-Trap Zeile 29 und Hauptpfad Zeile 43). Begruendung im Kommentar: "Der Factory-Autopilot darf aktiv geclaimte Fremd-Worktrees nicht entfernen."
- scripts/factory/watchdog.sh Zeile 76 prueft wenigstens auf uncommitted changes und ueberspringt dann mit Kommentar am Ticket.
- scripts/factory/babysit-prs.sh Zeile 222 hat WEDER das eine noch das andere: "git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT"". Kein check-branch-live, keine Dirty-Pruefung, und der rm -rf-Fallback setzt sich sogar ueber ein fehlgeschlagenes git worktree remove hinweg.

Der Guard aus T002896 wurde offenbar nur in cleanup.sh eingezogen, obwohl babysit-prs.sh dieselbe Operation ausfuehrt. Vorschlag: check-branch-live auch dort vorschalten, und den rm -rf-Fallback entfernen oder ebenfalls hinter den Guard legen.

Praktischer Workaround bis dahin: Worktrees fuer laengere Batch-Laeufe ausserhalb von .worktrees/ anlegen (z.B. im Session-Scratchpad). Der zweite Anlauf lief dort unbehelligt durch.
**8. test:changed startet Live-E2E gegen korczewski bei reiner openspec/-Aenderung** (degraded, Taskfile.yml:test:changed)

Beobachtung (T003129): Ein Diff, der ausschliesslich openspec/ und das generierte website/src/data/openspec-status.json beruehrt (kein einziger ausfuehrbarer Code), loeste in "task test:changed" den Teiltask test:e2e:korczewski aus. Der scheiterte am Auth-Setup gegen die Live-Site (korczewski-auth-setup.spec.ts:44, "authenticate korczewski website admin"), 48 Tests liefen gar nicht erst. Exit 201.

Der Taskfile-Kommentar beschreibt genau diesen Fall als bereits geloest (T002255): "Generierte Artefakte (linguist-generated in .gitattributes) vor der Selektion entfernen: sie liegen im Diff JEDES Changes mit OpenSpec-Artefakt und wuerden sonst Playwright fuer Changes ohne Website-Bezug starten." Der Filter greift hier nicht — vermutlich weil openspec/specs/website-core.md im Diff liegt und als website-Bezug gewertet wird, obwohl es eine Spezifikationsdatei ist.

Warum das mehr als kosmetisch ist: derselbe Taskfile-Kommentar haelt fest, dass CI fuer PRs nur test:spec:changed plus manifests.bats faehrt, NICHT das volle test:changed — "der lokale Lauf war also strenger als das Gate, das er simuliert". Ein Agent, der den Verifikationsblock woertlich befolgt, steht damit vor einem roten Ergebnis, das keine Regression ist, und muss zwischen "falsche Regression melden", "blind weitermachen" und "Zeit an einem Umgebungsproblem verbrennen" waehlen. Genau diese Wahl beschreibt der Kommentar zu T002375-p4 bereits fuer den k3d-Fall, wo daraufhin ein sichtbarer Skip eingebaut wurde.

Bestaetigung, dass es ein Fehlalarm war: test:spec:changed lief mit 220 ok / 0 Fehlschlaegen, task openspec:validate 11/11 gruen, freshness:check exit 0, und PR #4086 ging mit 18/18 gruenen Checks durch.

Vorschlag: dieselbe Erreichbarkeits-/Relevanzpruefung wie fuer die k3d-Gruppe auch fuer die E2E-Gruppe, oder openspec/specs/*.md aus der Website-Domain-Zuordnung nehmen — eine Spec-Datei ist kein Website-Code.
**9. Commit-Scope 'openspec' abgelehnt, obwohl das ganze Repo von OpenSpec spricht** (drift, scripts/validate-commit-msg.sh)

Beobachtung (T003129): "chore(openspec): 54 gemergte Changes archivieren [T003129]" wurde vom commit-msg-Hook abgelehnt: "unknown scope 'openspec' — 'openspec' wurde zu 'plans' konsolidiert (T002328)". Korrekt ist chore(plans).

Warum das wiederholt Zeit kostet: der abgelehnte Scope ist ueberall sonst der etablierte Begriff. Das Verzeichnis heisst openspec/, die Tasks heissen openspec:validate / openspec:propose / openspec:apply / openspec:archive, die Slash-Commands heissen /opsx:*, die Skills heissen openspec-propose / openspec-apply-change / openspec-archive-change, und CLAUDE.md hat einen eigenen Abschnitt "OpenSpec native change workflow". Ein Agent, der einen Commit fuer eine openspec/-Aenderung schreibt, waehlt den naheliegenden Scope — und der ist der falsche.

Der Hook selbst weist darauf hin, dass CI hier nicht schuetzt: "Der CI-PR-Titel-Check (amannn/action-semantic-pull-request) prueft keinen Scope — ein gruener PR-Titel ist keine Garantie fuer diesen Scope." Der Fehler faellt also erst lokal beim Commit auf, nach dem Verfassen der vollstaendigen Message.

Kosten pro Vorfall gering (ein Fehlversuch), Haeufigkeit aber strukturell: jede openspec-Aenderung eines Agenten, der die Konsolidierung nicht auswendig kennt.

Vorschlag (eines von beiden, nicht beide):
(a) 'openspec' als Alias auf 'plans' in validate-commit-msg.sh zulassen — die Konsolidierung bliebe inhaltlich bestehen, nur der naheliegende Name wuerde nicht mehr bestrafen; oder
(b) einen Satz in CLAUDE.md beim OpenSpec-Abschnitt: "Commits zu openspec/ tragen den Scope 'plans', nicht 'openspec' (T002328)."
**10. openspec.sh archive skaliert nicht im Batch (~3s pro Change, Node-Start je Delta)** (degraded, scripts/openspec.sh)

Beobachtung (T003129): Beim Abbau des Archivierungsrueckstands (98 offene Changes) brauchte "scripts/openspec.sh archive <slug>" rund 3 Sekunden pro Change. Ursache: _merge_delta startet fuer jede einzelne Delta-Datei einen eigenen Node-Prozess ("node scripts/openspec-merge.mjs apply ..."), der Prozessstart dominiert die eigentliche Arbeit.

Praktische Folge: eine Schleife ueber 59 Changes laeuft rund drei Minuten und schlaegt damit in jedes Default-Kommandotimeout (2 Minuten). Der erste Lauf brach nach 41 verarbeiteten Changes ab und musste gestueckelt bzw. mit erhoehtem Timeout wiederholt werden. Fuer den Normalfall — ein Change am Ende eines dev-flow-execute — ist das irrelevant; relevant wird es genau dann, wenn ein Rueckstand aufgeholt werden soll, also im Wartungsfall.

Das ist kein Fehlverhalten, nur schlechte Batch-Ergonomie. Zwei denkbare Wege:
(a) ein Batch-Modus, der mehrere Slugs in EINEM Node-Prozess abarbeitet (openspec-merge.mjs bekaeme eine Liste statt eines Paares); oder
(b) schlicht dokumentieren, dass Block-Archivierungen im Hintergrund oder in Portionen zu fahren sind.

Randnotiz aus demselben Lauf, gleiche Ursachenklasse: openspec.sh archive prueft den Ticket-Status fail-closed (done/archived) und verweigert sonst — das hat sauber funktioniert und mehrere nicht abgeschlossene Changes korrekt abgewiesen. Der Guard ist nicht das Problem, nur die Wiederholrate.
### Mishap-Rollup — 10 Eintraege (2026-08-10 01:56 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | skills/references/ticket-ops-procedures.md | ticket-ops Step 1.1: Triage-Query überschreitet bei ~96 offenen Tickets das mcp-postgres-Token-Limit |
| 2 | degraded | skills/references/ticket-ops-procedures.md | ticket-ops Step 1.1 dokumentiert einen jq-Ausdruck, der am MCP-Ergebnis scheitert |
| 3 | degraded | skills/references/ticket-ops-procedures.md (Step 3.1/3.2) | ticket-ops Wellenbildung: areas-Konfliktheuristik erkennt Kollisionen über generierte Artefakte nicht |
| 4 | suspicious | .githooks/post-commit (openspec-embed) | openspec-embed post-commit meldet "Backend nicht erreichbar" auf :8081, das Backend antwortet aber mit 200 |
| 5 | suspicious | repo/git | 4 Stashes verschwanden während repo-hygiene §0-Inventur — refs/stash komplett weg, Mechanismus ungeklärt |
| 6 | drift | tickets | 285 von 881 done-Tickets ohne resolution (32%) — darunter T003121/T003129 von heute |
| 7 | process | scripts/branch-reaper.sh + skills/references/repo-hygiene-ops.md §2 | branch-reaper.sh --dry-run ohne --ticket nicht aufrufbar, Runbook dokumentiert ihn als manuellen Inspektionsblick |
| 8 | process | .claude/skills/references/repo-hygiene-ops.md §3 (Konfliktprobe) | repo-hygiene-ops §3: dokumentierte Konfliktprobe ist im Normalfall nicht gangbar (invasiver Arbeitsbaum-Merge in dirty Worktree) |
| 9 | process | scripts/branch-reaper.sh | branch-reaper.sh meldet "DELETED", löscht aber nur den Remote-Ref — lokaler Branch überlebt |
| 10 | process | .claude/skills/references/repo-hygiene-ops.md §2 | repo-hygiene §2: [gone]-Prune läuft VOR branch-reaper, der selbst neue [gone]-Refs erzeugt |

**1. ticket-ops Step 1.1: Triage-Query überschreitet bei ~96 offenen Tickets das mcp-postgres-Token-Limit** (degraded, skills/references/ticket-ops-procedures.md)

Beobachtet 2026-08-10 im ticket-ops-Lauf (96 offene Tickets, is_test_data=false).

BEFUND: Die in ticket-ops-procedures.md §Step 1.1 vorgeschriebene json_agg-Query liefert 52.548 Zeichen und wird von mcp__mcp-postgres__query mit "exceeds maximum allowed tokens" abgewiesen. Das Ergebnis landet stattdessen in einer Datei im Tool-Results-Verzeichnis; die Query ist über MCP nicht mehr direkt konsumierbar.

VERIFIZIERT: Die Abweisung trat beim ersten Aufruf auf, Zeichenzahl aus der Fehlermeldung.

WARUM RELEVANT: Der Skalierungsbruch ist nicht dokumentiert. Die Prozedur wurde erkennbar für kleinere Ticketmengen geschrieben (das Beispiel im Entscheidungsbaum nennt "Open Tickets (N=17)"). Ein Agent, der sie wörtlich befolgt, läuft bei wachsendem Backlog in einen Fehlschlag und muss den Umweg selbst herleiten — hier über die Ergebnisdatei plus jq/python.

VORSCHLAG: Entweder die Query von vornherein in eine Datei schreiben lassen und dort weiterverarbeiten, oder sie chunken (LIMIT/OFFSET nach Priorität), oder die Feldliste kürzen — 'readiness' und 'depends_on' machen einen erheblichen Teil der Nutzlast aus und werden in Phase 1 nur aggregiert gebraucht.

ABGRENZUNG: Kein Defekt von mcp-postgres — das Limit ist gewollt. Der Defekt liegt in der Prozedur, die ihn nicht berücksichtigt.
**2. ticket-ops Step 1.1 dokumentiert einen jq-Ausdruck, der am MCP-Ergebnis scheitert** (degraded, skills/references/ticket-ops-procedures.md)

Beobachtet 2026-08-10 im ticket-ops-Lauf.

BEFUND: ticket-ops-procedures.md Zeile 79 schreibt zur Weiterverarbeitung der Triage-Query vor: "das Ergebnis wird mit `jq -r '.result[]'` verarbeitet, nicht mit Split-by-Pipe".

Das mcp-postgres-Ergebnis hat aber die Form `[{"result": "<json-string>"}]` — ein Array mit einem Objekt, dessen Feld 'result' einen JSON-STRING enthält (nicht ein Array). Der dokumentierte Ausdruck scheitert; korrekt ist `jq -r '.[0].result'`, dessen Ausgabe dann erneut als JSON geparst wird.

VERIFIZIERT: `grep -n "result\[\]" .claude/skills/references/ticket-ops-procedures.md` → Treffer in Zeile 79. Der erste Parse-Versuch dieses Laufs scheiterte entsprechend mit einem JSONDecodeError; `jq -r '.[0].result'` lief durch.

WARUM RELEVANT: Die Zeile stammt aus T002422, wo sie die Umstellung von Pipe-Spalten auf JSON begründet — die Begründung ist richtig, nur der konkrete Ausdruck stimmt nicht mit dem Ausgabeformat überein. Kostet jeden Nutzer der Prozedur einen Fehlschlag.

VORSCHLAG: Zeile 79 auf `jq -r '.[0].result'` korrigieren und den doppelten Parse-Schritt benennen. Hängt inhaltlich am separat gemeldeten Skalierungsbruch derselben Query — beide Korrekturen betreffen denselben Absatz.
**3. ticket-ops Wellenbildung: areas-Konfliktheuristik erkennt Kollisionen über generierte Artefakte nicht** (degraded, skills/references/ticket-ops-procedures.md (Step 3.1/3.2))

Beobachtet 2026-08-10 im ticket-ops-Welle-1-Dispatch mit 4 parallelen dev-flow-plan-Einheiten.

BEFUND: Die Soft-Conflict-Kante aus Step 3.1 serialisiert zwei Tickets, wenn sie einen `areas`-Eintrag teilen. Sie fängt nicht, dass ALLE VIER Welle-1-Branches dieselbe generierte Datei ändern: website/src/data/openspec-status.json. Jede dev-flow-plan-Einheit legt ein openspec/changes/<slug>/ an, woraus die Statuskarte regeneriert und mitcommittet wird.

VERIFIZIERT (alle vier Branches, nicht nur eine Stichprobe):
  git diff --name-only origin/main..fix/agent-lock-scope-regelwerk-T003116   -> Treffer
  git diff --name-only origin/main..fix/agent-lock-sid-detection-T003110     -> Treffer
  git diff --name-only origin/main..fix/no-unasked-stash-T003078             -> Treffer
  git diff --name-only origin/main..fix/babysit-prs-live-lock-guard-T003137  -> Treffer

WARUM DIE HEURISTIK VERSAGT: Keine der vier Einheiten trägt `website` in ihren areas — die areas lauten scripts/agent-lock.sh, skills/dev-flow-chore, scripts/factory/babysit-prs.sh usw. Die Kollision entsteht nicht über die inhaltlich berührten Bereiche, sondern über ein GENERIERTES Artefakt, das jeder Planlauf als Nebenwirkung anfasst. Eine areas-basierte Heuristik kann das strukturell nicht sehen.

FOLGE: Die vier PRs sind nicht gleichzeitig merge-fähig. Sie müssen seriell durch, jede nach dem Merge der vorigen mit `task freshness:regenerate`. Das war beim Aufstellen des Masterplans nicht sichtbar und fiel erst beim Nachprüfen der fertigen Branches auf.

VORSCHLAG: Freshness-Generate (openspec-status.json, test-inventory.json) als implizite geteilte area der Wellenbildung behandeln — oder schlichter: Wellen aus dev-flow-plan grundsätzlich als seriell-mergend kennzeichnen und das im Masterplan-Format ausweisen, statt Merge-Parallelität zu suggerieren, die es nicht gibt.

ABGRENZUNG: T003133 (Freshness-Generat macht Worktrees dirty), T003136 (Archive-PR am Freshness-Gate gescheitert) und T003105 (Rebase verliert Freshness-Artefakte) beschreiben Folgen desselben Generats. Dieser Befund ist ein anderer: die fehlende ERKENNUNG in der Wellenbildung von ticket-ops.
**4. openspec-embed post-commit meldet "Backend nicht erreichbar" auf :8081, das Backend antwortet aber mit 200** (suspicious, .githooks/post-commit (openspec-embed))

Beobachtet 2026-08-10, bei DREI von vier parallel laufenden dev-flow-plan-Agenten.

BERICHTET WURDE: Der post-commit-Hook openspec-embed schlug fehl, weil kein Embedding-Backend erreichbar sei — genannt wurden 127.0.0.1:8081 (bge-mcp) und, von einem weiteren Agenten, der bekannte Port-15432-Konflikt. Non-fatal, kein Commit wurde blockiert.

NACHERHEBUNG WIDERSPRICHT DER MELDUNG (das ist der eigentliche Befund):
  curl http://127.0.0.1:8081/health   -> HTTP 200
  ss -ltnp | grep -E ':(8081|15432)'  -> beide Ports haben einen Lauscher
      127.0.0.1:8081  kubectl pid=753980
      127.0.0.1:15432 kubectl pid=50718

Die Port-Forwards standen also zum Zeitpunkt der Nacherhebung. Ob sie während der Agentenläufe kurzzeitig weg waren, lässt sich nachträglich nicht klären — deshalb ist die naheliegende Lesart ("Backend war tot") NICHT belegt, und die Meldung des Hooks bleibt fragwürdig: sie behauptet Nichterreichbarkeit als Ursache, obwohl das Backend erreichbar ist.

WARUM RELEVANT: Eine Fehlermeldung, die eine falsche Ursache nennt, kostet beim Debuggen mehr als gar keine. Dasselbe Muster ist im Bestand bereits zweimal erfasst — T002909 (plan-qa-check.sh meldet "Gateway not reachable", obwohl der Gateway erreichbar ist) und T002912 (Postgres-Socket-Meldung trotz erreichbarer DB). Drei Werkzeuge mit demselben Fehlbild deuten auf eine gemeinsame Ursache im Erreichbarkeits-Check, nicht auf drei unabhängige Defekte.

VORSCHLAG: Prüfen, ob die drei Stellen denselben Probe-Code teilen. Falls ja, dort ansetzen statt dreimal einzeln. Mindestens sollte der Hook den tatsächlichen Fehler (Timeout? HTTP-Status? DNS?) ausgeben statt ihn zu "nicht erreichbar" zu verallgemeinern.

[Teilweise UNVERIFIED — der Zustand während der Agentenläufe ist nachträglich nicht rekonstruierbar; verifiziert ist nur der Widerspruch zur Nacherhebung.]
**5. 4 Stashes verschwanden während repo-hygiene §0-Inventur — refs/stash komplett weg, Mechanismus ungeklärt** (suspicious, repo/git)

Während repo-hygiene §0 (2026-08-10 ~02:30Z) wurden 4 Stashes inventarisiert (stash@{0} worktree-create-auto-stash 02:06, stash@{1} wip-before-chore T002649 01:48, stash@{2} WIP auf 7815d6592 (#4082) 01:19, stash@{3} WIP auf 0cee50e43 [T002896] 00:04). Minuten später war refs/stash vollständig weg — weder git stash list noch reflog show refs/stash liefern etwas. Kein Hook, kein Script im Repo droppt Stashes (grep über scripts/ + .git/hooks/ leer). Inhalte sind verifiziert NICHT verloren: stash@{2}/stash@{3}-Inhalt steht in origin/main (Archiv-Commits #4083 + factory-reclaim-lock-respect-Delta), stash@{0} enthielt keine unikaten Bytes (nur Deletionen eines aktiven Changes, T002658 planning), stash@{1} war ein regenerierbarer openspec-status.json-Generat. Commit-Objekte hängen noch (dangling, via git fsck auffindbar) und wären bis GC wiederherstellbar. Befund: unerklärte Fremd-Drop-Aktion (vermutlich parallele Session/Workflow mit git stash clear) — Problemraum T003078 (ungefragtes Stashen). Kein Datenverlust, aber Mechanismus ungeklärt und Folge-Läufe können echte Arbeit treffen.
**6. 285 von 881 done-Tickets ohne resolution (32%) — darunter T003121/T003129 von heute** (drift, tickets)

SELECT count FILTER (status='done' AND resolution IS NULL) über tickets.tickets ergibt 285/881 (32%). Die Konvention (repo-hygiene-ops §3, mishap-tracker) verlangt bei status=done eine resolution (fixed für fix/*, shipped für feature/*). Heute gemergte PRs #4075 (T003121) und #4086 (T003129) wurden als done ohne resolution abgeschlossen — auch frische Tickets betroffen, nicht nur Altbestand. Kein offenes Ticket dazu vorhanden. Empfehlung: Backfill-Regel (z.B. per Post-Merge-Hook oder cockpit_audit) für done ohne resolution, oder resolution bei done-Writes verpflichtend erzwingen.
**7. branch-reaper.sh --dry-run ohne --ticket nicht aufrufbar, Runbook dokumentiert ihn als manuellen Inspektionsblick** (process, scripts/branch-reaper.sh + skills/references/repo-hygiene-ops.md §2)

`.claude/skills/references/repo-hygiene-ops.md` §2 ("Verwaiste Remote-Branches") dokumentiert:

    bash scripts/branch-reaper.sh --ticket T00XXXX --dry-run   # zeigt REAP-/KEEP-Zeilen mit Begründung

und rahmt das als "im Post-Merge-Workflow läuft er automatisch, manuell zum Nachsehen". Der Nachsehen-Fall braucht aber gerade kein Ticket — man will die Kandidatenliste sehen, nicht eine Löschung einem Vorgang zuordnen.

BELEG: `bash scripts/branch-reaper.sh --dry-run` bricht mit Exit 2 ab: "FEHLER: --ticket ist erforderlich (Format T######)". Usage: `branch-reaper.sh --ticket T###### [--dry-run] [--remote <name>] [--repo <pfad>]`.

FOLGE: Wer §2 zum reinen Nachsehen befolgt, muss eine Ticketnummer erfinden oder eine fremde einsetzen. Beides ist unerwünscht — eine erfundene Nummer erzeugt im Zweifel einen Archiv-Tag unter falscher Zuordnung, eine fremde hängt die Aktion an einen unbeteiligten Vorgang.

Beobachtet im repo-hygiene-Lauf 2026-08-10: 17 Remote-Branches außer main, davon 5 mit lokalem Worktree — die Kandidatenliste blieb ungeprüft, weil der Dry-Run nicht ohne Ticket lief.

ZUSCHNITT: Entweder `--dry-run` das `--ticket` erlassen (der Dry-Run schreibt per Definition nichts, ein Archiv-Tag entsteht dabei nicht), oder die Runbook-Zeile so korrigieren, dass sie den Zwang nennt statt einen ticketlosen Blick zu suggerieren.
**8. repo-hygiene-ops §3: dokumentierte Konfliktprobe ist im Normalfall nicht gangbar (invasiver Arbeitsbaum-Merge in dirty Worktree)** (process, .claude/skills/references/repo-hygiene-ops.md §3 (Konfliktprobe))

Beobachtet 2026-08-10 während eines repo-hygiene-Laufs an PR #4091. VERIFIZIERT durch Messung, nicht nur berichtet.

DER WIDERSPRUCH (zwei Stellen desselben Runbooks):

(a) §3 „Leere Checkliste kann auch Konflikt heißen" [T002822] schreibt als Gegenprobe einen
    invasiven Arbeitsbaum-Merge vor:
        git merge origin/main --no-commit --no-ff   # danach: git merge --abort
        git diff --name-only --diff-filter=U

(b) §1 „Generat-Abweichungen sind kein Befund" hält an anderer Stelle desselben Dokuments fest,
    dass jeder Worktree, in dem ein Plan gestaged oder archiviert wurde, dauerhaft ein
    abweichendes website/src/data/openspec-status.json trägt — das ist ausdrücklich der
    NORMALFALL, nicht die Ausnahme.

Ein PR-Worktree erfüllt (b) praktisch immer. Damit läuft (a) auf einen Merge in einen dirty
Arbeitsbaum hinaus, und zwar genau in der Datei, die main ebenfalls fortschreibt.

GEMESSEN:
- git -C .worktrees/agent-lock-scope-regelwerk-T003116 status --porcelain
  → " M website/src/data/openspec-status.json"
- PR #4091: mergeStateStatus=DIRTY, statusCheckRollup=[] (0 Einträge),
  gh run list --branch … → [] (null Runs) — exakt das T002822-Symptom.

DIE NICHT-INVASIVE ALTERNATIVE, die dieselbe Frage beantwortet:
    git merge-tree --write-tree --name-only origin/main <branch>
Exit 0 + Tree-SHA  = konfliktfrei → Phantomkonflikt aus merge=ours (T002823)
Exit != 0 + Dateiliste = echter Konflikt
Der Aufruf fasst weder Working Tree noch Index an, braucht also keinen sauberen Worktree und
kein anschließendes --abort (dessen Vergessen im dokumentierten Weg einen halbfertigen Merge
hinterlässt — verwandt mit T002766).

Hier lieferte er sofort: exit=0, Tree a9984a261215047e18e3322a3f4d75db609fb891 → Phantomkonflikt.
Auf dieser Grundlage wurde der lokale Merge-Weg aus §3 gefahren (merge + freshness:regenerate +
push); PR #4091 wechselte danach von DIRTY auf BLOCKED mit 15 Checks, CI lief an, Auto-Merge ist
aktiv.

ZU ÄNDERN (Vorschlag, nicht präjudiziert):
In §3 die merge-tree-Form als primäre Gegenprobe nennen und den Arbeitsbaum-Merge auf den Fall
zurücknehmen, in dem man die Konfliktmarker tatsächlich sehen will. Die Reihenfolge
„mergeStateStatus lesen → bei UNKNOWN/DIRTY probe-mergen" bleibt unverändert richtig; nur das
Werkzeug des zweiten Schritts passt nicht zum dokumentierten Normalzustand der Worktrees.

Kein Defekt an einem Skript — eine Runbook-Lücke: der empfohlene Weg kollidiert mit einer
Bedingung, die dasselbe Runbook 200 Zeilen weiter oben als Regelfall beschreibt.
**9. branch-reaper.sh meldet "DELETED", löscht aber nur den Remote-Ref — lokaler Branch überlebt** (process, scripts/branch-reaper.sh)

`bash scripts/branch-reaper.sh --ticket T002623` gab "DELETED chore/adr006-sdlc-topologie-T002623 (archiviert als refs/tags/reaped/...)" aus. Danach war der Remote-Branch weg und der Archiv-Tag lokal wie remote gesetzt — der LOKALE Branch-Ref existierte aber unverändert weiter (`git rev-parse --verify` lieferte 3c600d7bf). Belegt in scripts/branch-reaper.sh Zeilen 189-205: die Schleife führt ausschliesslich `git push $REMOTE $sha:refs/tags/...` und `git push $REMOTE --delete $branch` aus; ein `git branch -d/-D` kommt im gesamten Skript nicht vor (`grep -nE 'branch -D|git branch'` findet nur die echo-Zeile). Die Meldung "DELETED $branch" ist unqualifiziert und liest sich als vollstaendige Loeschung — sie beschreibt aber nur die Remote-Haelfte. Folge: nach jedem Reap bleiben lokale Leichen liegen, deren Upstream ab da [gone] ist. Zuschnitt eines Fixes: entweder Meldung auf "DELETED remote/$branch" praezisieren, oder den lokalen Ref mitloeschen, wenn er auf denselben SHA zeigt wie der Archiv-Tag.
**10. repo-hygiene §2: [gone]-Prune läuft VOR branch-reaper, der selbst neue [gone]-Refs erzeugt** (process, .claude/skills/references/repo-hygiene-ops.md §2)

In repo-hygiene-ops.md §2 steht der [gone]-Aufraeumpfad (git fetch --prune + force-delete gemergter Branches) VOR dem Unterabschnitt "Verwaiste Remote-Branches (ohne PR)", der branch-reaper.sh aufruft. Der Reaper loescht aber Remote-Branches und erzeugt damit GENAU die [gone]-Refs, die der vorangegangene Schritt haette aufraeumen sollen. Real beobachtet am 2026-08-10: der Prune zu Beginn fand null [gone]-Branches, nach dem Reap von chore/adr006-sdlc-topologie-T002623 war dieser eine [gone] — im selben Lauf raeumte ihn nichts mehr weg. Erschwerend: der §2-[gone]-Pfad verlangt einen nachweislich gemergten PR, und Reaper-Kandidaten haben per Definition KEINEN PR (deshalb greift der Reaper ueberhaupt). Der [gone]-Pfad haette ihn also auch beim naechsten Lauf uebersprungen ("SKIP — upstream gone but no merged PR found"). Manuell aufgeraeumt ueber den Archiv-Tag als Sicherheitsanker (`git rev-parse --verify refs/tags/reaped/$b` vorhanden -> `git branch -D` belegt sicher). Zuschnitt: entweder Reihenfolge umdrehen, oder den Archiv-Tag als zweites zulaessiges Positiv-Signal im [gone]-Pfad dokumentieren.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
