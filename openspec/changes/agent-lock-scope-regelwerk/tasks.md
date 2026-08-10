---
title: "agent-lock-scope-regelwerk — Implementation Plan"
ticket_id: T003116
domains: [agent-skills, ci-tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-scope-regelwerk — Implementation Plan

_Ticket: T003116 (Ursache) · T003102 · T003131 · T003132_

## File Structure

```
.claude/skills/references/ticket-ops-procedures.md          (geändert — Step 3.6)
.claude/skills/dev-flow-plan/SKILL.md                       (geändert — Pre-Commit-Guard Punkt 3)
scripts/hooks/worktree-write-guard.sh                       (geändert — MY_WTS-Dedup + Meldezeile)
scripts/vda/ticket/_ticket-core.sh                          (geändert — Reihenfolge im Fehlertext)
tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats  (NEU — bereits im Plan-Commit, RED)
website/src/data/test-inventory.json                        (regeneriert)
openspec/changes/agent-lock-scope-regelwerk/**              (Proposal + Delta-Spec)
```

### Zeilenbudgets (S1, wirksame Schwelle)

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/hooks/worktree-write-guard.sh` | 192 | 608 |
| `scripts/vda/ticket/_ticket-core.sh` | 210 | 590 |

Beide `.sh`-Dateien sind **nicht gebaselined**; wirksame Schwelle ist das statische
Extension-Limit 800 aus `docs/code-quality/gates.yaml`. Für `.md` definiert `gates.yaml` kein
S1-Limit — die beiden Regelwerks-Dateien sind von S1 nicht betroffen.

## Partials

| # | Rolle | Zieldateien (disjunkt) |
| --- | --- | --- |
| p1 | Regelwerks-Texte | `.claude/skills/references/ticket-ops-procedures.md`, `.claude/skills/dev-flow-plan/SKILL.md` |
| p2 | Skripte | `scripts/hooks/worktree-write-guard.sh`, `scripts/vda/ticket/_ticket-core.sh` |
| p3 | Tests & Inventar | `tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats`, `website/src/data/test-inventory.json` |

## Kontext für den Implementierer

Die zentrale Entwurfsentscheidung ist in `proposal.md` getroffen und **bindend**: es wird **keine**
Vererbungskennung (Parent-SID/Actor-Kennung) eingeführt, und Regel 2 des Write-Guards wird **nicht**
verengt. Wer beim Implementieren zu dem Schluss kommt, dass die Verengung doch nötig ist, ändert
nicht den Code, sondern legt ein Folge-Ticket an — die Verengung würde T002412 umkehren.

## Task 1 (p3) — Failing-Test-Step (RED)

Die Testdatei liegt bereits im Plan-Commit dieses Branches. Sie muss vor der Implementierung
**rot** sein, und zwar an der jeweils inhaltlich richtigen Zusicherung (nicht am Fixture-Aufbau).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats
# expected: FAIL — 7 von 7 Tests rot:
#   1-3  'claim branch' fehlt in Step 3.6
#   4    'branch__' fehlt im Pre-Commit-Guard-Block
#   5    Worktree-Pfad erscheint zweimal statt einmal (Dedup fehlt)
#   6    Meldezeile nennt weder SID-Herkunft noch Subagenten
#   7    Fehlertext nennt keinen release-Pfad vor dem Override
```

- [ ] Lauf ausführen und die sieben Fehlermeldungen mit obiger Liste abgleichen. Weicht ein
      Fehlgrund ab, ist das Fixture defekt und wird zuerst repariert — nicht die Zusicherung
      abgeschwächt.

## Task 2 (p1) — ticket-ops Step 3.6 auf branch-scope umstellen

Datei: `.claude/skills/references/ticket-ops-procedures.md`, Abschnitt `### Step 3.6`.

- [ ] Schritt 1 der nummerierten Liste von `claim ticket <ext-id>` auf den branch-scoped Claim
      umstellen. Der Befehl behält `--label ticket-ops` und das Verhalten bei Exit 1
      (überspringen/koordinieren — eine lebende Session hält den Branch bereits).
- [ ] Einen Satz ergänzen, warum nicht ticket-scoped geclaimt wird, mit Verweis auf **T003102**:
      der ticket-scoped Lock blockiert nicht den zweiten Bearbeiter, sondern den Abschluss durch
      Subagent, `ticket-mcp` und `post-merge.yml`.
- [ ] Den wörtlichen Prompt-Baustein für die Dispatch-Vorlage aufnehmen (T003132) — er gehört in
      denselben Abschnitt, weil Test 3 nur dort greppt:

      Setze zu Beginn im Worktree:
        bash scripts/agent-lock.sh claim branch <branch> --worktree <pfad> --branch <branch>
      Setze KEINEN ticket-scoped Lock (T003102 — blockiert den späteren Abschluss durch
      Subagent, ticket-mcp und post-merge.yml).
      Gib den Branch-Lock am Ende deiner Arbeit wieder frei.

- [ ] Sicherstellen, dass im Abschnitt **kein** `claim ticket` mehr steht (Test 2 ist eine
      Negativ-Aussage mit Positiv-Anker).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats \
  --filter 'Step 3.6'
```

## Task 3 (p1) — dev-flow-plan Pre-Commit-Guard öffnen

Datei: `.claude/skills/dev-flow-plan/SKILL.md`, Pre-Commit-Guard Punkt 3 (aktuell Zeilen 216-217).
Der Block kommt **zweimal** in der Datei vor (Fließtext und Schritt-5-Abschnitt) — beide Stellen
ändern, sonst driften sie auseinander.

- [ ] Die Auflösung so umbauen, dass **beide** Scopes akzeptiert werden: zuerst
      `ticket__${TICKET_EXT_ID}.json` prüfen, bei Nichtvorhandensein auf
      `branch__<slug>.json` für den aktuellen Branch zurückfallen. Der Slug entsteht aus dem
      Branchnamen mit `/` → `-` (so schreibt `agent-lock.sh` die Datei; im Lock-Bestand dieses
      Branches nachprüfbar).
- [ ] Fail-closed bleibt erhalten: findet sich **keiner** der beiden Claims, bricht der Guard
      weiterhin mit `exit 1` ab. Die Fehlermeldung nennt beide gültigen Scopes.
- [ ] Der Branch-Abgleich (`.branch` == `HEAD`) läuft unverändert gegen die gefundene Datei.
- [ ] Verweis auf **T003102** in den Block aufnehmen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats \
  --filter 'Pre-Commit-Guard'
```

## Task 4 (p2) — worktree-write-guard: Dedup und ehrliche Meldezeile

Datei: `scripts/hooks/worktree-write-guard.sh`.

- [ ] `MY_WTS+=("$wt")` (Zeile 138) um eine Existenzprüfung ergänzen, damit ein Worktree, auf den
      mehrere Locks unterschiedlichen Scopes zeigen, nur einmal in der Liste landet. Reine
      Bash-Mittel verwenden (Schleife über das Array); der Hook läuft vor **jedem** Schreibzugriff
      und darf keine neue Abhängigkeit erwerben.
- [ ] Die Meldezeile `Dieser Session gehoeren:` so umformulieren, dass die **Herkunft** des
      Besitzes erkennbar ist — sie muss `SID` und `Subagent` enthalten (Test 6 prüft zwei
      unabhängige, unverankerte Tokens, der genaue Wortlaut ist frei).
- [ ] Regel 2 selbst **nicht** verengen. Ein Kommentar an der Stelle hält fest, dass die Zusicherung
      session- und nicht akteur-bezogen ist und warum (T003131, Gegenentscheidung T002412).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats \
  --filter 'worktree-write-guard'
```

## Task 5 (p2) — Ticket-Lock-Guard: release vor dem Override nennen

Datei: `scripts/vda/ticket/_ticket-core.sh`, Diagnoseblock ab Zeile 172.

- [ ] Vor der `TICKET_LOCK_OVERRIDE`-Zeile eine Zeile einfügen, die den regulären Weg nennt: den
      Claim nach getaner Arbeit mit `agent-lock.sh release` freigeben. Die Zusicherung ist die
      **Reihenfolge** (Test 7 vergleicht Zeilennummern), nicht der Wortlaut.
- [ ] Die Override-Zeile so einordnen, dass erkennbar bleibt, welchen Schutz sie kostet — sie
      deaktiviert den Schutz auch gegenüber echten Fremdsessions.
- [ ] Rückgabewert 7 und der übrige Halter-Block bleiben unverändert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats \
  --filter '_ticket_lock_guard'
```

## Task 6 (p3) — Suite grün, Regressionsflanken prüfen, Inventar

- [ ] Die neue Datei vollständig grün fahren (7/7).
- [ ] Bestandstests derselben Spec mitlaufen lassen — **beide** Formen erfassen (T002696), weil
      Sammeldatei und Verzeichnis gleichzeitig gültig sind:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/active-sessions-hub*
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan*
```

- [ ] `tests/spec/dev-flow-plan.bats` prüft heute den Pre-Commit-Guard. Schlägt dort etwas an,
      weil Task 3 die Lock-Auflösung geändert hat, wird die bestehende Zusicherung **erweitert**
      (beide Scopes gültig), nicht gelöscht.
- [ ] Test-Inventar regenerieren und mitcommitten:

```bash
task test:inventory
```

## Task 7 — Abschließende Verifikation

- [ ] Die drei Pflicht-Gates laufen grün:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `bash scripts/plan-lint.sh openspec/changes/agent-lock-scope-regelwerk/tasks.md` ist grün.
- [ ] `task openspec:validate` ist grün (Delta-Spec gegen `active-sessions-hub`).
- [ ] Der Branch-Lock dieses Worktrees ist am Ende freigegeben:

```bash
bash scripts/agent-lock.sh release branch fix/agent-lock-scope-regelwerk-T003116
```

<!-- vitest: kein neuer Test nötig, weil die Änderung ausschließlich Bash-Skripte und
     Skill-Markdown betrifft; website/src bleibt unberührt. -->
