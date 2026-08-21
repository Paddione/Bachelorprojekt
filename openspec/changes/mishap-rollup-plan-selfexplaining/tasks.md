---
title: "mishap-rollup-plan-selfexplaining — Implementation Plan"
ticket_id: T013043
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-plan-selfexplaining — Implementation Plan

Der Rollup-Plan soll sich selbst erklären: eine abhakbare Task pro Mishap-Eintrag mit
Pflicht-Disposition, dazu eine Arbeitsanweisung im Kopf, und kein Automatik-Rauschen im Plan.
Hintergrund und Belege stehen im `proposal.md` dieses Change.

## File Structure

```
scripts/factory/rollup-plan-tasks.sh                              (NEU — Renderer, liest Kommentare von stdin)
scripts/factory/mishap-rollup.sh                                  (nutzt den Renderer für Zählung und Tasks-Sektion)
tests/spec/mishap-rollup/rollup-plan-per-entry-tasks.bats         (RED-Test, liegt bereits vor)
.claude/skills/mishap-tracker/SKILL.md                            (Step 3.5: neue Plan-Struktur benennen)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `tests/spec/mishap-rollup/rollup-plan-per-entry-tasks.bats`
      ist mit diesem Plan committet und rot — der Renderer existiert noch nicht, alle sechs
      Fälle enden mit Exit 127.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/rollup-plan-per-entry-tasks.bats
# expected: FAIL (rot — scripts/factory/rollup-plan-tasks.sh fehlt noch)
```

- [x] **Renderer anlegen (GREEN, Teil 1).** `scripts/factory/rollup-plan-tasks.sh` schreiben.
      Vertrag, wie ihn der Test misst:
      - liest den Kommentar-Strom des Containers von stdin,
      - erkennt Batch-Kommentare am Header `### Mishap-Rollup` und Einträge am Muster
        `**N. Titel** (typ, komponente)` — dasselbe Muster, das
        `scripts/factory/mishap-rollup-artifacts.sh` bereits parst; die Regex dort ist die
        Vorlage, damit beide Skripte nicht auseinanderlaufen,
      - `--count` gibt die Zahl der Einträge auf stdout aus und endet mit Exit 0, auch bei 0,
      - ohne Flag rendert es die Tasks-Sektion: Arbeitsanweisung mit den drei zulässigen
        Dispositionen (gefixt / bereits gefixt / kein Repo-Fix), dann pro Eintrag eine Zeile
        `- [ ] **N. Titel** (typ, komponente) — Disposition: …`,
      - Nicht-Batch-Kommentare (Watchdog, `Unfactored`, Executor-Notizen) werden verworfen.

- [x] **Generator umstellen (GREEN, Teil 2).** In `scripts/factory/mishap-rollup.sh`:
      - Die Kommentar-Abfrage (heute zweimal: Zählung und Plan-Inhalt) auf **einen** Lauf
        zusammenziehen und vor die Worktree-Anlage ziehen, damit der No-op-Pfad erhalten bleibt.
      - `BATCH_COUNT` aus `rollup-plan-tasks.sh --count` beziehen statt aus dem SQL-`COUNT(*)`.
        Bei 0 bleibt es beim heutigen Verhalten: Meldung und Exit 0 ohne Worktree.
      - Im `tasks.md`-Heredoc die drei generischen Checkboxen durch die Ausgabe des Renderers
        ersetzen. Die Blockquote-Einbettung der Batch-Prosa bleibt erhalten — sie neutralisiert
        Beispiel-Commit-Scopes für plan-lint P2 (Kommentar aus T007000 im Skript beachten).
      - Der finale Verifikations-Task des generierten Plans bleibt unverändert, sonst verliert
        der erzeugte Plan seine STRUCT3-Konformität.

- [x] **Skill-Doku nachziehen.** In `.claude/skills/mishap-tracker/SKILL.md` unter Step 3.5
      beschreiben, was der generierte Plan trägt (eine Task pro Eintrag, Pflicht-Disposition,
      die drei zulässigen Dispositionen) und dass nur `### Mishap-Rollup`-Kommentare als Batch
      zählen. Das ist die Stelle, an der ein Modell nachschlägt, bevor es einen Container
      anfasst.

- [x] **Regressionsprobe am echten Batch.** Den Renderer gegen einen realen Container-Kommentar
      fahren und die Ausgabe ansehen — der 08-19-Batch auf T012445 ist der belegte Fall mit
      10 Einträgen und Watchdog-Rauschen im selben Container:

```bash
psql -At -c "SELECT c.body FROM tickets.ticket_comments c
             JOIN tickets.tickets t ON t.id = c.ticket_id
             WHERE t.external_id = 'T012445' ORDER BY c.created_at" \
  | bash scripts/factory/rollup-plan-tasks.sh
# erwartet: 10 Eintrags-Tasks, keine Watchdog-Zeile
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
