---
title: "health-goals-repair — Implementation Plan"
ticket_id: T013916
domains: [ci, tools]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-goals-repair — Implementation Plan

## File Structure

```
tests/spec/health-goals/goal-integrity.bats  (neu) 13 Faelle, kein DB-/LLM-Bedarf
scripts/brain-ingest-worklist.sh             --pending-Modus (main 88 → 184, Limit 800)
scripts/health-goals-check.sh                7 Ziele: Messung + Schwellen (main 793, Limit 800 — Budget 7)
.claude/lib/goals.md                         Schwellen, Messbefehl, Rueckbau-Abschnitt
```

## Partial-Manifest

Ein Partial. `health-goals-check.sh` liest den neuen `--pending`-Modus, und `goals.md`
dokumentiert beide — ein Schnitt dazwischen erzeugte einen Stand, in dem das Goal auf ein
Flag verweist, das es noch nicht gibt.

## Tasks

- [ ] **1. Failing test (RED).** Der Test liegt im Branch. Vor der ersten Aenderung laufen
      lassen und den roten Stand bestaetigen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/goal-integrity.bats
      ```

      expected: FAIL — 11 rot, 2 Positiv-Anker gruen. Die Anker belegen, dass Ziel-Definitionen
      und Messskript ueberhaupt existieren und die Worklist antwortet.

- [ ] **2. --pending-Modus in der Worklist.** `scripts/brain-ingest-worklist.sh` bekommt
      `--pending` und `--state`. Der Modus gibt STATT der Zeilenliste eine einzelne Zahl aus:
      die Chunks, deren sha256 vom State-Eintrag `<src_path>#<index>` abweicht. Die Semantik ist
      der Zwilling von `brain-ingest.sh process_page` (Zeilen 275-278) — der Hash geht ueber den
      QUELL-Chunk, vor jeder Transformation, weshalb kein Sprachmodell noetig ist.
      `brain-chunk.sh` ist ausdruecklich "no LLM, no network". Fehlt das State-File, ist alles
      pending; das ist die ehrliche Antwort, kein Fehler.

- [ ] **3. G-BRAIN14 auf --pending umstellen.** In `scripts/health-goals-check.sh` den
      Messbefehl von `… | grep -c .` auf `… --pending` aendern. Danach:

      ```bash
      bash scripts/health-goals-check.sh --only=G-BRAIN14
      ```

      Erwartet: eine Zahl deutlich unter 172 — der Backlog wird durch einen Ingest-Lauf
      erreichbar statt strukturell unerreichbar.

- [ ] **4. Schwellen ans Messfenster und an den Ist-Wert anpassen.** In
      `scripts/health-goals-check.sh`: G-DORA01 `ge 5` → `ge 20` (die Doku nennt 5/Woche, gemessen
      werden 4 Wochen), G-SIZE03 `le 3000` → `le 600`, G-SPEC03 `le 41` → `le 5`,
      G-CQ02 `le 280` → `le 10`, G-CQ09 `le 10` → `le 2`, G-RH01 `le 30` → `le 5`. Jede
      Aenderung traegt einen Kommentar mit dem Grund — eine Schwellenaenderung ohne Begruendung
      ist beim naechsten Audit nicht von Willkuer unterscheidbar.

- [ ] **5. goals.md nachziehen.** Die Tabellenwerte auf dieselben Schwellen setzen und den
      G-BRAIN14-Messbefehl korrigieren: die Zeile versprach einen "State-File-Hash-Vergleich",
      den das Skript nicht durchfuehrte. Zwei bestehende Widersprueche mit aufloesen —
      G-SPEC03 stand im Skript auf 41 und in der Doku auf 0; G-CQ02 trug 280 im Skript, 280 in
      goals.md und 200 in `plan-quality-gates.md`:

      ```bash
      grep -rn 'any-Verwendungen\|any count' .claude/lib/goals.md .claude/skills/references/plan-quality-gates.md scripts/health-goals-check.sh
      ```

- [ ] **6. Rueckbau-Regel dokumentieren.** In `.claude/lib/goals.md` einen Abschnitt ergaenzen,
      der die drei Muster festhaelt (Schwelle passt nicht zum Messfenster; Ratchet zieht nach
      geloestem Problem nicht nach; Messung misst etwas anderes als der Titel) samt der
      Prueffrage vor jeder Zielaufnahme: unter welchen realistischen Umstaenden wird dieses Ziel
      rot? Ohne diese Regel entsteht dieselbe Ansammlung erneut.

- [ ] **7. Final Verification.** Alle Faelle gruen, und der Vollauf darf keinen NEUEN roten
      erzeugen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/goal-integrity.bats
      bash scripts/health-goals-check.sh
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: 13/13 gruen; im Vollauf sind G-RH01, G-CQ09, G-CQ02, G-SIZE03, G-SPEC03 und
      G-DORA01 gruen und G-BRAIN14 zeigt eine erreichbare Zahl. Die Gate-Verstoesse duerfen
      gegenueber `origin/main` nicht zunehmen — gemessen wird gegen den Vorher-Stand:

      ```bash
      # Vorher-Stand (origin/main) und Nachher-Stand vergleichen
      git stash list >/dev/null; bash scripts/health-goals-check.sh 2>&1 | grep -c '🔴'
      ```

      Ein roter G-RH07 (Freshness-Check) waehrend der Arbeit ist der uncommittete Arbeitsstand
      und kein Regress — er verschwindet nach `freshness:regenerate` + Commit.

- [ ] **8. S1-Budget einhalten.** `scripts/health-goals-check.sh` liegt auf `main` bei 793 Zeilen,
      das Limit fuer `.sh` ist 800 — Budget also 7 Zeilen. Ausfuehrliche Begruendungen gehoeren
      deshalb NICHT ins Skript, sondern in den Rueckbau-Abschnitt von `.claude/lib/goals.md`; im
      Skript steht je Aenderung eine Zeile mit Verweis. Pruefbefehl:

      ```bash
      wc -l scripts/health-goals-check.sh   # muss <= 800 bleiben
      node scripts/code-quality/check.mjs   # darf kein NEW/worsened fuer die Datei melden
      ```
