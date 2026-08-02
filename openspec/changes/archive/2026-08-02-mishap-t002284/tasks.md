---
title: "mishap-t002284 — Implementation Plan"
ticket_id: T002284
domains: [test, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002284 — Implementation Plan

_Ticket: T002284_

Mishap-Bundle mit drei Einträgen aus einem dev-flow-execute-Lauf: (1) `vda.sh ticket get`
projiziert `resolution` (und `severity`/`description`) nicht in sein JSON, obwohl die DB
den Wert führt — zweimal reproduziert (T002254, T002263), verifiziert genau die
Domänenkonvention T001092. (2) Ein Implementer-Subagent hat entgegen der Ein-Ebenen-Regel
selbst einen Sub-Implementer gespawnt, weil die Regel nur in Skill-Prosa steht, die der
Implementer nie liest, statt im Prompt, den er tatsächlich bekommt. (3) `.githooks/pre-commit`
hat eine vom Aufrufer gestagte Änderung an `website/src/data/openspec-status.json` lautlos zu
einem Leer-Diff neutralisiert, weil die Auto-Regeneration den HEAD-Stand reproduzierte —
`git commit` lief grün, aber die Datei fehlte im Commit.

Kein Datei-Overlap zwischen den drei Einträgen: (1) `scripts/vda/ticket/get.sh` +
`tests/spec/ticket-system.bats`, (2) `.claude/skills/dev-flow-execute/SKILL.md` +
`tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats`,
(3) `.githooks/pre-commit` + `.claude/skills/references/verification-block.md` +
`tests/spec/pre-commit-freshness.bats`.

## File Structure

```
| Datei                                                                                       | Ist | Restbudget |
|----------------------------------------------------------------------------------------------|-----|------------|
| `scripts/vda/ticket/get.sh`                                                                  | 35  | 465        |
| `.githooks/pre-commit`                                                                       | 145 | S1 misst diese Datei nicht (keine erkannte Extension) |
| `.claude/skills/dev-flow-execute/SKILL.md`                                                   | 485 | S1 misst diese Datei nicht (.md nicht in der Limit-Tabelle) |
| `.claude/skills/references/verification-block.md`                                            | 77  | S1 misst diese Datei nicht (.md nicht in der Limit-Tabelle) |
| `tests/spec/ticket-system.bats`                                                              | -   | -          |
| `tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats` | -   | -          |
| `tests/spec/pre-commit-freshness.bats`                                                       | -   | -          |
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `scripts/vda/ticket/get.sh:19-29` baut das JSON über
      `json_build_object(...)` und listet dort `external_id, id, type, brand, title, status,
      priority, touched_files, pipeline_slot, created_at, updated_at, plan_ref` — `resolution`,
      `severity` und `description` fehlen in der Projektion, obwohl sie in `tickets.tickets`
      existieren (siehe `scripts/vda/ticket/create.sh:67` INSERT-Liste und
      `scripts/vda/ticket/update-status.sh:62` UPDATE auf `resolution`). Erweitere
      `tests/spec/ticket-system.bats` (existierende Datei) um eine statische Grep-Assertion
      nach dem Muster der bestehenden `T002230:`-Tests in derselben Datei:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
# expected: FAIL (red — 'resolution', t.resolution fehlt in get.sh's json_build_object)
```

      Neuer Test (an `tests/spec/ticket-system.bats` anhängen):

      ```bash
      @test "T002284: get.sh projects resolution in its JSON output" {
        run grep -Fq "'resolution', t.resolution" scripts/vda/ticket/get.sh
        [ "$status" -eq 0 ]
      }

      @test "T002284: get.sh projects severity and description in its JSON output" {
        run grep -Fq "'severity', t.severity" scripts/vda/ticket/get.sh
        [ "$status" -eq 0 ]
        run grep -Fq "'description', t.description" scripts/vda/ticket/get.sh
        [ "$status" -eq 0 ]
      }
      ```

- [x] **Fix-Step M1 (GREEN) — `get.sh` Projektion vervollständigen.** In
      `scripts/vda/ticket/get.sh:19-29` die `json_build_object(...)`-Liste um
      `'resolution', t.resolution, 'severity', t.severity, 'description', t.description`
      ergänzen (Spaltennamen 1:1 aus `tickets.tickets` wie in `create.sh`/`update-status.sh`
      verwendet — keine neue Migration nötig, nur die Projektion nachziehen). Anschließend
      `tests/spec/ticket-system.bats` erneut laufen lassen — jetzt GREEN.

- [x] **Fix-Step M2 (GREEN) — Ein-Ebenen-Regel in den Implementer-Prompt, nicht nur in die
      Skill-Prosa.** `.claude/skills/dev-flow-execute/SKILL.md` Schritt 2 (ab Zeile 256)
      erklärt die Ein-Ebenen-Regel bisher nur als Begründung an den lesenden Orchestrator
      (Zeile 265, `> **Warum EIN Implementer statt ... Fan-out?**`) — der gespawnte
      Implementer-Subagent liest diesen Skill-Text nie selbst, er bekommt nur den
      Auftrags-Prompt aus dem `**Auftrag:**`-Block (ab Zeile 278). Ergänze dort (vor dem
      `**/goal:**`-Bullet) eine wörtliche, negative Direktive, die tatsächlich Teil des
      Subagenten-Prompts wird:

      ```
      - **Ein-Ebenen-Regel (PFLICHT, wörtlich Teil dieses Prompts):** Spawne selbst KEINE
        Subagenten/Sub-Implementer — rufe `superpowers:executing-plans` IN-CONTEXT auf. Wenn du
        glaubst, einen Sub-Implementer für einen Teil-Task zu brauchen, STOPPE und eskaliere
        stattdessen an den Orchestrator zurück, statt selbst zu delegieren. Verschachtelte
        Delegation ist nicht erlaubt (siehe subagent-provisioning.md, 162k-Prompt-Lehre).
      ```

      Zusätzlich: den bestehenden `record_phase_event`-Aufruf beim Dispatch
      (Zeile 258-261, `detail: "Subagent gestartet"`) um die Agent-ID erweitern, sobald das
      `Agent`/`Task`-Tool sie zurückliefert, z.B. `detail: "Subagent gestartet ·
      agent_id=$IMPLEMENTER_AGENT_ID"` — damit der Orchestrator im Nachhinein weiß, welche
      Agent-ID zu welchem Ticket gehört (heute nicht rekonstruierbar, siehe Mishap-Schaden a).
      Erweitere `tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats`
      (existierende Datei, deckt bereits `DEV_FLOW_EXECUTE_SKILL` ab) um eine neue Sektion:

      ```bash
      # ── Mishap T002284: nested-delegation guard must live in the implementer prompt ──
      @test "T002284: dev-flow-execute Auftrag-Block forbids the implementer from spawning sub-agents" {
        run grep -Fq "Spawne selbst KEINE Subagenten" "$DEV_FLOW_EXECUTE_SKILL"
        [ "$status" -eq 0 ]
      }
      ```

- [x] **Fix-Step M3 (GREEN) — pre-commit warnt bei neutralisiertem Staged-Diff.**
      `.githooks/pre-commit` staged in Zeile 83-90 nach `task freshness:regenerate` jede
      Datei aus `_FRESHNESS_FILES`, deren Arbeitskopie sich gegen den Index unterscheidet
      (`git diff --quiet -- "$_f"`, Zeile 85). Reproduzierter Schaden: eine vom Aufrufer
      bereits gestagte Änderung an `website/src/data/openspec-status.json` wurde durch die
      Regeneration exakt auf den HEAD-Stand zurückgesetzt — das `git add` in Zeile 86 staged
      dann Inhalt, der identisch zu HEAD ist, wodurch die Datei im fertigen Commit fehlt
      (Leer-Diff), obwohl `git commit` grün durchlief. Fix, additiv, **warnt statt blockiert**:

      1. Vor dem `task freshness:regenerate`-Aufruf (vor Zeile 82) den Vorzustand der bereits
         gestagten `_FRESHNESS_FILES`-Einträge gegen HEAD erfassen:
         ```bash
         _pre_staged_freshness=()
         for _f in "${_FRESHNESS_FILES[@]}"; do
           if ! git -C "$repo_root" diff --cached --quiet -- "$_f" 2>/dev/null; then
             _pre_staged_freshness+=("$_f")
           fi
         done
         ```
      2. Nach dem Auto-Stage-Loop (nach `done` in Zeile 90, vor der `[ "$_staged" -gt 0 ]`-Zeile
         91) prüfen, ob eine vorher gestagte Datei jetzt keinen Diff mehr gegen HEAD hat, und
         sichtbar warnen:
         ```bash
         for _f in "${_pre_staged_freshness[@]:-}"; do
           if [ -n "$_f" ] && git -C "$repo_root" diff --cached --quiet -- "$_f" 2>/dev/null; then
             echo "  ⚠ freshness: your staged change to $_f was neutralized by regeneration" >&2
             echo "    (working copy now matches HEAD) — verify with 'git show --stat HEAD' after commit" >&2
           fi
         done
         ```
      3. In `.claude/skills/references/verification-block.md` neben dem bestehenden
         `git add`-Block (Zeile 52-74, Abschnitt „Freshness-Artefakte — git add nach
         `regenerate`") einen Pflicht-Verifikationsschritt ergänzen:
         ```bash
         git show --stat HEAD   # PFLICHT: bestätigt, dass die regenerierten Artefakte
                                 # tatsächlich im Commit liegen — ein grüner `git commit` allein
                                 # belegt das NICHT (T002284: pre-commit kann eine gestagte
                                 # Änderung lautlos zu einem Leer-Diff neutralisieren).
         ```
      Erweitere `tests/spec/pre-commit-freshness.bats` (existierende Datei, deckt bereits
      `_FRESHNESS_FILES`/den Auto-Stage-Loop ab) um:

      ```bash
      @test "T002284: pre-commit warns when regeneration neutralizes an already-staged freshness file" {
        [ -f "$HOOK" ] || { echo "MISSING hook: $HOOK"; return 1; }
        grep -qE '_pre_staged_freshness' "$HOOK" \
          || { echo "MISSING '_pre_staged_freshness' pre-state snapshot in $HOOK"; return 1; }
        grep -qE 'neutralized by regeneration' "$HOOK" \
          || { echo "MISSING neutralized-staged-diff warning in $HOOK"; return 1; }
      }
      ```

- [ ] **Final Verification.** Run the three mandatory CI gates: (wird in Schritt 3 ausgeführt)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
