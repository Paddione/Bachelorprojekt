# Proposal: zielfamilie-worktree-hygiene

## Why

Keine Zielfamilie deckt den **lokalen Arbeitszustand** des Repos ab. Das einzig verwandte Ziel
`G-RH04` misst `refs/remotes/origin`, also die Remote-Seite. Lokale Worktrees, der Zustand des
Hauptcheckouts und die agent-lock-Datenbank haben kein Ziel — obwohl genau dort mehrfach realer
Schaden entstanden ist:

- **T001880 (2026-07-15):** rund 26 unkommittete OpenSpec-Archivierungen sammelten sich auf `main`
  an, weil mutierende Chores im Hauptcheckout statt in einem Worktree liefen.
- **T002567:** zwei Direkt-Commits auf `main` aus demselben Muster.
- **Erhebung 2026-07-28:** der Hauptcheckout stand auf `chore/mishap-T002422` mit 15 unkommitteten
  Dateien; 26 lokale Worktrees, einer davon mit detached HEAD im Session-Scratchpad. Der
  Divergence-Guard in `scripts/worktree-create.sh` hätte dabei 15 fremde Dateien gestasht und das
  Zurückspielen per `git stash pop 2>/dev/null || true` still verschluckt.
- **T002379:** der `repo-hygiene`-Cleanup prüft nur Commit-Ancestry, nicht ungetrackte Dateien —
  ein Cleanup kann ungesicherte Arbeit vernichten.
- **2026-08-02, frisch beobachtet:** ein Lock auf `T002570` gehörte PID 29696. Der Prozess war tot
  **und** `heartbeat_at == created_at` (nie fortgeschrieben). `agent-lock.sh reap` räumte ihn nicht,
  weil der Worktree noch stand; `check ticket` meldete durchgehend `held`, `list` zeigte ihn als
  `live`. Erkennbar war die Verwaisung nur durch manuellen PID- und Heartbeat-Vergleich.
- **2026-08-02, dieselbe Sitzung:** `agent-lock.sh list` zeigte einen Lock mit `--label` als
  SCOPE-Wert — ein Flag wurde als Positionsargument gelesen. Der `_reject_arg`-Guard aus T002363
  fängt nur unbekannte Flags **nach** dem Scope, nicht einen Scope, der selbst ein Flag ist. Solche
  Phantom-Scope-Locks sind über `check ticket <id>` unauffindbar und blockieren still.

Die Regeln existieren alle in `CLAUDE.local.md` und in den Skills — sie sind dokumentiert, aber
**nicht gemessen**. Aufgedeckt wurden die Verletzungen jedes Mal zufällig.

Ein erster Aufschlag (PR #3641) hat `G-WT01` bis `G-WT03` bereits in `.claude/lib/goals.md` und
`scripts/health-goals-check.sh` eingetragen. Dieser Vorgang setzt dort auf, weil der Aufschlag in
drei Punkten unvollständig ist:

1. **Zwei der fünf im Ticket belegten Zielarten fehlen ganz** — ungesicherte Arbeit in Worktrees
   und die `main`-Divergenz.
2. **Die Positiv-Anker fehlen oder sind unwirksam.** `G-WT02` iteriert über `.worktrees/*/`; greift
   der Glob nicht, gibt die Messung `0` aus und meldet trivial grün — exakt der vakuose Negativtest,
   den `T002356-M1` verbietet. Bei `G-WT01` behauptet die Prosa, „der Positiv-Anker ist der
   git-Befehl selbst"; ein nicht auflösbarer Repo-Pfad erzeugt dort aber eine gemeldete
   *Verletzung* statt eines ehrlichen `n/a`.
3. **`G-WT03` misst nur die PID.** Auf einem laufenden Host werden PIDs wiederverwendet; ein nie
   fortgeschriebener Heartbeat ist dagegen eindeutig. Der Vorfall vom 2026-08-02 zeigt, dass der
   Heartbeat der verlässlichere Indikator ist.

Zusätzlich hat die Familie **keinen Messort**: `health-goals-check.sh` misst sie nur, wenn jemand
den Report von Hand aufruft.

## What

### Scope-Entscheidung: lokal, nicht CI

Das Ticket stellt in seinem letzten Absatz ausdrücklich die Frage, ob diese Familie in CI sinnvoll
ist. **Antwort: nein.** Die Familie misst lokalen Maschinenzustand — Worktrees,
Hauptcheckout-Branch, agent-locks, `main`-Divergenz. Ein CI-Runner hat weder Worktrees noch
agent-locks noch einen Hauptcheckout; die Ziele wären dort strukturell immer grün und damit
wertlos. Gemessen wird deshalb **lokal**:

- **primär** über `bash scripts/health-goals-check.sh` (Ampel-Report, bestehender Pfad),
- **sichtbar** über einen Warn-Block in `task freshness:check`, der lokal läuft und in CI
  nachweisbar übersprungen wird (`CI`-Guard mit sichtbarer Skip-Notiz statt stiller Grün-Meldung).

Der Warn-Block **failt nicht**. `freshness:check` ist ein Merge-Gate; ein harter Fail bei dirty
Hauptcheckout würde jeden lokalen Commit blockieren, was zur Umgehung des Gates führt statt zu
Hygiene. Die Zahl gehört in den Report, die Sichtbarkeit in den Alltagspfad.

### Sechs Ziele

| ID | Ziel | Target |
|----|------|--------|
| `G-WT01` | Hauptcheckout auf `main` und sauber (binär) | 0 |
| `G-WT02` | Veraltete Worktrees (Branch nach `main` gemergt oder >14d inaktiv) | 0 |
| `G-WT03` | Verwaiste Agent-Locks (PID tot **oder** Heartbeat abgelaufen) | 0 |
| `G-WT04` | Löschbereite Worktrees mit ungesicherter Arbeit | 0 |
| `G-WT05` | Lokaler `main` hinter `origin/main` (Commits) | 0 |
| `G-WT06` | Phantom-Scope-Locks (Scope leer oder mit `-` beginnend) | 0 |

`G-WT01` bis `G-WT03` bestehen bereits und werden geschärft, `G-WT04` bis `G-WT06` kommen hinzu.

**`G-WT04` ist bewusst als Schnittmenge geschnitten**, nicht als „alle Worktrees mit dirty status".
Ungesicherte Arbeit ist im laufenden Betrieb normal — jede aktive Session hat sie, ein Ziel darauf
wäre dauerhaft rot und würde ignoriert. Akuter Datenverlust droht genau dort, wo ein Worktree
**gleichzeitig** löschbereit (Branch nach `main` gemergt) und dirty ist: das ist der Fall, den
`repo-hygiene` wegräumt, ohne hinzusehen (T002379).

**`G-WT06` misst kein Allowlist-Match.** Die Scope-Namen sind offen (`ticket`, `branch`,
`main-checkout`, `staging`, `registry`, weitere möglich); eine Allowlist würde bei jedem neuen
Scope falsch alarmieren. Gemessen wird die Formfehler-Signatur: ein Scope, der leer ist oder mit
`-` beginnt, kann nur aus einem als Positionsargument gelesenen Flag stammen.

### Positiv-Anker als Konstruktionsprinzip

Jedes der sechs Ziele gibt bei fehlender oder kaputter Messgrundlage `n/a` aus, **nicht `0`**.
`health-goals-check.sh` wertet `n/a` als übersprungen — eine nicht durchgeführte Messung wird damit
als solche sichtbar, statt als Erfolg gezählt zu werden. Der stärkste Anker sitzt bei `G-WT03`: der
Lock der laufenden Session ist nachweislich lebendig; klassifiziert das Messverfahren ihn als
verwaist, ist das Verfahren kaputt und die Messung liefert `n/a`.

### Eine Messquelle statt zweier Kopien

Heute stehen die Messbefehle **doppelt** — als Shell-Block in `.claude/lib/goals.md` und als
`row target`-Substitution in `scripts/health-goals-check.sh`. Diese Kopien driften. Die Messlogik
zieht deshalb nach `scripts/lib/wt-hygiene-measure.sh` (Präzedenzfall: `G-AGENTIC01` misst über
`scripts/lib/count-unresolved-agent-tools.sh`); beide Stellen rufen nur noch dieses Skript auf. Das
macht die Messung außerdem erst testbar: BATS kann das Skript gegen Fixture-Repos ausführen und
seine **Ausgabe** prüfen, statt Quelltext zu greppen (T002448-M4).

### Abgrenzung zu `G-LLM*` (T002442)

Keine inhaltliche Überschneidung: `G-LLM*` misst Erreichbarkeit von Modellservern und
llm-proxy-Endpunkten auf dem GPU-Host, `G-WT*` misst Git-Arbeitszustand und Lock-Dateien. Beide
Familien teilen jedoch die Scope-Entscheidung „lokal, nicht CI" und damit denselben Messpfad. Damit
der `G-LLM*`-Block additiv danebenpasst, gilt für diesen Vorgang:

- In `.claude/lib/goals.md` wird ausschließlich der Bereich ab `## G-WT01` angefasst; der davor
  liegende `G-LLM*`-Block bleibt unberührt.
- In `scripts/health-goals-check.sh` wird ausschließlich die Sektion `WT-TARGETS` ersetzt; die
  davor liegende `LLM-TARGETS`-Sektion bleibt unberührt.
- Der Warn-Block in `freshness:check` wird **generisch** über eine Ziel-ID-Liste parametrisiert
  (`HG_LOCAL_ONLY_GOALS`), nicht als `G-WT`-spezifischer Block. T002442 trägt seine IDs derselben
  Liste nach, statt einen zweiten Block anzulegen — sonst kollidieren beide Vorgänge an derselben
  Taskfile-Stelle.

_Ticket: T002443_
