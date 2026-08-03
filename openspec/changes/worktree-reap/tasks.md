---
title: "worktree-reap — Implementation Plan"
ticket_id: T002622
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-reap — Implementation Plan

_Ticket: T002622_

## File Structure

```
scripts/agent-lock.sh                             (geändert — Reap-Stufe + Kandidaten-Prüfung)
tests/spec/software-factory/worktree-reap.bats    (bereits angelegt, RED — 8 Tests)
openspec/changes/worktree-reap/design.md          (bereits angelegt)
openspec/changes/worktree-reap/proposal.md        (bereits angelegt)
openspec/changes/worktree-reap/specs/software-factory.md  (bereits angelegt)
```

**S1-Budget.** `scripts/agent-lock.sh`: Ist 511 Zeilen, **nicht gebaselined** → wirksame Schwelle
ist das statische `.sh`-Limit 800 (`docs/code-quality/gates.yaml`, angehoben in T002452) →
**Budget 289 Zeilen**. Die geschätzte Erweiterung liegt bei ~70 Zeilen (Endstand ~580, rund 73 %
der Schwelle). Ein Fragment-Split ist deshalb nicht Teil dieses Plans; er wäre reine Zeremonie.
Der veraltete Kommentar in Zeile 483, der noch von einem 500-Zeilen-Limit spricht, wird in
Task 4 korrigiert, damit der nächste Leser nicht dieselbe Fehlannahme trifft.

`tests/spec/software-factory/worktree-reap.bats`: neue Datei, 194 Zeilen, keine Kollision mit
einem `.bats`-Limit.

<!-- vitest: kein neuer Test nötig, weil ausschließlich Bash-Skripte geändert werden — keine
     Datei unter website/src/ ist betroffen. -->

## Task 1 — RED bestätigen

- [ ] Den bereits committeten BATS-Test ausführen und bestätigen, dass er auf dem aktuellen
      Stand rot ist. Alle acht Tests müssen an ihrem Positiv-Anker scheitern (`[ ! -d
      "$WT_ROOT/orphan" ]` bzw. der `nowt`-Branch-Assertion), nicht an Setup-Fehlern — ein
      Fehlschlag im Setup würde eine bestandene Implementierung vortäuschen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/worktree-reap.bats
# expected: FAIL (8 von 8 rot — die Reap-Stufe existiert noch nicht)
```

## Task 2 — Kandidaten-Prüfung `_reap_candidate_reason`

- [ ] In `scripts/agent-lock.sh` eine Funktion `_reap_candidate_reason <branch>` ergänzen, die
      auf stdout `ok` ausgibt, wenn der Branch obsolet ist, sonst einen kurzen Skip-Grund
      (`upstream-live`, `no-upstream`, `no-ticket-id`, `ticket-open`, `live-claim`). Rückgabewert
      0 bei `ok`, 1 sonst.
- [ ] Prüfreihenfolge nach Kosten, nicht nach Wichtigkeit: Upstream-Zustand (rein lokal), dann
      `_branch_is_live_claimed`, dann Arbeitsbaum, zuletzt der Ticket-Status. Der Ticket-Lookup
      ist der einzige Schritt mit DB-Roundtrip und darf nur laufen, wenn alle billigen Kriterien
      schon getragen haben — `cmd_reap` läuft bei jedem `claim`.
- [ ] Upstream-Kriterium: `git rev-parse --abbrev-ref <br>@{upstream}` liefert einen Namen UND
      `git show-ref --verify refs/remotes/<upstream>` schlägt fehl. Ein leerer Upstream ist
      **kein** Löschgrund — anders als in der bisherigen Zeile 463.
- [ ] Ticket-Lookup über `${TICKET_SH:-$REPO/scripts/ticket.sh}` (Muster aus
      `scripts/branch-reaper.sh`), Ticket-ID per `grep -oE 'T[0-9]{6}'` aus dem Branchnamen.
      Kein Treffer im Namen, leere Antwort oder ein Status außerhalb `done|archived` →
      Skip-Grund, nie Löschung.

## Task 3 — Reap-Stufe in `cmd_reap` verdrahten

- [ ] Schritt 2c so umbauen, dass er über alle lokalen Branches außer `main` iteriert und
      `_reap_candidate_reason` konsultiert, statt über `git branch --merged main` zu filtern.
      Dieser Vorfilter ist die Hauptursache und muss verschwinden, nicht ergänzt werden.
- [ ] Pro Kandidat den zugehörigen Worktree über `git worktree list --porcelain` ermitteln.
      Existiert einer: Arbeitsbaum-Prüfung `git -C <wt> status --porcelain`; nicht leer →
      Skip mit Begründung.
- [ ] Selbstschutz: den eigenen Worktree (`git rev-parse --show-toplevel`) nie entfernen,
      unabhängig davon, wie reif der Branch ist.
- [ ] Vor der Löschung `git tag -f "reaped/<branch>" <sha>` setzen. Schlägt das Setzen fehl,
      wird **nicht** gelöscht — das Netz ist Vorbedingung, nicht Beiwerk (Muster aus
      `branch-reaper.sh`).
- [ ] Dann `git worktree remove <pfad>` (falls Worktree) und `git branch -D <branch>`. `-D` ist
      unvermeidlich: `-d` kann nach einem Squash-Merge nie greifen.
- [ ] Ausgabe: eine `AGENT-LOCK: `-Zeile je entferntem und je übersprungenem Kandidat auf
      stderr. Kein Output für `upstream-live` — sonst steht unter jedem `claim` eine Zeile pro
      aktivem Branch. Kein `2>/dev/null || true` um die neuen Git-Aufrufe: die Stummheit dort
      ist die zweite Ursache dieses Bugs.

## Task 4 — Kontrakt-Kommentare nachziehen

- [ ] Den Kommentarblock ab Zeile 423 (`cmd_reap() does NOT delete worktree directories`,
      T002242 M2-DOC) neu schreiben statt löschen: er muss jetzt beschreiben, dass Worktrees
      unter den vier Kriterien entfernt werden, und warum die frühere Zusage umgekehrt wurde.
      Die Abgrenzung zu `scripts/factory/watchdog.sh` bleibt bestehen — dort geht es um
      abgestürzte Factory-Pipelines (`sf-*`), hier um normal beendete Vorgänge.
- [ ] Den veralteten S1-Hinweis in Zeile 483 („unter dem S1-Limit von 500 Zeilen") auf den
      tatsächlichen Wert korrigieren und die Quelle (`docs/code-quality/gates.yaml`) nennen,
      statt die Zahl erneut zu duplizieren.

## Task 5 — GREEN + Regressionsbreite

- [ ] Den BATS-Test erneut ausführen; alle acht Tests müssen grün sein.
- [ ] Die bestehenden agent-lock-Tests mitlaufen lassen — die Änderung sitzt in einer Funktion,
      die bei jedem `claim` läuft, ein Regressionsschaden würde sich dort zuerst zeigen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/worktree-reap.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-force-claim.bats \
  tests/spec/agent-lock-claim-persist.bats tests/spec/agent-lock-fetch-guard.bats
```

## Task 6 — Abschließende Verifikation

- [ ] Die drei verbindlichen Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
