# Design: Review-Gate als Orchestrator-Gate vor Auto-Merge

Status: entschieden (2026-08-14, Fix-Pfad T005565) · Lösungsrichtung: **B — Orchestrator-Gate
vor Auto-Merge** (nicht A — Sub-Schritt im Implementer-Prompt).

## 1. Symptom vs. Ursache (T002448-M5)

| | |
|---|---|
| **Symptom (Fakt, T005307)** | Das Review-Gate (Schritt 3.8, `requesting-code-review`) wurde nicht als separater Schritt ausgeführt; der Implementer hat implementiert, verifiziert und direkt PR + Auto-Merge erstellt; PR #4444 wurde bei grüner CI gemergt. |
| **Ursachen-Hypothese (belegt)** | Die Gelegenheit, ohne Review zu mergen, existiert konstruktiv: Der Implementer-Auftrag (Schritt 2-Prompt, Zeile 87) autorisiert PR-Erstellung UND `gh pr merge --auto` in einem Zug und erwähnt das Review-Gate nicht. Schritt 3.8 ist ein passiver Skill-Abschnitt ohne Eigentümer, Evidenz oder Durchsetzungspunkt; die Orchestrator-Gates (5.5 CI-Watch, 6 Phase-Chain) prüfen kein Review. |

Belegstellen im Quelltext (`.claude/skills/dev-flow-execute/SKILL.md`):

- Zeile 87 (Mandat): "Erstelle einen PR und fordere Auto-Merge an (`gh pr merge --auto --squash` …)"
- Zeilen 88–90 (ENDE): meldet nur CI-Fix-Schleife (5.5), Merge-Wait, Ticket-Abschluss, Archiv — kein Review-Gate
- Zeilen 159–165 (Schritt 3.8): existiert als "Mandatory", aber ohne Anker im Mandat und ohne Ausführungszwang
- Zeilen 192–193 (Schritt 5): Auto-Merge-Block, kein Review-Bezug
- Schritt 5.5/6: Orchestrator-Gates prüfen CI und Phase-Chain (`plan:done`, `implement:entered`, `verify:done`) — kein `review`

## 2. Prior-Art-Suche (T002829) — gefundene bestehende Entscheidungen

1. **`openspec/specs/agent-skills.md`, Requirement "dev-flow-execute trennt Implementer- und
   Orchestrator-Zuständigkeit" (Zeilen 390–418):** Implementer-Auftrag endet nach
   `gh pr merge --auto`; CI-Watch ist Orchestrator-Schritt. Die Hintergrund-Notiz dokumentiert
   die Repo-Lehre: *"Ein reines Prompt-Verbot blieb über mehrere Durchläufe wirkungslos. Die
   Härtung entfernt die Gelegenheit, statt die Direktive zu verschärfen."*
   → Wird von Richtung B **modifiziert** (vollständiger Ersatztext im Delta, Konvention
   `openspec/config.yaml`: MODIFIED-Deltas tragen den vollständigen Ersatztext).
2. **`openspec/specs/agent-skills.md`, Requirement "Der Implementer entfernt den Worktree nicht"
   (Zeilen 420–435):** Derselbe Fehlermodus wie T005307 — in der Skill dokumentiert, im
   Implementer-Auftrag fehlend, vom Implementer übersprungen. Behebung damals: explizite
   Verankerung im Implementer-Auftrag + Orchestrator-Zuordnung (Schritt 7.5). Das Muster
   bestätigt Richtung B.
3. **`tests/spec/ci-cd.bats`, T002272-M2:** kodiert die Ordnungsgarantie "Auto-Merge wird vor
   der CI-Watch-Schleife angefordert" (`merge_line < watch_line`). Unter B bleibt die Garantie
   erhalten — der Anker verschiebt sich vom Schritt-5-Header auf den Code-Review-Gate-Abschnitt.
4. **`openspec/specs/agentic-review.md`:** CI-seitige agentic Review-Pipeline (advisory, keine
   Required-Check) — betrifft den CI-Review, nicht das dev-flow-execute-Prozess-Gate. Kein
   Konflikt, keine Änderung nötig.
5. **Parallele Proposals geprüft:** `mishap-bundle-dev-flow` (Schritt 0-Scripts, disjunkt),
   `cross-harness-plan-guardrails` (kein Bezug), `batch-ci-check-evaluation` (kein Bezug) —
   kein Overlap mit den Abschnitten 2/3.8/5/5.5 der SKILL.md.

## 3. Richtungsentscheidung: B — Orchestrator-Gate vor Auto-Merge

Richtung A (Sub-Schritt im Implementer-Prompt) wurde bewusst verworfen:

| Kriterium | A (Prompt-Sub-Schritt) | B (Orchestrator-Gate) |
|---|---|---|
| Fehlermodus adressiert | Direktive verschärfen — die Klasse, die laut Repo-Lehre (Punkt 2.1) bereits mehrfach wirkungslos blieb | Gelegenheit entfernen: ohne Review-Gate kein Auto-Merge — fail-closed im Prozess |
| Unabhängigkeit | Derselbe Kontext attestiert sein eigenes Review (Self-Attestation) | Orchestrator ist separater Kontext (T002365 Arbeitsteilung) — "unabhängige Prüfung" real |
| Evidenz/Verifizierbarkeit | Implementer-Selbstbericht, nicht nachprüfbar | Definiertes Gate mit Review-Verdikt VOR `gh pr merge --auto` |
| Vorbild im Repo | — | T002352-M1 (Worktree-Cleanup): Mandat-Verankerung + Orchestrator-Zuordnung; T002365 (CI-Watch): Orchestrator-Übernahme |

**Entscheidung:** Das Review-Gate wird ein **Orchestrator-Schritt (PFLICHT vor Auto-Merge)**.
Der Implementer-Auftrag endet nach der PR-Erstellung; `gh pr merge --auto --squash` wird erst
vom Orchestrator nach bestandenem Review-Gate abgesetzt. Die Ordnungsgarantie aus T002272-M2
(Auto-Merge vor CI-Watch) bleibt erhalten: Review-Gate (3.8) → Auto-Merge → CI-Watch (5.5) →
Phase-Chain (6).

## 4. Änderungsform (Scope)

**In Scope (Claude-Code-Pfad, primär):**
- `.claude/skills/dev-flow-execute/SKILL.md`:
  - Schritt 2-Mandat: "Erstelle einen PR (OHNE Auto-Merge — `gh pr merge --auto` ist
    Orchestrator-Aufgabe nach dem Review-Gate, Schritt 3.8)"; ENDE-Block nennt das Review-Gate;
    Arbeitsteilungs-Kommentar (T002365) an die neue Grenze angepasst.
  - Schritt 3.8 → "Code-Review-Gate (Orchestrator, PFLICHT vor Auto-Merge)": Orchestrator ruft
    `requesting-code-review` auf (opencode: `pr-review-toolkit:review-pr`/delegate), reicht
    Findings per `SendMessage` an den bereits gespawnten Implementer zurück (Muster Exit 3/4),
    setzt nach Approval `gh pr merge --auto --squash` ab (Kommando wandert aus Schritt 5,
    inkl. T004612-Kommentar).
  - Schritt 5: Auto-Merge-Block entfernen; M1-Lesson (T001899) verwiesen auf Schritt 3.8.
  - Schritt 5.5: "Auto-Merge ist bereits angefordert (Schritt 5)" → "nach dem Review-Gate
    (Schritt 3.8)".
- **Follow-up (Lane-Begrenzung, nicht in diesem Fix):** `.opencode/skills/opencode-flow-execute/SKILL.md`
  — Schritt 4 (Code Review Gate) als PFLICHT vor Schritt 6 (Auto-Merge) verankern; die
  Falschaussage "Auto-Merge ist bereits angefordert (Schritt 5)" in Schritt 5.5 korrigieren.
  Gleiche Schwäche wie der Claude-Code-Pfad (gleicher Fehlermodus: `gh pr merge --auto --squash`
  in Schritt 6 ohne Review-Anker im Mandat). Warum hier raus: Der Auftrag für T005565 begrenzt
  die Lane auf `.claude/skills/dev-flow-execute/**` (+ zugehörige Orchestrator-Gate-Referenzen)
  und die neuen Testdateien — `alles andere` ist ausdrücklich tabu. Die opencode-Härtung wird als
  eigenes Ticket nachgezogen; bis dahin gilt die Mishap-Klasse im opencode-Runtime als bekannt
  offen (dokumentiert in proposal.md Impact).
- **In Scope (Tests):**
  - Neu: `tests/spec/agent-skills/review-gate-before-auto-merge.bats` (failing Test, Source-Grep-
    Modus — dokumentierte Ausnahme von T002448-M4 für Konventionstests auf Skill-Content).
  - Anpassung: `tests/spec/ci-cd.bats` T002272-M2 (Anker + Semantik, s. o.).
- **Spec-Delta:** `openspec/changes/review-gate-enforce/specs/agent-skills.md` — ADDED
  (Review-Gate als Orchestrator-Gate) + MODIFIED (Zuständigkeitstrennung, vollständiger
  Ersatztext).

**Nicht in Scope:**
- Factory-Pipeline (`pipeline.js`), GitHub Branch-Protection, `requesting-code-review`-Skill
  selbst, `.claude/skills/OVERVIEW.md` (Mapping-Tabelle bleibt gültig: die Zeile beschreibt die
  Skill-Zuordnung, nicht die Ausführungsebene).
