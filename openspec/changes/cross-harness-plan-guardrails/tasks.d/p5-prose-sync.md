# P5 — Prosa-Sync + Spec-Delta

Rolle: **impl**. Disjunkter Partial des Change `cross-harness-plan-guardrails` (T003267),
Komponenten 5+6 aus `design.md`: der einmalige Sync der opencode-Skill-Prosa auf den
Guard-Stand des Claude-Pfads (Audit 2026-08-10), der Umbau beider Flow-Skills auf
`plan-preflight.sh`-Aufrufe und das OpenSpec-Delta auf den Parent-Spec `dev-flow-plan`.
Inhaltlich referenziert dieser Partial die in p1–p4 entstehenden Artefakte
(`plan-preflight.sh`, `--no-hold`, `--rules`, `plan-guards.yaml`) — die Dateimengen sind
disjunkt (D1), nur die Ausführungsreihenfolge hängt via `depends_on` an p1–p4.
Failing-Tests trägt p6 — hier stehen bewusst KEINE Failing-Test- oder Verify-Tasks.

Nach diesem Partial muss JEDER Anker aus `docs/agent-guide/registry/plan-guards.yaml`
(p4) in seinen `applies_to`-Dateien vorkommen — das ist das Grün-Kriterium des
`guard-parity.bats` aus p6.

---

## File `.opencode/skills/opencode-flow-plan/SKILL.md` (edit)

- Markdown · kein S1-Limit · Ist 352 Zeilen. Die Datei wächst durch den Sync deutlich —
  akzeptiert; agy erbt sie automatisch („treat the opencode path as authoritative",
  Framework-Mapping beider Skills).

### Task P5.1 — Reihenfolge- und Vertrags-Fixes (die zwei Schadens-Drifts)

- [ ] **Fix-Pfad (Z. ~303):** Die Schrittfolge „schreibe failing Test, erstelle Plan,
      stage, commit und push" umstellen auf: failing Test + Plan schreiben → committen →
      pushen → DANN `stage-plan` — mit dem T002673-Begründungsblock (analog
      `ticket-stage-procedure.md` Z. 1–8: `stage-plan` liest per
      `git cat-file -p "${branch}:${plan}"` aus dem Branch-Commit; vor dem Commit steht
      dort das propose-Skeleton, `touched_files` bliebe leer — seit p2 bricht
      `stage-plan` dann hart ab).
- [ ] **Feature-Loop C.2d (Z. ~229–234):** Stage-Aufruf trägt künftig ein explizites
      Flag samt Entscheidungsregel als Kommentar: Pipeline-Loop mit gewolltem
      Sofort-Dispatch = `--no-hold` (bewusst), interaktiv gehaltener Plan = `--hold`
      (dev-flow-execute released später). Hinweis ergänzen, dass `stage-plan` seit
      T003267 ohne eines der beiden Flags mit Exit 1 abbricht.

### Task P5.2 — Fehlende Guards nachziehen (Drift-Punkte c–h)

- [ ] **Schritt 0.7 Prior-Art-Suche [T002829]** einfügen (vor dem Brainstorming): die
      zwei grep-Befehle über `openspec/specs/` und `tests/spec/` samt der Regel
      „bestehende Entscheidung zitieren → Frage wird ‚beibehalten oder ersetzen?'" —
      Textgrundlage ist der gleichnamige Abschnitt in
      `.claude/skills/dev-flow-plan/SKILL.md` (Z. 75–105), an opencode-Werkzeuge
      angepasst (kein AskUserQuestion-Verweis; HWS-2-Guard von
      `tests/spec/harness-workflow-split.bats` verbietet Claude-only-Tokens).
- [ ] **Preflight check-merged [T002279]:** vor der Worktree-Anlage
      `bash scripts/plan-preflight.sh pre-worktree --ticket "$TICKET_EXT_ID"` mit der
      rc-Tabelle (0 fortfahren / 1 Ticket done + abbrechen / 2 Umgebung reparieren).
- [ ] **Pre-Commit-Guard:** das bestehende Inline-Snippet (Z. ~318–330, prüft heute NUR
      `ticket__…`-Locks) ersetzen durch
      `bash scripts/plan-preflight.sh pre-commit --ticket "$TICKET_EXT_ID"` — damit ist
      der branch-scoped Fallback [T003102] automatisch abgedeckt; T003102 im Text nennen.
- [ ] **Übergabe-/STOPP-Abschnitt** ergänzen (Zustand bei STOPP: Branch gepusht, Plan
      committed, Ticket `plan_staged`, Lock aktiv, KEIN PR) inkl. des
      T002816-Blocks: kein fertig aussehender PR aus dem Plan-Stand; wenn früh ein PR
      gebraucht wird, dann Draft + Titel-Präfix `[plan-only]`.
- [ ] **Rotphasen-Binary-Guard [T002820]** in den Fix-Pfad (Verfügbarkeits-`skip` gehört
      in die Rotphase; `grep -rn '<binary>' .github/workflows/` — 0 Treffer heißt: in CI
      nicht vorhanden) und **Symptom-vs-Hypothese [T002448-M5]** in die Bug-Triage
      (Ursache mit minimalem Reproducer/Log-Evidenz belegen, BEVOR die Lösung entworfen
      wird).

### Task P5.3 — Werkzeug-Drifts bereinigen (Drift-Punkte i–n)

- [ ] **Subagent-Prompt-Kontrakt:** der Plan-Subagenten-/Decompose-Abschnitt verlangt
      künftig verbindlich: (1) `plan-quality-gates`-Referenz lesen,
      (2) Output von `bash scripts/plan-lint.sh --rules` in den Prompt injizieren
      (dieselbe Regelquelle wie Factory und Claude — „gleiche Karten").
- [ ] **`scripts/plan-intel.sh`:** Abschnitt A.1.5 von „intel.json manuell befüllen" auf
      den deterministischen Generator umstellen
      (`bash scripts/plan-intel.sh <slug>` bzw. `--target-files`-Form); Hinweis, dass
      `plan-lint` I1 sonst warnt/failt.
- [ ] **Modelltabelle (Z. ~179–196):** gegen `scripts/llm/loadouts.json` korrigieren —
      `gemma9-factory` existiert nicht mehr (GGUF entfernt), `gemma26-factory` misst
      161024 ctx (nicht 99840); die Ist-Werte beim Umsetzen aus `loadouts.json` ablesen
      und mit dem Lese-Befehl (`jq -r '.loadouts[] | select(.slug=="gemma26-factory").ctx' scripts/llm/loadouts.json`
      — Feldnamen vor Verwendung gegen die Datei prüfen) zitieren, statt Zahlen
      abzuschreiben.
- [ ] **lavish-Verweis (Z. ~101–103):** `.opencode/opencode.jsonc` führt `lavish` unter
      `deny` — den Empfehlungs-Block entfernen oder explizit als „in opencode nicht
      verfügbar; Brainstorming läuft über Frage-Listen im Chat" umformulieren
      (verifizieren, was `opencode.jsonc` aktuell denied, bevor formuliert wird).
- [ ] **Branch-Namen (Z. ~147 vs. ~285–287):** Anlage-Snippet auf
      `feature/<slug>-T<id>` vereinheitlichen (Ticket-vor-Branch, T001917/T002050) —
      die Guard-Prosa verlangt das Suffix bereits, nur das Snippet widerspricht.
- [ ] **`chore(plans):`-Konvention:** Begründung + Guard ergänzen (Implementierungs-
      Präfixe wären eine Lüge; `scripts/check-commit-vs-diff.sh` + `.githooks/commit-msg`
      blockieren; Vorfall T001434).

---

## File `.claude/skills/dev-flow-plan/SKILL.md` (edit)

- Markdown · kein S1-Limit · Ist 329 Zeilen — die Datei wird durch den Umbau KÜRZER.

### Task P5.4 — Inline-Snippets durch plan-preflight-Aufrufe ersetzen

- [ ] Schritt 5 „Pre-Commit Guard": die drei Bash-Blöcke (nicht-main, clean tree,
      Lock-Match, Z. ~204–229) ersetzen durch einen Block
      `bash scripts/plan-preflight.sh pre-commit --ticket "$TICKET_EXT_ID"` — die
      Warum-Prosa (T001268, T003102) bleibt als je ein Satz stehen, die Anker
      `T001268`/`T003102` bleiben erhalten (Guard-Registry p4!).
- [ ] Preflight-Abschnitt (Guards des Feature-Pfads, Z. ~142): `agent-lock.sh
      check-merged`-Aufruf durch `bash scripts/plan-preflight.sh pre-worktree --ticket …`
      ersetzen; T002279-Anker bleibt.
- [ ] Beide `stage-plan`-Snippets (Schritt 5 und Fix-Pfad-Verweis): Hinweis auf den
      neuen Pflicht-Flag-Vertrag ergänzen (ohne `--hold`/`--no-hold` → Exit 1; leere
      touched_files → Exit 1 [T002673], Override `--allow-empty-touched`).

## File `.claude/skills/references/dev-flow-plan-phases.md` (edit)

- Markdown · kein S1-Limit · Ist 382 Zeilen.

### Task P5.5 — Phasen-Referenz auf die neuen Verträge heben

- [ ] Schritt B.1: vor die Worktree-Anlage den `pre-worktree`-Aufruf setzen (ersetzt den
      losen check-merged-Verweis; rc-Tabelle §Preflight bleibt als SSOT der Semantik).
- [ ] Schritt C.2d (Pipeline-Loop): `stage-plan … --partials N` bekommt die explizite
      Flag-Entscheidung + Kommentar (Pipeline-Dispatch = `--no-hold` bewusst; wer
      interaktiv plant und `dev-flow-execute` übergibt, nutzt `--hold` wie im
      Skill-Body Schritt 5).
- [ ] Fix-Pfad Schritt 4.5/5: Reihenfolge-Klarstellung beibehalten und die neuen
      Fehlerbilder (Exit 1 statt stiller stderr-Zeile) nennen.

## File `.claude/skills/references/ticket-stage-procedure.md` (edit)

- Markdown · kein S1-Limit · Ist 104 Zeilen.

### Task P5.6 — Stage-Prozedur: Vertrags- statt Verhaltens-Hinweise

- [ ] Den ⚠-Block „Ohne `--hold` ist das Ticket SOFORT factory-greifbar" (Z. 28–32) zum
      Vertrags-Block machen: `stage-plan` verlangt seit T003267 `--hold` XOR `--no-hold`;
      Fallback-Snippets (Z. 86–91) um das Flag ergänzen; den T002673-Block (Z. 1–8) um
      den neuen harten Fehler ergänzen („seit T003267 bricht stage-plan ab statt still
      leer zu lassen; Override --allow-empty-touched").

## File `openspec/changes/cross-harness-plan-guardrails/specs/dev-flow-plan.md` (Delta)

### Task P5.7 — Delta-Spec: MODIFIED Requirements auf den Parent-Spec

- [ ] Das Skeleton-Delta füllen (Konventionen aus `openspec/config.yaml`: deutsche
      Purpose-Prosa, englische Requirements/Scenarios; Format-Beispiel aus einem
      Archiv-Delta übernehmen, z. B. `ls openspec/changes/archive/*/specs/dev-flow-plan.md`).
      Inhalt — MODIFIED auf die Symmetrie-/Prozess-Requirements des Parent-Spec
      `openspec/specs/dev-flow-plan.md` (Symmetrie-Klausel Z. ~206–262):
      1. Guard-Parity: every process guard SHALL be registered in
         `docs/agent-guide/registry/plan-guards.yaml` and present (anchor substring) in
         every `applies_to` file; `tests/spec/dev-flow-plan/guard-parity.bats` is the
         fail-closed gate.
      2. Preflight: both plan skills SHALL invoke `scripts/plan-preflight.sh`
         (`pre-commit`, `pre-worktree`) instead of inline snippets.
      3. Stage contract: `stage-plan` SHALL require an explicit hold decision
         (`--hold` XOR `--no-hold`) and SHALL fail on an empty touched_files derivation
         unless `--allow-empty-touched` is passed (T002673).
      4. Rule injection: every plan-writing prompt (Claude subagent, opencode
         orchestrator, factory `plan:decompose`) SHALL include the output of
         `scripts/plan-lint.sh --rules`.
      Je Requirement mindestens ein Scenario (Given/When/Then).
- [ ] Nebenbefund im selben Delta korrigieren: der Parent-Spec referenziert den toten
      Pfad `.agents/skills/dev-flow-plan/SKILL.md` (Z. ~19/32/42) — MODIFIED auf den
      realen Pfad `.claude/skills/dev-flow-plan/SKILL.md` (Verifikation beim Umsetzen:
      `ls .agents/skills/ 2>&1` schlägt fehl, `.agents/agents` ist der einzige Symlink).

---

## Scope-Grenzen (nicht in P5)

- Keine Änderungen an Skripten (p1–p3) oder der Registry-YAML (p4) — nur Prosa + Delta.
- Kein Anfassen des Parent-SSOT-Spec direkt: die Änderung fließt beim Archive über das
  Delta (openspec-archive-Merge), nicht durch Direkt-Edit.
- `GEMINI.md` bleibt unverändert (agy delegiert an den opencode-Pfad).
- Keine Failing-Tests, keine Verify-Kette — p6 bzw. Index.
