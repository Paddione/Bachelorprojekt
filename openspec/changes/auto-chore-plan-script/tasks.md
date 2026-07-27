---
title: "auto-chore-plan-script — Implementation Plan"
ticket_id: T002390
domains: [factory, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# auto-chore-plan-script — Implementation Plan

_Ticket: T002390_

`triage → plan_staged` ist die letzte Stufe im Durchsatz ohne Automatik. Für Mishap-Bundles
ist der Weg in `mishap-tracker` Schritt 3.5 vollständig spezifiziert, aber als Prosa — er wird
deshalb übersprungen. Acht `minor`-Bundles liegen dadurch in `triage`. Vollständige Messung
und Herleitung stehen in `proposal.md`.

## File Structure

```
scripts/factory/auto-chore-plan.sh          (neu — Schritt 3.5 als Skript)
scripts/factory/wakeup.sh                   (geändert — Aufruf im Tick)
.claude/skills/mishap-tracker/SKILL.md      (geändert — verweist auf das Skript)
tests/spec/software-factory.bats            (geändert — 6 Tests, bereits im Stage-Commit)
openspec/changes/auto-chore-plan-script/specs/software-factory.md   (neu — Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die sechs Tests liegen im Stage-Commit dieses Branches
      (`tests/spec/software-factory.bats`, Marker `T002390`): Skript existiert und ist
      ausführbar, Severity-Gate, case-sensitive Branch-ID, `&&`-Verkettung, Aufruf im Tick,
      SKILL.md verweist auf das Skript.

      Der Branch-ID-Test prüft die Datei-Existenz **vor** dem grep — ohne das wäre er
      leer-grün, solange die Datei fehlt, und würde die Falle erst absichern, nachdem
      jemand sie eingebaut hat.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T002390"
# expected: FAIL (rot — alle sechs, das Skript existiert nicht)
```

- [ ] **Fix-Step A (GREEN) — Skript anlegen.** `scripts/factory/auto-chore-plan.sh`, Aufruf
      `bash scripts/factory/auto-chore-plan.sh <ext-id>`. Ablauf exakt nach
      `mishap-tracker` Schritt 3.5:

      1. Ticket lesen; `severity` in (`major`, `critical`) → Abbruch mit Begründung, Ticket
         bleibt `triage`. Die Severity kommt aus `tickets.severity` — das in-session
         `MISHAP_LOG` ist nicht nötig, sobald das Bundle-Ticket existiert.
      2. `slug="mishap-$(echo "<ext-id>" | tr '[:upper:]' '[:lower:]')"` und
         `branch="chore/mishap-<ext-id>"` — **der Branch niemals aus `$slug`**.
      3. `bash scripts/openspec.sh propose "$slug" --ticket <ext-id>`
      4. Plan-Authoring: die Einträge aus der Ticket-`description` in Fix-Tasks übersetzen,
         plus RED-Schritt mit `expected: FAIL` und echtem Runner-Aufruf (STRUCT2) und
         Verify-Task mit den drei Gates (STRUCT3).
      5. `bash scripts/plan-lint.sh openspec/changes/$slug/tasks.md` — Hard Gate.
      6. `stage-plan --id <ext-id> --branch "$branch" --plan …`
      7. `git add … && git commit … && git push -u origin "$branch"` — **verkettet**.

- [ ] **Fix-Step B (GREEN) — im Tick verankern.** In `scripts/factory/wakeup.sh` neben
      `auto-enqueue` und `auto-triage` (Zeilen ~194–204) einhängen: für alle `triage`-Tickets
      mit `title LIKE 'Mishap-Bundle%'` und `severity=minor`. Ohne diesen Schritt bleibt es
      bei „läuft, wenn jemand daran denkt" — genau dem Zustand, den dieses Ticket behebt.

- [ ] **Fix-Step C — SKILL.md entkoppeln.** Schritt 3.5 in
      `.claude/skills/mishap-tracker/SKILL.md` auf das Warum plus einen Verweis auf
      `scripts/factory/auto-chore-plan.sh` kürzen. Den Ablauf **nicht** duplizieren.

      Vor der Kürzung die Test-Kopplung prüfen, sonst reißen Ketten (T001441/T002181) —
      `mcp-skill-integration.bats` greppt die Datei bereits auf `report_mishap`,
      `get_mishap_buffer` und `flush_mishap_buffer`:

```bash
grep -rl 'mishap-tracker/SKILL.md' tests/
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f "T002390"
# expected: PASS (grün — alle sechs)
```

- [ ] **Am lebenden System belegen.** Ein `minor`-Bundle durchlaufen lassen und den
      Statuswechsel per SQL prüfen — nicht der Skriptausgabe vertrauen (`stage-plan` kann
      hängen und trotzdem schreiben).

```bash
bash scripts/factory/auto-chore-plan.sh T002382
# expected: T002382 steht danach auf plan_staged
```

- [ ] **Gate gegenprüfen.** Ein `major`-Bundle muss abgelehnt werden und in `triage` bleiben.

```bash
bash scripts/factory/auto-chore-plan.sh T002381
# expected: Abbruch mit Begruendung, T002381 bleibt triage
```

- [ ] **Die acht Bestands-Bundles abarbeiten.** T002273, T002341, T002351, T002352, T002356,
      T002373, T002374, T002382. Danach zählen, wie viele Mishap-Bundles noch in `triage`
      stehen — erwartet werden nur noch die 10 `major`.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
