# Proposal: collision-window

## Why

`scripts/agent-collision.sh` läuft seit T000882 im `.githooks/pre-commit` und soll warnen, wenn eine
andere lebende Session dieselbe Datei in Arbeit hat. Er meldet praktisch nie etwas — und das sah bis
jetzt aus wie ein Repo ohne Kollisionen.

Am 2026-07-28 arbeiteten drei Worktrees gleichzeitig an `scripts/agent-lock.sh`
(`chore/fix-ticket-tracking-T002279`, `chore/mishap-T002341`, `chore/mishap-T002374`). Keine Warnung
kam. Die Nachmessung zeigt zwei unabhängige Filter, die sich zu einer Trefferquote nahe null
multiplizieren:

- **Harness-SIDs gelten als tot.** `_sid_alive` in `agent-collision.sh` ist eine Kopie derselben
  Funktion aus `agent-lock.sh`, die den Fix aus **T001268** nicht mitbekommen hat. Dort werden
  nicht-numerische SIDs als lebendig behandelt, weil `pgrep -s` nur POSIX-Session-IDs auflöst und
  Claude-Code-Sessions UUIDs registrieren. Die Kopie ruft direkt `pgrep -s` auf. Gemessen: **null
  von elf** Peers werden als lebendig erkannt, während `agent-lock.sh list` dieselben als `live`
  führt.
- **Das Sichtfenster endet am Working Tree.** Die Peer-Menge kommt aus `git diff --name-only HEAD`
  plus `--cached`. Die `dev-flow-*`-Skills committen aber früh und mehrfach; wenige Minuten nach
  Arbeitsbeginn ist ein Peer wieder unsichtbar. Gemessen über 23 Worktrees: **154 Dateien** sind
  tatsächlich in Arbeit, **3** davon sieht der Detektor. Von den drei Kollidenten oben waren **0
  von 3** sichtbar.

Dass es unbemerkt blieb, hat einen eigenen Grund: `tests/unit/agent-collision.bats` setzt in jedem
Test `AGENT_LOCK_FAKE_ALIVE`, und dieser Override greift in `_sid_alive` **vor** dem `pgrep`-Pfad.
Die Suite umgeht strukturell genau die Zeile, die produktiv bricht.

## What

Vier Änderungen, alle in `scripts/agent-collision.sh`. `scripts/agent-lock.sh` bleibt unangetastet —
dort arbeiten aktuell drei Worktrees, und eine Extraktion in eine gemeinsame Bibliothek würde einen
Vier-Wege-Konflikt provozieren. Gegen erneute Drift steht stattdessen ein Guard-Test.

- **Nicht-numerische SIDs als lebendig behandeln** — den Zweig aus `agent-lock.sh` spiegeln, mit
  Verweis auf T001268. Numerische SIDs bleiben `pgrep`-verifiziert, damit tote Sessions tot bleiben.
- **Peer-Menge um committete Branch-Divergenz erweitern** — `main...HEAD` zusätzlich zu unstaged und
  staged. Der Drei-Punkt-Operator ist Pflicht: der Zwei-Punkt-Diff wurde gemessen und verworfen, er
  zieht den gesamten `main`-Fortschritt seit dem Fork mit (52–386 statt 0–13 Dateien pro Worktree).
- **Blob-Filter gegen squash-gemergte Branches** — nach einem Squash-Merge listet `main...HEAD` die
  Dateien weiter, obwohl die Arbeit in `main` steht. Ist der Blob im Peer identisch mit dem in
  `main`, entfällt der Eintrag. Gemessen wären das sonst **3 von 11** Fehlalarmen.
- **`--branch`-Modus** — prüft die eigene Branch-Divergenz statt der staged Files und macht den
  Detektor damit **vor** Arbeitsbeginn nutzbar, nicht erst im pre-commit.

Unverändert bleiben das fail-open-Prinzip (`AGENT_COLLISION_STRICT=1` bleibt der einzige harte
Block), der `linguist-generated`-Filter aus T002375-p6 und die Freiheit von Cluster- und
DB-Abhängigkeiten.

Nach dem Fix bleiben repo-weit **5 Dateien in 7 von 23 Worktrees** als Warnung übrig — Signal, kein
Rauschen. Eine zusätzliche Drossel ist nicht nötig.

**Out of scope:** semantische Kollisionen (zwei Worktrees, die in *verschiedenen* Dateien
Widersprüchliches tun — seit T002416 mergen die konfliktfrei und sind für jede pfadbasierte
Erkennung unsichtbar; eigenes Ticket, hängt an T002423); Merge-Arbitrierung bei ≥3 PRs (T002423);
Dedup der Helferfunktionen nach `scripts/lib/`; `scripts/factory/conflict-check.sh`, das die andere
Frage beantwortet (Factory-Dispatch-Gate über deklarierte `touched_files`).

_Ticket: T002444_
