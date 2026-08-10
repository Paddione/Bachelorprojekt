# P4 — Guard-Registry plan-guards.yaml

Rolle: **impl**. Disjunkter Partial des Change `cross-harness-plan-guardrails` (T003267),
Komponente 4 aus `design.md`: der deklarative Guard-Katalog, den der Parity-Test (Partial
p6, `tests/spec/dev-flow-plan/guard-parity.bats`) iteriert. Bewusst KEIN Generator — die
Registry ist Prüfgrundlage, nicht Quelle der Skill-Prosa (User-Vorentscheidung 1).
Failing-Tests trägt p6; die Anker in der opencode-Datei entstehen erst durch den
Prosa-Sync in p5 — deshalb ist `guard-parity.bats` in der Rotphase rot, genau wie es
STRUCT2 verlangt. Hier stehen bewusst KEINE Failing-Test- oder Verify-Tasks.

Anker-Verifikation (2026-08-10, gegen `0d9ea8efb`, Befehl je Anker:
`grep -l '<anchor>' .claude/skills/dev-flow-plan/SKILL.md .claude/skills/references/dev-flow-plan-phases.md .claude/skills/references/ticket-stage-procedure.md .opencode/skills/opencode-flow-plan/SKILL.md`):
alle unten gelisteten Anker treffen HEUTE in den genannten `.claude`-Dateien;
in `.opencode/skills/opencode-flow-plan/SKILL.md` trifft heute nur `T002444` und
`--hold` — der Rest wird von p5 nachgezogen (Soll-Zustand dieses Katalogs).

---

## File `docs/agent-guide/registry/plan-guards.yaml` (net-new)

- Sprache: YAML · kein S1-Limit für `.yaml` außerhalb `k3d/` · Zielumfang ~90 Zeilen.
- Schema bewusst flach und `yq`-trivial (p6 iteriert mit
  `yq -r '.guards[].id'` bzw. `.guards[] | .anchor + "\t" + (.applies_to | join(","))`).

### Task P4.1 — Datei mit Kopf-Kommentar und Schema anlegen

- [ ] `docs/agent-guide/registry/plan-guards.yaml` anlegen. Kopf-Kommentar (wörtlich
      übernehmbar):

```yaml
# plan-guards.yaml — Katalog der Prozess-Guards des Planungs-Flows. [T003267]
#
# Zweck: deklarative Pruefgrundlage fuer tests/spec/dev-flow-plan/guard-parity.bats.
# Jeder Guard MUSS in jeder applies_to-Datei per anchor-Substring auffindbar sein —
# so kann die Skill-Prosa der Harnesse (Claude Code, opencode/agy) nicht mehr still
# auseinanderdriften (Audit 2026-08-10: ~16 Drift-Punkte, nur der Claude-Pfad wurde
# gepflegt).
#
# Pflegeregel: neuer Prozess-Guard im Planungs-Flow => HIER eintragen UND in allen
# applies_to-Dateien verankern. Asymmetrien sind legitim und werden ueber die
# applies_to-Liste deklariert (Beispiel: T002444 gilt nur fuer opencode).
# KEIN Generator: die Prosa bleibt handgepflegt, dieser Katalog prueft nur Praesenz.
# Design: openspec/changes/cross-harness-plan-guardrails/design.md (archiviert:
# openspec/specs/dev-flow-plan.md).
guards: []
```

### Task P4.2 — Guard-Einträge eintragen

- [ ] Die `guards:`-Liste mit genau diesen Einträgen füllen. `anchor` ist ein
      Fixed-String-Substring (`grep -F`), KEIN Regex — Ticket-Codes sind die stabilsten
      Anker; wo keiner existiert, eine kurze wörtliche Kernphrase:

```yaml
guards:
  - id: T002673
    title: "stage-plan erst NACH dem Plan-Commit (touched_files sonst still leer)"
    anchor: "T002673"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .claude/skills/references/ticket-stage-procedure.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002816
    title: "kein fertig aussehender PR aus dem Plan-Stand (Draft + [plan-only])"
    anchor: "T002816"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002829
    title: "Prior-Art-Suche vor der ersten Architekturfrage (Schritt 0.7)"
    anchor: "T002829"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002279
    title: "check-merged-Preflight vor der Worktree-Anlage"
    anchor: "T002279"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .claude/skills/references/dev-flow-plan-phases.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T003102
    title: "Pre-Commit-Lock-Match akzeptiert ticket- UND branch-scoped Claims"
    anchor: "T003102"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002820
    title: "Verfuegbarkeits-Guard fuer externe Binaries schon in der Rotphase"
    anchor: "T002820"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002448-M5
    title: "Bug-Triage: Symptom vs. Ursachen-Hypothese VOR dem Loesungsdesign trennen"
    anchor: "T002448-M5"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: hold-decision
    title: "stage-plan: explizite Hold-Entscheidung (--hold interaktiv, --no-hold headless)"
    anchor: "--hold"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .claude/skills/references/ticket-stage-procedure.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: plan-preflight
    title: "Pre-Commit-/Worktree-Guards laufen ueber scripts/plan-preflight.sh, nicht als Inline-Snippet"
    anchor: "plan-preflight.sh"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: plan-intel
    title: "intel.json wird deterministisch von scripts/plan-intel.sh erzeugt, nicht von Hand"
    anchor: "plan-intel.sh"
    applies_to:
      - .claude/skills/references/dev-flow-plan-phases.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: plan-quality-gates
    title: "Plan-Subagenten-Prompt bindet plan-quality-gates + plan-lint --rules verbindlich ein"
    anchor: "plan-quality-gates"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: plan-stage-commit-title
    title: "Stage-Commits heissen chore(plans):, nie fix()/feat() (T001434)"
    anchor: "chore(plans):"
    applies_to:
      - .claude/skills/dev-flow-plan/SKILL.md
      - .claude/skills/references/dev-flow-plan-phases.md
      - .opencode/skills/opencode-flow-plan/SKILL.md
  - id: T002444
    title: "opencode-only: agent-collision.sh check --branch vor der Worktree-Anlage"
    anchor: "T002444"
    applies_to:
      - .opencode/skills/opencode-flow-plan/SKILL.md
```

- [ ] Nach dem Eintragen jeden Anker gegen die `.claude`-Dateien verifizieren
      (`grep -Fl '<anchor>' <applies_to…>` — für die `.opencode`-Datei ist Rot der
      Sollzustand bis p5 gemergt ist).

### Task P4.3 — Registry-Umgebung verträgt die neue Datei

- [ ] `node scripts/agent-guide/validate.mjs` ausführen: der Validator kennt
      `agents.yaml`/`mcp.yaml`/`capabilities.yaml` — verifizieren, dass eine zusätzliche
      Datei im Registry-Verzeichnis weder validiert noch abgelehnt wird (erwartet:
      unverändert grün). Falls der Validator Verzeichnis-globbing macht und die Datei
      ablehnt, den Dateinamen-Filter dort NICHT anfassen, sondern das Ergebnis im
      PR-Text dokumentieren und die Registry nach `docs/agent-guide/registry/` belassen —
      die Datei ist bewusst kein Generator-Input.
- [ ] `task agent-guide:maps` (bzw. `bash scripts/vda.sh oracle 'regenerate agent guide maps'`)
      läuft unverändert durch — die Maps-Generatoren lesen ihre Quellen explizit und
      dürfen von `plan-guards.yaml` nichts wissen.
- [ ] YAML-Syntax-Probe: `yq -r '.guards | length' docs/agent-guide/registry/plan-guards.yaml`
      liefert `13`.

---

## Scope-Grenzen (nicht in P4)

- Kein BATS-Test (`guard-parity.bats` liegt bei p6), keine Verify-Kette (Index).
- Keine Prosa-Änderung an den Skill-Dateien (p5) — die Registry beschreibt den
  Soll-Zustand NACH p5; bis dahin ist der Parity-Test erwartungsgemäß rot.
- Kein `task`-Wrapper und kein CI-Job — der Test läuft über den bestehenden
  BATS-Runner (`bats -r tests/spec/`).
