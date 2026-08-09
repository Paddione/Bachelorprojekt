# Proposal: main-ci-branch-precondition

## Why

Der CI-Workflow schlägt auf `main` bei jedem Lauf fehl — zuletzt Run 31326387787 (Commit
c56329e8d), Job „Factory spec shard 3", mit Folgefehler im Aggregat-Job „Factory + OpenSpec +
Guards". Ein dauerhaft rotes `main` kostet nicht nur den Signalwert der Pipeline: ein echter
Regressionsbefund wäre darin nicht mehr von der Dauerstörung zu unterscheiden.

**Symptom (beobachtet, reproduziert).**
`tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats:48` scheitert mit
`` `[ "$current_branch" != "main" ]' failed ``. Lokal auf `main` bei sauberem Arbeitsbaum
reproduziert; Tests 1 und 3 derselben Datei sind grün.

**Ursache (verifiziert, nicht angenommen).**
Der Test ermittelt in Zeile 47 den Branch des *lebenden* Checkouts und macht in Zeile 48
`!= "main"` zur harten Vorbedingung. Damit negiert die Vorbedingung genau die Zusicherung, die
der Test im Titel aufstellt („läuft unabhängig vom Branch"). Auf Feature-Branches ist sie
erfüllt und deshalb unsichtbar; auf `main` — also in jedem Post-Merge-Lauf — fällt sie um.

Die naheliegende Gegenhypothese ist geprüft und widerlegt: `worktree-create.sh --help` liefert
**auf `main`** rc=0, gibt keine `FATAL`-Zeile aus und nennt `--unattended` zweimal. Alle drei
verbleibenden Zusicherungen des Tests halten dort also. Die Vorbedingung deckt keinen echten
Skript-Defekt zu — der Fix gehört in den Test, nicht in `scripts/worktree-create.sh`.

**Warum zusätzlich ein Guard.**
Der Fehler ist die einzige Stelle dieser Art im Repo; alle sieben übrigen Branch-Assertions in
`tests/` arbeiten gegen ein Wegwerf-Repo (`git -C "$TMP/…"`). Diese Trennlinie ist heute nirgends
geprüft, sondern nur eingehalten. Ohne Guard reproduziert sich der Fehler bei der nächsten
Gelegenheit, und er fällt erst nach dem Merge auf — also zum spätestmöglichen Zeitpunkt.

## What

1. **`tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats`** — Zeilen 45–48
   entfernen (Kommentar und Branch-Vorbedingung). Die drei tragenden Zusicherungen bleiben
   unverändert.
2. **`tests/spec/ci-cd/bats-no-live-branch-assertion.bats`** (neu) — Guard, der jede `.bats`-Datei
   ablehnt, die den Branch des lebenden Checkouts liest. Erkennung als Denylist über die zwei
   nachweislich betroffenen Formen (`git -C "$REPO_ROOT" …`, `git …` ohne `-C`), mit Ausschluss
   von Kommentarzeilen und der Guard-Datei selbst.

**Non-Goals.**
- Kein Umbau des betroffenen Tests auf eine Fixture. Seine Aussage („`--help` funktioniert auf
  jedem Branch") braucht gerade kein kontrolliertes Repo, sondern das reale.
- Keine Änderung an `scripts/worktree-create.sh` — dort ist nachweislich nichts defekt.
- Keine Ausweitung des Guards auf andere Umgebungsabhängigkeiten von Tests (Uhrzeit, Netz, cwd).
  Dafür gibt es keinen Befund; die Ausweitung wäre Spekulation.

_Ticket: T003045_
