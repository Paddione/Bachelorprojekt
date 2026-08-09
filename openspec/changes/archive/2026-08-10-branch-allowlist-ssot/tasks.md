---
title: SSOT für ticketlose Branch-Ausnahmen
ticket_id: T002817
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: plan_staged
---

# SSOT für ticketlose Branch-Ausnahmen — Implementation Plan

## File Structure

| Datei | Art | Zeilen heute | S1-Limit | Budget |
|---|---|---|---|---|
| `scripts/lib/branch-allowlist.sh` | neu | 0 | 800 (.sh) | ~780 |
| `.githooks/pre-commit` | ändern | 198 | ungated (keine Extension) | — |
| `.githooks/pre-push` | ändern | 155 | ungated (keine Extension) | — |
| `scripts/worktree-create.sh` | ändern | 509 | 800 (.sh) | 291 |
| `scripts/factory/mishap-rollup.sh` | ändern | 268 | 800 (.sh) | 532 |
| `tests/spec/ci-cd/branch-allowlist-ssot.bats` | vorhanden (RED) | 128 | ungated | — |
| `tests/spec/divergence-guard/branch-name-guard.bats` | ändern | 139 | ungated | — |
| `openspec/changes/branch-allowlist-ssot/specs/ci-cd.md` | vorhanden | — | — | — |
| `openspec/changes/branch-allowlist-ssot/specs/divergence-guard.md` | vorhanden | — | — | — |

Keine Datei liegt über 80 % ihrer Schwelle; ein Modul-Split ist nicht erforderlich.

## Tasks

### 1. Failing-Test bestätigen

Der RED-Test liegt bereits im Branch. Vor jeder Implementierung seinen Zustand belegen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-allowlist-ssot.bats
```

expected: FAIL — Test 4 („der gelistete Rollup-Branch darf committen") und Test 5
(„scripts/lib/branch-allowlist.sh existiert") schlagen fehl; Tests 6–8 werden übersprungen, weil
die Lib fehlt. Die Tests 1–3 und 9–10 laufen bereits grün und sind die Positiv-Anker: sie belegen,
dass der Guard überhaupt wirkt und dass die Ablehnung eines nicht gelisteten Branches erhalten
bleibt.

### 2. Die gemeinsame Quelle anlegen

`scripts/lib/branch-allowlist.sh` neu:

- `TICKETLESS_BRANCHES` — space-separierte Liste exakter Branch-Namen, initial genau
  `chore/mishap-incident-rollup`.
- `branch_is_ticketless()` — vergleicht das Argument exakt (`[ "$1" = "$b" ]`) gegen jeden Eintrag,
  Rückgabe 0 bei Treffer, sonst 1. **Kein** Glob und kein Präfix-Match: ein Tippfehler soll keine
  ganze Branch-Klasse befreien. Test 8 misst genau das (`…-rollup-extra` muss abgelehnt werden).
- Die Datei wird ausschließlich gesourct, nie ausgeführt; kein `set -e`, kein Seiteneffekt beim
  Laden, damit sie in jedem der drei Aufrufkontexte unschädlich ist.
- Kopfkommentar: warum exakter Vergleich, und der Verweis auf T002817.

### 3. Beide Hooks auf die Quelle umstellen

**`.githooks/pre-commit`**, Branch-Naming-Abschnitt (heute Zeile 119–165):

- Vor dem `case` bedingt sourcen: `[ -f "$repo_root/scripts/lib/branch-allowlist.sh" ] && . "$repo_root/scripts/lib/branch-allowlist.sh"`.
  `repo_root` ist in Zeile 5 bereits gesetzt.
- Im `*)`-Zweig vor der Ticket-ID-Prüfung: `if command -v branch_is_ticketless >/dev/null 2>&1 && branch_is_ticketless "$_bn"; then :` — Branch akzeptiert, sonst weiter wie bisher.
- Die `command -v`-Abfrage ist der Kern der Degradation: fehlt die Datei, ist die Funktion nicht
  definiert, die Bedingung ist falsch und der Guard verhält sich exakt wie heute. Tests 9 und 10
  messen beide Richtungen dieser Eigenschaft.
- Den Kommentarblock „Exemptions:" (Zeile 124) um den Verweis auf die Lib ergänzen.

**`.githooks/pre-push`**, advisory Abschnitt (heute Zeile 138–154): analog, `repo_root` ist in
Zeile 21 gesetzt. Wirkung hier ist ausschließlich die Unterdrückung der irreführenden Warnung —
der Hook blockiert nicht und soll das auch weiterhin nicht tun.

### 4. `scripts/worktree-create.sh` auf die Quelle umstellen

- Zeile 49 (`_unattended_allowlist="chore/mishap-incident-rollup"`) entfernen.
- Stattdessen die Lib sourcen und in der Prüfschleife (heute Zeile 85–90) `branch_is_ticketless`
  aufrufen.
- Die `--unattended`-Semantik bleibt unverändert: die Allowlist wirkt weiterhin nur, wenn
  `--unattended` gesetzt ist. Der Hilfetext (Zeile 36–38) behält seine Aussage, nennt aber die Lib
  als Fundort der Liste.
- `WT_SKIP_NAME_CHECK` bleibt unangetastet.

### 5. Die Drift-Tests aus T002470 ersetzen

`tests/spec/divergence-guard/branch-name-guard.bats`, Zeilen 114–139: der Abschnitt
„Drift-Guard" samt seiner drei `grep`-Tests entfällt. Er prüfte Literal-Gleichheit zwischen Hook
und Helper — mit einer gemeinsamen Quelle ist die Aussage gegenstandslos, und die Tests würden
fehlschlagen, sobald die Literale nur noch in der Lib stehen.

An seine Stelle tritt **ein** Test, der belegt, dass beide Guards dieselbe Quelle lesen: ein
zusätzlicher Eintrag in `TICKETLESS_BRANCHES` (temporär, in einer Sandbox-Kopie der Lib) wirkt auf
`worktree-create.sh` und `pre-commit` gleichermaßen. Das misst die Eigenschaft, die das
Requirement fordert, statt Textgleichheit.

Der einleitende Kommentar der Datei (Zeilen 114–118) wird ersetzt: die Begründung „die Regel steht
bewusst an zwei Stellen" gilt nicht mehr; an ihre Stelle kommt der Verweis auf T002817 und die
umgeschriebene Requirement in `openspec/specs/divergence-guard.md`.

### 6. `scripts/factory/mishap-rollup.sh` laut scheitern lassen

Im Abschnitt „commit + push":

- Exit-Status von `git commit` und `git push` je einzeln prüfen.
- Bei Fehlschlag: die fehlgeschlagene Stufe benennen, den Pfad des erzeugten Plans ausgeben (damit
  die Arbeit auffindbar bleibt) und mit Exit ≠ 0 abbrechen.
- Begründung im Kommentar: ein `git add` ohne folgenden `commit` sieht im Index aus wie fertige
  Arbeit, ist aber nirgends dauerhaft — genau so entstanden die zwei staged, nie committeten
  Plan-Dateien in `.worktrees/mishap-incident-rollup`.

### 7. Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd tests/spec/divergence-guard
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: alle zehn Tests in `branch-allowlist-ssot.bats` grün (keine Skips mehr — die Lib
existiert), `branch-name-guard.bats` grün mit dem ersetzten Abschnitt, `task test:changed` grün,
`freshness:check` ohne Diff.

**Nach dem Merge** der Nachweis am echten Objekt — die Hooks werden aus dem Arbeitsbaum gelesen,
vorher greift der Fix im Rollup-Worktree nicht. Zuerst die Fossil-Dateien verwerfen: der
Rollup-Worktree führt `openspec/changes/mishap-incident-rollup/proposal.md` und `tasks.md` im
Status `A ` (staged, nie committet). Der nächste Lauf erzeugt den Plan ohnehin neu aus den
Batch-Kommentaren an T002784, die unangetastet sind — es geht keine Information verloren.

```bash
git -C .worktrees/mishap-incident-rollup restore --staged --worktree \
  openspec/changes/mishap-incident-rollup/
BRAND=mentolder bash scripts/factory/mishap-rollup.sh
git -C .worktrees/mishap-incident-rollup log --oneline -1
```

Erwartet: der Lauf endet mit Exit 0 und der Commit auf `chore/mishap-incident-rollup` trägt den
erzeugten Plan. Damit ist belegt, dass die fünf Batch-Kommentare aus T002784 ihre Auswertung
erreichen — die Blockade aus T002817 ist dann nachweislich aufgehoben, nicht nur mutmaßlich.
