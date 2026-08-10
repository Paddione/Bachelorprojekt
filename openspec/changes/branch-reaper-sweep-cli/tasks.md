---
title: "branch-reaper-sweep-cli — Implementation Plan"
ticket_id: T003180
domains: [bachelorprojekt-test, bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# branch-reaper-sweep-cli — Implementation Plan

_Ticket: T003180 (führend) · T003074 (mitgelöst)_

## File Structure

| Datei | Ist-Zeilen | Budget | Art |
|---|---|---|---|
| `scripts/branch-reaper.sh` | 204 | 596 | geändert — Argumentparser + Kandidatenauswahl |
| `tests/spec/ci-cd/branch-reaper-sweep.bats` | 155 | neu | neu — RED-Test, liegt bereits auf dem Branch |
| `.claude/skills/references/repo-hygiene-ops.md` | 444 | — | geändert — §2 auf das korrigierte Werkzeug |
| `openspec/changes/branch-reaper-sweep-cli/specs/ci-cd.md` | — | — | Delta-Spec (Parent-SSOT `ci-cd`) |

`scripts/branch-reaper.sh` ist nicht baselined; wirksame Schwelle ist das statische `.sh`-Limit
aus `docs/code-quality/gates.yaml` (800) → Budget 596 Zeilen. Der Eingriff bewegt sich im Bereich
von etwa 40 Zeilen; ein Split ist nicht nötig.

`.claude/skills/references/repo-hygiene-ops.md` trägt kein `.md`-Limit in `s1.limits` und wird
vom S1-Ratchet nicht erfasst — deshalb steht dort kein Zahlenbudget.

**Nicht anfassen:** die Löschschleife ab `scripts/branch-reaper.sh:189`
(`for branch in "${REAP_LIST[@]}"` — Archiv-Tag-Push, Delete, `DELETED`-Meldung). Sie gehört
T003182, das auf `fix/branch-reaper-local-ref-T003182` bereits gestagt ist. Wer diesen Plan
ausführt und meint, die Schleife ändern zu müssen, stoppt und stimmt sich ab, statt sie zu
überschreiben.

## Task 1 — RED: Der Sweep-Guard liegt vor und ist rot

Der Test ist bereits mit diesem Plan committet
(`tests/spec/ci-cd/branch-reaper-sweep.bats`, 6 Fälle). Dieser Schritt bestätigt nur den
Ausgangszustand, bevor irgendetwas am Skript geändert wird.

Er deckt beide Defekte ab: Fall 2 den Argumentparser (T003180), Fälle 3–5 die Kandidatenauswahl
(T003074), Fall 6 die Sicherheitseigenschaft, dass ein ticketloser Aufruf ohne `--dry-run` nichts
löscht. Fall 1 ist der Positiv-Anker (T002356-M1): er belegt, dass der Einzel-Ticket-Modus läuft,
damit die übrigen Aussagen nicht vakuos bestehen können.

Der Test arbeitet ausschliesslich gegen ein Wegwerf-Repo (`git init` in `BATS_TEST_TMPDIR` mit
eigenem bare Remote). Er darf **niemals** gegen das echte Repo laufen — ohne `--dry-run` löscht
das Skript Remote-Branches, und ein Löschlauf ist nicht umkehrbar.

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/branch-reaper-sweep.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-sweep.bats
# expected: FAIL — Fall 1 grün (Anker), Fälle 2–6 rot mit "$status -eq 0 failed" (Exit 2)
```

Syntax-Prüfung nur über `bats --count`, nicht über `bash -n`: `@test "name" { … }` ist keine
gültige Bash-Syntax und `bash -n` meldet dort einen irreführenden Fehler.

- [ ] Beide Befehle laufen, die Ausgabe entspricht dem beschriebenen Muster.

## Task 2 — Argumentparser: ticketloser Modus (T003180)

In `scripts/branch-reaper.sh`, Bereich `:54-79`:

- [ ] `SWEEP=0` neben die bestehenden Defaults (`TICKET_ID`, `DRY_RUN`, `REMOTE`, `TARGET_REPO`)
      setzen.
- [ ] `--sweep` in die `while`-Schleife des Parsers aufnehmen.
- [ ] Den Format-Guard `case "$TICKET_ID" in` so umbauen, dass der `""`-Zweig nicht mehr
      bedingungslos abbricht:
      - `TICKET_ID` nicht leer → Format `T######` erzwingen wie bisher (der bestehende
        Fehlerpfad für eine malformed ID bleibt unverändert; `tests/spec/ci-cd/branch-reaper.bats`
        Fall 5 hängt daran).
      - `TICKET_ID` leer **und** (`DRY_RUN=1` oder `SWEEP=1`) → Sweep-Modus, kein Fehler.
      - `TICKET_ID` leer **und** weder `--dry-run` noch `--sweep` → Exit 2 wie bisher.
- [ ] `--ticket` zusammen mit `--sweep` → Exit 2 mit Begründung.
- [ ] `usage()` auf die neuen Formen erweitern.

Die Begründung, warum der leere Fall lesend erlaubt ist, gehört als Kommentar an den Guard: ein
Dry-Run schreibt nichts, es entsteht kein Archiv-Tag unter falscher Zuordnung. Der Guard bleibt
für den schreibenden Fall bestehen — das ist der Zweck des `--sweep`-Flags.

## Task 3 — Kandidatenauswahl: Sweep über alle Remote-Heads (T003074)

In `scripts/branch-reaper.sh`, Bereich `:118-130`:

- [ ] Den harten Filter `| grep -i -- "$TICKET_ID"` nur noch im Einzel-Ticket-Modus anwenden. Im
      Sweep-Modus entfällt er, die Liste ist dann `git ls-remote --heads` vollständig.
- [ ] Die „keine Kandidaten"-Meldung (`:127-130`) für den Sweep-Fall anpassen, damit sie nicht
      weiter eine Ticket-ID nennt, die es dort nicht gibt.
- [ ] In der Kandidatenschleife die Ticket-ID **je Branch** aus dem Branch-Namen ziehen, statt
      `$TICKET_ID` zu verwenden — etwa über `grep -o 'T[0-9]\{6\}'` auf den Branch-Namen. Im
      Einzel-Ticket-Modus bleibt es bei der übergebenen ID.
- [ ] Trägt ein Branch keine `T######`-ID im Namen: `KEEP` mit Begründung, kein Ticket-Lookup.
      Kriterium 3 ist dort nicht prüfbar, und nicht prüfbar heisst verschonen.
- [ ] Der Ticket-Lookup (`:153`) verwendet die je Branch aufgelöste ID.

Der Ausgabevertrag `REAP <branch>` / `KEEP <branch> — <grund>` bleibt unverändert — er ist die
Schnittstelle, an der `tests/spec/ci-cd/branch-reaper.bats` und der neue Guard ansetzen.

Kosten im Blick behalten: der Sweep macht pro Kandidat einen `gh`- und einen `ticket.sh`-Aufruf.
Die bestehende Reihenfolge der Kriterien (PR-Abfrage vor Ticket-Lookup) beibehalten, damit ein
Branch, der schon an Kriterium 2 scheitert, keinen Ticket-Lookup auslöst.

## Task 4 — GREEN: Beide Guards laufen durch

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-sweep.bats
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper.bats
```

- [ ] Der neue Guard ist grün (6/6).
- [ ] Der Bestandsguard `branch-reaper.bats` ist unverändert grün (5/5). Er ankert an den
      REAP/KEEP-Präfixen; bricht er, wurde der Ausgabevertrag verletzt statt erweitert.
- [ ] Beide Formen der Spec-Ablage gemeinsam prüfen, weil Sammeldatei und Verzeichnis gleichzeitig
      gültig sind: `tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*`

## Task 5 — Runbook §2 auf das korrigierte Werkzeug

In `.claude/skills/references/repo-hygiene-ops.md`, Abschnitt „Verwaiste Remote-Branches (ohne
PR) [T002520]":

- [ ] Den Nachsehen-Aufruf auf die ticketlose Form umstellen
      (`bash scripts/branch-reaper.sh --dry-run`) und den Platzhalter `T00XXXX` entfernen. Er ist
      die Quelle der Falle aus T003074: der wörtlich ausgeführte Aufruf liefert „Keine
      Remote-Branches mit Ticket-ID T000000 gefunden." bei Exit 0 — nicht unterscheidbar von „es
      gibt keine verwaisten Branches".
- [ ] Beide Modi benennen: Einzel-Ticket-Lauf für den Post-Merge-Pfad, Sweep für die
      Bestandsaufnahme. Der Text begründet §2 mit einer Bestandsaufnahme über alle Remote-Branches
      — genau der Fall, den bisher nur Handarbeit abdeckte.
- [ ] Beim löschenden Sweep dazuschreiben, dass er `--sweep` verlangt und was das Archiv-Tag
      leistet.

Die Zeile im Runbook ist die Sollvorgabe, an der die beiden Tickets den Defekt festgemacht haben.
Bleibt sie stehen, wie sie ist, beschreibt sie nach diesem Vorgang ein Werkzeug, das es so nicht
mehr gibt.

## Task 6 — Abschliessende Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `task test:changed` ist grün.
- [ ] `task freshness:regenerate` hat `website/src/data/test-inventory.json` aktualisiert (der neue
      BATS-Guard muss im Inventar auftauchen) und die Änderung ist mitcommittet.
- [ ] `task freshness:check` ist grün, inklusive S1-Ratchet und Baseline-Key-Count.
- [ ] `bash scripts/plan-lint.sh openspec/changes/branch-reaper-sweep-cli/tasks.md` endet mit
      Exit 0.
- [ ] `git diff --stat origin/main -- scripts/branch-reaper.sh` zeigt keine Änderung an der
      Löschschleife ab Zeile 189 (Abgrenzung zu T003182).
