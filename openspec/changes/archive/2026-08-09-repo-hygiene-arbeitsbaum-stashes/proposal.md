# Proposal: repo-hygiene-arbeitsbaum-stashes

## Why

Die SSOT-Mechanik des `repo-hygiene`-Skills — `.claude/skills/references/repo-hygiene-ops.md` —
deckt den **lokalen Arbeitszustand** nicht ab. Sie kennt fünf Abschnitte (Stale Worktrees, Stale
Branches, PR-Triage, Issue-Intake, Factory-Queue) und keinen für ungespeicherte Änderungen oder
Stashes.

### Symptom (Fakt, gemessen) vs. Hypothese

Getrennt nach der Bug-Triage-Konvention [T002448-M5]:

- **Symptom, direkt messbar — keine Hypothese nötig:**
  `grep -ci 'stash' .claude/skills/references/repo-hygiene-ops.md` liefert **0** (gemessen
  2026-08-09 auf `fix/repo-hygiene-stashes-T002709`). Die Abschnittsliste der Datei
  (`grep '^## '`) nennt die fünf oben genannten Themen; Arbeitsbaum und Stash kommen darin nicht
  vor. Die Ursache ist damit nicht *vermutet*, sondern die Abwesenheit selbst ist der Befund.
- **Wirkung, real beobachtet (2026-08-08):** Der Skill wurde mit dem Anliegen „unsaved changes"
  aufgerufen und musste die gesamte Mechanik improvisieren. Vorgefunden wurde dabei genau das,
  was ein solcher Abschnitt gefunden hätte: ein funktionaler Patch an `scripts/bge-mcp/server.mjs`
  lag ungespeichert und ohne Ticket im `main`-Checkout, dazu drei Stashes (ältester vom
  2026-08-03), deren Inhalte inzwischen über Commit `0a2493ffd` vollständig in `main` angekommen
  waren.

### Zwei Mechanik-Fallen, die der Lauf teuer gelernt hat

Beide sind im Ticket belegt und gehören in die SSOT, sonst lernt sie jeder Lauf neu:

1. **Pfadgefilterte Stash-Inspektion.** `git stash show -p "stash@{N}" -- <pfad>` schlägt mit
   `Too many revisions specified` fehl. Brauchbar ist `git diff "stash@{N}^" "stash@{N}" -- <pfad>`.
2. **Relevanz-Entscheidung.** Die Frage „ist der Stash noch relevant?" beantwortet **nicht** der
   Stash-Diff gegen seinen eigenen Basiscommit — der sieht *immer* ungemergt aus, egal ob der
   Inhalt längst in `main` steht. Maßgeblich ist die Prüfung der konkreten Marker aus dem
   Stash-Diff im **heutigen** `main`.

Falle 2 ist die gefährlichere: sie führt entweder zum Horten toter Stashes oder — bei
umgekehrtem Fehlschluss — zum Verwerfen ungesicherter Arbeit.

## What

Ein Vorgang, klein gehalten: **Erweiterung der Skill-Referenz plus ein Guard.**

1. **Neuer Abschnitt `## 0. Arbeitsbaum & Stashes` in `repo-hygiene-ops.md`**, eingefügt **vor**
   dem heutigen `## 1. Stale Git Worktrees`. Er deckt ab: Befund im Hauptcheckout
   (`git status --porcelain`), Entscheidung pro ungetickter Änderung, Stash-Inventar, die
   pfadgefilterte Inspektionsform aus Falle 1, die Marker-gegen-`main`-Relevanzprüfung aus Falle 2
   und eine Fail-Closed-Regel (Marker nicht auflösbar → Stash **behalten**, nicht droppen).

   **Entscheidung: Nummer `0` statt Renumbering auf `1`.** Die bestehenden Nummern `§1`–`§5` sind
   außerhalb der Datei referenziert — `.claude/skills/repo-hygiene/SKILL.md` (Ablaufliste
   `§1`…`§5`) und `docs/superpowers/references/gotchas-footguns.md:184` (`repo-hygiene-ops.md §3`).
   Ein Renumbering machte diese Verweise still falsch; `§0` hält sie gültig und stellt den
   Abschnitt trotzdem an die inhaltlich richtige Stelle: **Arbeit sichern ist Vorbedingung jedes
   Worktree-Removes**, nicht dessen Nachspiel.

2. **Guard** `tests/spec/repo-hygiene/worktree-stash-inspection.bats` (neu, eigene Datei nach der
   Verzeichniskonvention T002416; `task test:spec` erfasst sie über `bats -r` automatisch).

   **Entscheidung zum Prüfmodus:** Der Guard assertiert **nicht** gegen das Ausgabeformat von
   `git` — weder gegen Fehlertexte wie `Too many revisions specified` noch gegen Diff-Header. Das
   wäre genau der Fehler, den das verwandte Ticket T002716 behandelt. Stattdessen extrahiert er
   die dokumentierte Befehlsform **aus der realen Datei** (Muster aus dem Schwester-Guard
   `tests/spec/repo-hygiene/dead-path-references.bats`), führt sie in einem Wegwerf-Repo aus und
   wertet das **Resultat** aus: welche Datei-Inhalte im Diff landen, und ob die Marker-Prüfung
   „schon in `main`" von „noch nicht in `main`" unterscheidet. Jeder Block trägt zuerst einen
   Positiv-Anker (T002356-M1), sonst bestünde er über leerer Kandidatenliste vakuos.

3. **Zwei Ein-Zeilen-Anpassungen an den Verweisen:** `.claude/skills/repo-hygiene/SKILL.md`
   (Ablaufliste um `§0` erweitern, „fünf Abschnitte" → „sechs Abschnitte") und
   `.claude/skills/references/SKILL.md` (Beschreibungszeile der Referenz).

### Out of Scope

- Kein Renumbering der Abschnitte `§1`–`§5` (Begründung oben).
- Keine Automatisierung des Aufräumens (kein Skript, das Stashes droppt). Der Abschnitt beschreibt
  eine Entscheidungsmechanik für einen Bediener; ein Automat, der Stashes verwirft, wäre eine
  eigene, deutlich riskantere Änderung.
- Die vorgefundene Drift, dass `tests/spec/repo-hygiene/dead-path-references.bats` im Kopf auf ein
  nicht existierendes `openspec/specs/repo-hygiene.md` verweist, wird hier **nicht** mitrepariert.
  Der SSOT-Parent dieser Requirements ist `openspec/specs/agent-skills.md`; die neue Datei nennt
  ihn korrekt.

_Ticket: T002709_
