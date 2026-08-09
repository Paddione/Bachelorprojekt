---
title: "ci-ticketless-changes — Implementation Plan"
ticket_id: T002836
domains: [ci-cd, openspec-workflow, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-ticketless-changes — Implementation Plan

_Ticket: T002836_

## File Structure

```
tests/spec/openspec-workflow/ticket-file-required.bats     (neu, liegt bereits als RED-Test vor)
tests/spec/openspec-workflow/t002573-backlog-slugs.txt     (neu, liegt bereits vor — 42 Slugs)
tests/spec/openspec-ticket-links-evaluation.bats           (geändert — Mandat einfrieren)
.claude/skills/openspec-propose/SKILL.md                   (geändert — .ticket-Schritt)
.claude/commands/opsx/propose.md                           (geändert — .ticket-Schritt)
.opencode/commands/opsx-propose.md                         (geändert — .ticket-Schritt)
CLAUDE.md                                                  (geändert — Widerspruch auflösen)
openspec/changes/brain-ingest-model-default-T002773/       (archiviert)
openspec/changes/dead-path-ssot-ref-T002772/               (archiviert)
openspec/changes/plan-staged-guard-T002769/                (archiviert)
openspec/changes/prosa-blocker-detection-T002771/          (archiviert)
openspec/changes/reaper-orphan-tickets-T002770/            (archiviert)
openspec/changes/stage-plan-hold-doc-T002774/              (archiviert)
openspec/changes/ticket-plans-schema-doc-T002768/          (archiviert)
```

**S1-Budgets:** Keine der geänderten Dateien unterliegt S1. `docs/code-quality/gates.yaml`
führt Limits ausschliesslich für Code-Extensions (`.astro`, `.ts`, `.svelte`, `.sh`, `.mjs`,
`.mts`, `.py`, `.js`, `.jsx`, `.tsx`, `.cjs`, `.bash`, `.java`, `.php`); `.bats`, `.md` und
`.txt` sind nicht darunter. Keine der fünf bestehenden Dateien steht in
`docs/code-quality/baseline.json`. Es wird daher kein Zeilenbudget behauptet.

<!-- vitest: kein neuer Test nötig — der Vorgang berührt weder website/src/lib/** noch
     website/src/pages/api/**; die Absicherung erfolgt über BATS. -->

## Partials

| # | Rolle | Ziel-Dateien (disjunkt) |
|---|-------|-------------------------|
| P1 | Quelle | `.claude/skills/openspec-propose/SKILL.md`, `.claude/commands/opsx/propose.md`, `.opencode/commands/opsx-propose.md`, `CLAUDE.md` |
| P2 | Bestand | die sieben Change-Verzeichnisse unter `openspec/changes/` |
| P3 | Tests | `tests/spec/openspec-ticket-links-evaluation.bats`, `tests/spec/openspec-workflow/ticket-file-required.bats`, `tests/spec/openspec-workflow/t002573-backlog-slugs.txt` |

---

## P1 — Quelle: alle drei Propose-Wege schreiben `.ticket`

- [ ] **P1.1 Die drei gespiegelten Anweisungsdateien ergänzen.**
      In `.claude/skills/openspec-propose/SKILL.md`, `.claude/commands/opsx/propose.md` und
      `.opencode/commands/opsx-propose.md` je einen expliziten Schritt aufnehmen: nach dem
      Anlegen des Change-Verzeichnisses die Ticket-ID nach `openspec/changes/<slug>/.ticket`
      schreiben. Der Schritt gehört an dieselbe Stelle, an der die Dateien heute schon die
      Delta-Spec-Konvention behandeln, damit beide Regeln zusammen gelesen werden.

      Begründung für die Redundanz über drei Dateien: das bestehende Requirement
      „Kanonischer /opsx:propose-Flow respektiert die Delta-Spec-Konvention für Sub-Features"
      nennt genau diese drei als gespiegelte Quellen. Wird nur eine geändert, bleibt der
      Weg über opencode offen.

      Prüfung nach der Änderung — alle drei müssen die Datei erwähnen:

```bash
for f in .claude/skills/openspec-propose/SKILL.md \
         .claude/commands/opsx/propose.md \
         .opencode/commands/opsx-propose.md; do
  printf '%-50s %s\n' "$f" "$(grep -c '\.ticket' "$f")"
done
# erwartet: jede Zeile > 0
```

- [ ] **P1.2 Den CLAUDE.md-Widerspruch auflösen.**
      Der Abschnitt „OpenSpec native change workflow" nennt `task openspec:propose|apply|archive`
      derzeit „**equivalent fallbacks**". Diese Aussage ist die eigentliche Fehlerquelle: sie
      war nie zutreffend, weil nur `scripts/openspec.sh propose` die `.ticket`-Datei schreibt
      und `--ticket` erzwingt. Formulierung so ändern, dass beide Wege denselben Artefaktsatz
      erzeugen müssen und `.ticket` ausdrücklich dazugehört.

      Gleiche Korrektur in `AGENTS.md` prüfen und, falls die Aussage dort gespiegelt ist,
      mitziehen — AGENTS.md ist laut CLAUDE.md die cross-harness SSOT dieses Blocks.

```bash
grep -n 'equivalent fallbacks\|equivalent' CLAUDE.md AGENTS.md
```

## P2 — Bestand: die sieben erledigten Changes abschliessen

- [ ] **P2.1 `.ticket` nachrüsten.**
      Für jeden der sieben Slugs die Ticket-ID aus dem Slug-Suffix in die `.ticket`-Datei
      schreiben. Die Zuordnung ist eindeutig, jeder Slug endet auf seine Ticket-ID.

```bash
for s in brain-ingest-model-default-T002773 dead-path-ssot-ref-T002772 \
         plan-staged-guard-T002769 prosa-blocker-detection-T002771 \
         reaper-orphan-tickets-T002770 stage-plan-hold-doc-T002774 \
         ticket-plans-schema-doc-T002768; do
  echo "${s##*-}" > "openspec/changes/$s/.ticket"
done
grep -r . openspec/changes/*/.ticket | grep -E 'T00276[89]|T00277[0-4]'
```

- [ ] **P2.2 Die sieben archivieren.**
      Alle sieben Tickets sind `done/resolution=fixed` (am 2026-08-09 gegen `tickets.tickets`
      geprüft). `archive` ist damit ihr korrekter Abschluss; er liest den Ticketstatus, statt
      ihn zu setzen. Das ist der Grund, die Changes nicht bei P2.1 stehen zu lassen: ein
      späterer `apply` würde über die frisch angelegte `.ticket`-Datei ein abgeschlossenes
      Ticket auf `plan_staged` zurückwerfen.

```bash
for s in brain-ingest-model-default-T002773 dead-path-ssot-ref-T002772 \
         plan-staged-guard-T002769 prosa-blocker-detection-T002771 \
         reaper-orphan-tickets-T002770 stage-plan-hold-doc-T002774 \
         ticket-plans-schema-doc-T002768; do
  echo "=== $s ==="
  bash scripts/openspec.sh archive "$s" 2>&1 | tail -3
done
```

      Schlägt ein Archivlauf mit fehlendem Ziel-SSOT-Spec fehl, ist `--create-new` für genau
      diesen Slug nachzuziehen (Delta-Spec-Konvention T001304). Ergebnis je Slug im
      Task-Log festhalten, damit nachvollziehbar bleibt, welche Changes den regulären Weg
      genommen haben.

- [ ] **P2.3 Ergebnis prüfen.**
      Nach dem Archivieren darf keiner der sieben Slugs mehr unter `openspec/changes/`
      liegen, und `validate` muss weiterhin Exit 0 liefern.

```bash
ls -d openspec/changes/*T00276[89] openspec/changes/*T00277[0-4] 2>&1
# erwartet: "No such file or directory"
bash scripts/openspec.sh validate; echo "rc=$?"
```

## P3 — Tests: Mandat einfrieren, Guard verankern

- [ ] **P3.1 Failing-Test-Step (RED) — Ausgangslage belegen.**
      Der neue Guard `tests/spec/openspec-workflow/ticket-file-required.bats` liegt bereits
      im Stage-Commit dieses Branches und ist rot: er meldet die sieben Changes ohne
      `.ticket`. Vor Beginn der Umsetzung erneut ausführen, um die Ausgangslage zu belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/ticket-file-required.bats
# expected: FAIL (rot — die sieben Bestands-Changes tragen noch keine .ticket-Datei)
```

      Die Ausgabe muss die Ankerzeile `Anker: geprueft=<n> mit_ticket=<n> fehlend=7` zeigen.
      Sind `geprueft` oder `mit_ticket` gleich 0, ist der Test wirkungslos und die
      Kandidatenermittlung zu korrigieren, bevor irgendetwas anderes geschieht.

- [ ] **P3.2 Test 1 des Register-Gates auf den Altbestand einfrieren.**
      In `tests/spec/openspec-ticket-links-evaluation.bats` iteriert Test 1 heute über
      `openspec/changes/*/` und erfasst damit jeden künftigen Change. Die Schleife auf die
      42 Slugs aus `tests/spec/openspec-workflow/t002573-backlog-slugs.txt` umstellen: für
      jeden Slug dieser Liste, der noch unter `openspec/changes/` existiert, muss
      `evaluation.md` einen Vermerk tragen. Changes ausserhalb der Liste prüft dieser Test
      nicht mehr — für sie gilt der Guard aus P3.1.

      Test 2 an dieselbe Datei anschliessen, statt seine 41er-Liste weiter im Testkörper
      einkodiert zu halten. Beide Tests beziehen ihre Sluglist damit aus einer Quelle und
      können nicht auseinanderdriften. Die Datei enthält 42 Einträge — die 41 aus der
      T002573-Beschreibung plus `context-guard-T002585`, das als Registerzeile 42 nachgetragen
      wurde; Test 2 prüft weiterhin seine bekannten 41 ab.

- [ ] **P3.3 Beide Testdateien grün fahren.**
      Nach P1 und P2 müssen beide Guards bestehen. Die Verzeichnis- und die Sammeldatei-Form
      zusammen erfassen (T002696) — eine gezielte Suche nach nur einer der beiden Formen
      findet die Hälfte nicht:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-ticket-links-evaluation.bats
```

- [ ] **P3.4 Nachweis, dass das Register-Gate nicht mehr mitwächst.**
      Belegen, dass ein neu angelegter Change ausserhalb des Altbestands das Register-Gate
      nicht auslöst, den `.ticket`-Guard aber sehr wohl. Dazu ein temporäres Verzeichnis
      anlegen, beide Tests laufen lassen und es wieder entfernen:

```bash
mkdir -p openspec/changes/zz-guard-probe
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-ticket-links-evaluation.bats
# erwartet: grün — das Register verlangt für einen neuen Slug keinen Eintrag
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/ticket-file-required.bats
# erwartet: rot, mit "FEHLT: Change 'zz-guard-probe' ohne .ticket-Datei"
rm -rf openspec/changes/zz-guard-probe
```

      Verhält sich einer der beiden Guards anders als hier beschrieben, ist die Trennung der
      Zuständigkeiten nicht erreicht und P3.2 nachzubessern.

- [ ] **P3.5 Test-Inventar regenerieren.**
      Der Vorgang legt eine neue Testdatei an; das Inventar ist mitzucommitten, sonst schlägt
      der CI-Check fehl.

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

## Final Verification

- [ ] **Abschliessende Verifikation.** Die drei verpflichtenden CI-Gates ausführen und die
      Ausgaben prüfen, bevor der PR gestellt wird:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      Zusätzlich der ursprünglich rote Shard, dessentwegen dieses Ticket entstand:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow* \
  tests/spec/openspec-ticket-links-evaluation.bats
bash scripts/openspec.sh validate; echo "rc=$?"
```
