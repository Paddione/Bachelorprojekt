## Context

`.claude/lib/goals.md` misst 65 Repository-Health-Ziele in 11 Kategorien, alle über
`scripts/health-goals-check.sh` (Bash-Einzeiler, `row gate|target <ID> "<messung>" <cmp> <target>
"<beschreibung>"`). Keine dieser Kategorien deckt die Agentic-Tooling-Artefakte des Repos selbst ab
(Subagents, Skills, MCP-Server-Konfiguration, agentische Commands). Eine Explorations-Runde (4
parallele Subagenten über die vier Domänen) hat 17 konkret messbare Kandidaten-Ziele gefunden, davon
10 mit einem heute aktiven Verstoß. Die Brainstorming-Entscheidungen (Lavish-Board, 2026-07-01) legen
fest: alle 17 übernehmen, einheitliches Präfix `G-AGENTIC01`–`17`, sofort als echte Checks verdrahten,
alle 10 Verstöße in diesem Change fixen statt nur zu tracken.

## Goals / Non-Goals

**Goals:**
- 17 neue, reproduzierbare Health-Ziele (`G-AGENTIC01`–`G-AGENTIC17`) für Subagents/Skills/MCP/Commands,
  jedes mit funktionierendem Mess-Befehl, korrekt klassifiziert als Gate (muss grün bleiben) oder
  Target (Reduktionsziel, kein CI-Blocker).
- Alle 10 heute aktiven Verstöße beheben, damit alle 17 Ziele bei Merge grün sind.
- Wiring in `scripts/health-goals-check.sh` (CI-fähig über `task test:changed`/`--strict`) sowie
  Aktualisierung der begleitenden Zähler in `.claude/lib/goals.md` und `.claude/lib/README.md`.

**Non-Goals:**
- Kein Least-Privilege-Tool-Scoping für `bachelorprojekt-{security,infra,db}` in diesem Change
  (G-AGENTIC01 bleibt Target, dokumentiert mit Baseline — echtes Scoping ist eigenständige
  Sicherheitsarbeit mit Risiko, ein Agenten-Tool versehentlich zu breit oder zu eng zu fassen).
- Kein Splitten der drei "God-Skills" (`dev-flow-execute`, `infra-ops`, `dev-flow-plan` > 500 Zeilen) —
  G-AGENTIC09 bleibt Target, dokumentiert.
- Keine Vereinheitlichung des Skill-Dispatch-Mechanismus (`agent:`-Feld vs. CLAUDE.md-Top-Level-Tabelle)
  — G-AGENTIC10 bleibt Target, dokumentiert.
- Keine inhaltliche Deduplizierung von `repo-hygiene` vs. `ticket-ops` (nur die Referenz-Lücke für
  G-AGENTIC07 wird geschlossen, nicht die Content-Überlappung selbst).
- Keine Änderung an Prod-Deploy, Datenbank-Schema oder Laufzeitverhalten der Website/K8s-Services.

## Decisions

**1. Einheitliches Präfix `G-AGENTIC01`–`17` statt 4 Domänen-Präfixe (G-AGT/G-SKL/G-MCP/G-CMD).**
Begründung: alle 17 Ziele gehören zu einer neu eingeführten, zusammenhängenden Kategorie
("Agentic Tooling") — ein Präfix hält die Kategorie in `goals.md` als eine Einheit referenzierbar und
vermeidet vier neue Zwei-Buchstaben-Präfixe für eine einmalige Kategorie-Einführung. Alternative
(verworfen): domänenspezifische Präfixe hätten granularere `--only=`-Filterung erlaubt, aber die
bestehende Konvention ("Neue Ziele nutzen domänenspezifische Präfixe") zielt auf über Zeit organisch
gewachsene Einzelziele, nicht auf eine geplante 17er-Kohorte mit gemeinsamem Ursprung.

**2. Gate vs. Target-Klassifizierung nach "ist der Fix trivial und risikoarm?", nicht nach Domäne.**
14 Ziele werden Gates (4 bereits grün, 10 werden in diesem Change gefixt und damit grün). 3 Ziele
bleiben Targets, weil ihr "Fix" eine eigenständige Design-/Sicherheitsentscheidung erfordert
(Tool-Scoping, SKILL.md-Split, Dispatch-Mechanismus) statt einer mechanischen Korrektur. Ein Gate mit
rotem Baseline-Wert würde ab Merge jede nachfolgende PR blockieren (`GATEFAIL`-Exit-Code 1 in
`health-goals-check.sh`) — deshalb werden nur Ziele mit **erreichbarem grünem Zustand am Merge-Tag**
als Gate eingeführt.

**3. Root-Cause-Fixes statt Ticket-und-weiter (Abweichung vom G-SIZE04/G-CD01-Muster).**
Frühere neue Ziele (z. B. G-SIZE04, ursprünglich G-CD01) haben rot gestartet und wurden über
mehrere Ticket-Generationen (T001280→T001347) verfolgt, ohne den Messwert nachhaltig zu verbessern.
Für die hier gefundenen 10 Verstöße ist das Muster nicht angemessen: jeder Root-Cause ist eine
Ein-/Wenige-Zeilen-Korrektur in einer Doku-/Config-Datei (kein Code mit Laufzeitrisiko) — das
Aufschieben in ein Folge-Ticket hätte hier keinen Vorteil, nur unnötige rote Baselines vom ersten Tag an.

**4. S4-Gate-Scope-Erweiterung (G-AGENTIC17) statt neuer eigenständiger Orphan-Check.**
`docs/code-quality/gates.yaml`'s bestehendes S4-Orphan-Gate (`scripts/code-quality/gates/s4-orphans.mjs`)
ist bereits generisch (Kandidaten-Globs + Referenzquellen-Globs) — die Erweiterung um
`.claude/commands/**/*.md` / `.opencode/commands/**/*.md` wiederverwendet die bestehende Maschinerie
statt ein Parallel-Skript zu bauen.

## Risks / Trade-offs

- **[Risiko] Taskfile-Regex-Erweiterung (G-AGENTIC04) trifft versehentlich zu breit oder zu eng** →
  Mitigation: nach der Änderung `task test:changed` mit einem synthetischen Diff gegen
  `.claude/agents/bachelorprojekt-ops.md` verifizieren, dass exakt `tests/spec/agent-library.bats`
  (und nicht der gesamte BATS-Korpus) getriggert wird.
- **[Risiko] AGENTS.md/CLAUDE.md-Korrekturen (G-AGENTIC02/11) sind SSOT-Dateien, die jeder Agent liest** →
  Mitigation: Diff vor Commit zeichengenau gegen das echte Agenten-Frontmatter bzw. die echte
  `opencode.jsonc`-Serverliste gegenlesen, nicht nur gegen die eigene Erinnerung der Explorations-Runde.
- **[Trade-off] 3 Ziele bleiben bewusst rot/Target statt grün** → dokumentiertes, akzeptiertes
  Ergebnis (siehe Non-Goals) — kein CI-Risiko, da Targets nicht `GATEFAIL`-fähig sind (nur bei
  `--strict` als `OPEN` gezählt).
- **[Risiko] G-AGENTIC17 S4-Scope-Erweiterung findet einen weiteren, von der Exploration nicht
  erfassten Orphan** → Mitigation: `node scripts/code-quality/gates/s4-orphans.mjs` nach der
  Erweiterung laufen lassen; falls ein neuer Fund auftaucht, wird er einzeln bewertet (Prio-A-Fund
  statt Blocker für diesen Change).

## Migration Plan

Keine Laufzeit-Migration — reine Doku-/Config-/Skript-Änderungen. Rollback: `git revert` des
Merge-Commits stellt den alten `goals.md`-Stand wieder her; keine Datenbank- oder Cluster-Zustände
betroffen.

## Open Questions

Keine offenen Fragen — alle Entscheidungspunkte wurden im Lavish-Brainstorming-Board mit dem User
abgestimmt (Präfix-Konvention, Verdrahtungstiefe, Fix-jetzt vs. Track-only).
