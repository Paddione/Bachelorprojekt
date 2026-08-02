---
title: "openspec-archive-backlog — Implementation Plan"
ticket_id: T002569
domains: [plan-authoring, testing, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-archive-backlog — Implementation Plan

_Ticket: T002569_

## File Structure

```
NEU:
  tests/spec/openspec-workflow/archive-terminal-ticket-status.bats   RED-Test für Entscheidung 1
  openspec/changes/openspec-archive-backlog/manifest.tsv             eingefrorener Chargen-Zuschnitt (liegt bereits vor)
  openspec/changes/openspec-archive-backlog/stragglers.md            Nachzügler-Protokoll, entsteht nur bei Guard-Bruch

GEÄNDERT:
  scripts/openspec.sh                                                Terminal-Status-Guard in cmd_archive
  openspec/specs/*.md                                                SSOT-Merge-Ziele der 139 Deltas
  website/src/data/openspec-status.json                              regeneriert, je Charge im selben Commit

VERSCHOBEN (139 Verzeichnisse, je Charge 20 bzw. 19):
  openspec/changes/<slug>/  ->  openspec/changes/archive/<datum>-<slug>/
```

## Ausgangslage

Alle Zahlen sind am 2026-08-02 im Worktree gemessen; die Messmethode steht in `proposal.md`
unter „Messung" und ist dort als kopierbarer Befehlsblock hinterlegt.

| Größe | Wert |
|---|---|
| unarchivierte Change-Verzeichnisse | 181 |
| davon mit `.ticket`-Link | 140 |
| davon Ticket `done` | 128 |
| davon Ticket `archived` | 10 |
| davon Ticket `planning` (dieser Change selbst) | 1 |
| **archivierbar (Scope dieses Plans)** | **139** |
| ohne `.ticket`-Link (nicht im Scope, nur zählen) | 41 |

Vorab-Budget nach `scripts/plan-lint.sh residual_budget`: `scripts/openspec.sh` Ist 311,
Budget 489. Die Änderung in Task 2 umfasst ~4 Zeilen und bleibt weit darunter.

## Eingefrorener Chargen-Zuschnitt

Verbindliche Quelle: `openspec/changes/openspec-archive-backlog/manifest.tsv` (Spalten
`batch`, `slug`, `ticket`, `ticket_status`, `target_spec`, `archive_flag`). Diese Datei wird zur
Ausführungszeit **gelesen**, nicht neu berechnet.

| Charge | Changes | von … bis | davon `--create-new` | davon Ticket `archived` |
|---|---|---|---|---|
| 1 | 20 | `admin-redirect-map` … `cockpit-daemon-runtime` | 7 | 1 |
| 2 | 20 | `db-backup-filen-fix` … `fix-factory-gang-drift` | 9 | 3 |
| 3 | 20 | `fix-flux-render-envsubst` … `micro-spec-consolidation` | 7 | 1 |
| 4 | 20 | `mishap-bundle-dev-flow-scripts` … `mishap-t002341` | 19 | 0 |
| 5 | 20 | `mishap-t002352` … `pipeline-divergence-T002393` | 14 | 2 |
| 6 | 20 | `plan-context-summary` … `t002182-spec-tests-gate` | 7 | 3 |
| 7 | 19 | `t002183-triage-fix` … `t002150-website-db-split-stage-2` | 4 | 0 |

Sortierung innerhalb einer Charge ist die Manifest-Reihenfolge. Einzige inhaltliche Abweichung
von der Alphabetik: `website-db-split` steht unmittelbar vor
`t002150-website-db-split-stage-2` am Ende von Charge 7, weil beide auf dieselbe noch fehlende
SSOT `website-db-split.md` zielen — nur der erste trägt `--create-new`.

## Ausführungsregeln für alle Chargen

1. **Niemals im Hauptcheckout.** Jede Charge läuft in einem eigenen Worktree unter
   `.worktrees/`, angelegt mit `bash scripts/worktree-create.sh chore/openspec-archive-c<N>-T002569 .worktrees/openspec-archive-c<N>`.
   Direktes Archivieren in `~/Bachelorprojekt` hat am 2026-08-02 zwei Direkt-Commits auf `main`
   erzeugt (T002567) und am 2026-07-15 rund 26 unkommitierte Archivierungen liegen lassen
   (T001880).
2. **Ein PR je Charge**, Branch `chore/openspec-archive-c<N>-T002569` (die Ticket-ID im
   Branchnamen ist Pflicht — `.githooks/pre-commit` prüft `T[0-9]{6,}` case-sensitive).
3. **Die nächste Charge startet erst nach grünem Merge der vorigen.** Grund: jede Charge
   verändert `openspec/specs/**` und `website/src/data/openspec-status.json`; zwei offene
   Chargen-PRs kollidieren dort garantiert.
4. **`website/src/data/openspec-status.json` gehört in denselben Commit** wie die Archivierung.
   `cmd_archive` schreibt die Datei nach dem `mv` neu; ohne explizites `task freshness:regenerate`
   und `git add` bleibt sie unstaged und CI meldet sie als stale.
5. **Kein Rateschritt bei `--create-new`.** Gesetzt wird ausschließlich, was in der
   Manifest-Spalte `archive_flag` steht.

---

## Task 1 — RED: `archive` weist Ticket-Status `archived` ab

Neue Datei `tests/spec/openspec-workflow/archive-terminal-ticket-status.bats`.
Prüfmodus laut Header-Kommentar: **Output-Verifikation** — der Test ruft
`scripts/openspec.sh archive` gegen ein Fixture-Verzeichnis auf (`OPENSPEC_ROOT` zeigt auf
`$BATS_TEST_TMPDIR`) und prüft `$status`/`$output`, er greppt nicht die Quelldatei.

Test 1 (Negativ-Aussage): Ticket-Status `archived` wird akzeptiert. Der Ticket-Lookup wird über
einen `TICKET_SH`-Stub bedient, der `{"status":"archived"}` ausgibt.
Test 2 (Positiv-Anker, Pflicht nach T002356-M1): derselbe Aufbau mit Status `in_progress` muss
weiterhin abgewiesen werden und der Change unverändert an Ort und Stelle bleiben — sonst wäre
Test 1 auch dann grün, wenn der Guard komplett entfernt würde.
Test 3: Status `done` bleibt akzeptiert (Regressionsschutz für den Bestandsweg).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# expected: FAIL — cmd_archive vergleicht heute [[ "$st" == "done" ]] und lehnt 'archived' ab
```

## Task 2 — GREEN: Terminal-Status-Guard in `scripts/openspec.sh`

In `cmd_archive` den Vergleich `[[ "$st" == "done" ]]` durch eine Prüfung gegen die Menge der
terminalen Zustände ersetzen (`done`, `archived`) und die Fehlermeldung auf
`expected 'done' or 'archived'` anpassen. Die Prüfung bleibt fail-closed: ein leerer oder
unbekannter Status führt weiterhin zum Abbruch **vor** dem Delta-Merge.

Ein Kommentar über der Prüfung hält fest, warum `archived` zählt: es ist ein *späterer*
Lifecycle-Zustand als `done`, kein früherer. Ohne diesen Hinweis wird die Erweiterung beim
nächsten Lesen als Aufweichung missverstanden.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-terminal-ticket-status.bats
# erwartet: 3 Tests grün
bash scripts/plan-lint.sh residual_budget scripts/openspec.sh   # muss > 0 bleiben
```

Task 1 und Task 2 gehen zusammen mit dem Plan-Commit als **PR 0** nach `main`. Erst danach
beginnt Charge 1 — Charge 1 enthält einen Change mit Ticket-Status `archived` und würde ohne
diesen Fix abbrechen.

## Task 3 — Bestandsaufnahme der 41 Changes ohne `.ticket`-Link, Folgeticket

Zählen und namentlich festhalten, nicht bewerten:

```bash
for d in openspec/changes/*/; do
  [ "$d" = "openspec/changes/archive/" ] && continue
  [ -f "$d/.ticket" ] || basename "$d"
done | tee /dev/stderr | wc -l
```

Mit dieser Liste ein Folgeticket anlegen:

```bash
bash scripts/ticket.sh create --type chore --brand mentolder --priority niedrig \
  --title "OpenSpec: Changes ohne .ticket-Link bewerten" \
  --description "<Liste der Slugs> — Abschlussstatus maschinell nicht bestimmbar, aus T002569 ausgegliedert."
bash scripts/ticket.sh link --from T002569 --to <neue-id> --type follows
```

Damit ist AC3 des Tickets in seiner ersetzten Fassung erfüllt („gezählt und in einem
Folgeticket erfasst"). Ein Rateschritt über den Abschlussstatus findet in diesem Vorgang nicht
statt.

## Task 4 — Charge N ausführen (Ablaufmuster, siebenmal angewandt)

Der Ablauf ist für alle sieben Chargen identisch. `N` ist die Chargennummer.

**4.1 Worktree und Branch**

```bash
bash scripts/worktree-create.sh "chore/openspec-archive-c${N}-T002569" ".worktrees/openspec-archive-c${N}"
cd ".worktrees/openspec-archive-c${N}"
bash scripts/agent-lock.sh claim ticket T002569 --label openspec-archive
```

**4.2 Chargen-Liste aus dem eingefrorenen Manifest lesen**

```bash
MAN=openspec/changes/openspec-archive-backlog/manifest.tsv
awk -F'\t' -v b="$N" '!/^#/ && $1==b {print $2"\t"$6}' "$MAN"
```

**4.3 Archivieren, Zeile für Zeile, in Manifest-Reihenfolge**

```bash
while IFS=$'\t' read -r slug flag; do
  [ -d "openspec/changes/$slug" ] || { echo "uebersprungen (nicht mehr vorhanden): $slug"; continue; }
  bash scripts/openspec.sh archive "$slug" $flag || { echo "ABBRUCH bei $slug"; break; }
done < <(awk -F'\t' -v b="$N" '!/^#/ && $1==b {print $2"\t"$6}' "$MAN")
```

Ein Change, der nicht mehr unter `openspec/changes/` liegt, wird übersprungen statt zum Fehler
erklärt: er kann zwischenzeitlich durch eine Fremdsession archiviert worden sein.

**4.4 Validieren — VOR dem Commit**

```bash
task openspec:validate
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
```

Bricht einer der beiden Läufe, weiter mit Task 5. Nur wenn beide grün sind, weiter mit 4.5.

**4.5 Freshness mitziehen und committen**

```bash
task freshness:regenerate
git add openspec/changes/ openspec/specs/ website/src/data/openspec-status.json
git add -u -- website/src/data docs
git commit -m "chore(openspec): archive Charge ${N} (20 Changes) [T002569]"
git push -u origin "chore/openspec-archive-c${N}-T002569"
gh pr create --title "chore(openspec): archive Charge ${N} [T002569]" \
  --body "Charge ${N} des Vollzugsrückstaus aus T002569. Zuschnitt: openspec/changes/openspec-archive-backlog/manifest.tsv" \
  --base main
gh pr merge --auto --squash --delete-branch
```

Auto-Merge wird unmittelbar nach `pr create` gesetzt; ein Sessionabbruch dazwischen hinterlässt
sonst einen PR ohne Auto-Merge.

**4.6 Abschluss der Charge**

Nach grünem Merge den Worktree entfernen (`git worktree remove` nur nach `git status --porcelain`
auf leer) und den Lock freigeben. Dann erst Charge N+1 beginnen.

## Task 5 — Guard-Reißer in einer Charge behandeln

Dies ist der Fall, der T002567 erzeugt hat, und er wird als erwarteter Normalfall behandelt.
`task openspec:validate` beziehungsweise der Scenario-Ratchet in
`tests/spec/openspec-workflow.bats` meldet eine SSOT-Spec, deren Requirement keinen
`#### Scenario:`-Block trägt. Weil `archive` das Delta unverändert in die SSOT merged, ist der
Verursacher immer genau das Delta, das diese Spec zuletzt angefasst hat.

**5.1 Verursacher bestimmen**

```bash
task openspec:validate 2>&1 | grep -i scenario     # nennt die betroffene SSOT-Datei
SPEC=<gemeldete-datei>                              # z. B. openspec/specs/factory-gang.md
awk -F'\t' -v s="$(basename "$SPEC" .md)" '!/^#/ && $5 ~ s {print $1"\t"$2}' \
  openspec/changes/openspec-archive-backlog/manifest.tsv
```

**5.2 Nur diesen einen Change zurückrollen**

```bash
git checkout -- "$SPEC"                                       # SSOT auf Vor-Merge-Stand
git checkout -- "openspec/changes/archive"                    # falls schon verschoben
git checkout -- "openspec/changes/${OFFENDER}" 2>/dev/null || \
  git mv "openspec/changes/archive/$(date +%F)-${OFFENDER}" "openspec/changes/${OFFENDER}"
task openspec:validate                                        # muss jetzt grün sein
```

**5.3 Nachzügler protokollieren**

Zeile in `openspec/changes/openspec-archive-backlog/stragglers.md` anhängen: Slug, Charge,
betroffene SSOT-Spec, Fehlermeldung im Wortlaut. Diese Datei wandert mit dem Chargen-Commit.

**5.4 Rest der Charge normal ausliefern** (weiter bei 4.5). Die restlichen 19 Changes sind vom
Bruch nicht betroffen — jedes Delta merged in seine eigene SSOT-Datei.

**5.5 Nachzügler in einem eigenen PR reparieren.** Der fehlende `#### Scenario:`-Block wird im
**Delta** unter `openspec/changes/<slug>/specs/` ergänzt, niemals direkt in der SSOT: ein
Direktedit an der SSOT neben einem gepflegten Delta macht den Delta-Marker zwangsläufig falsch
und der Fehler fällt erst beim nächsten Archivieren auf (T002375-p5). Danach wird der Change
regulär nach dem Muster aus Task 4 archiviert.

Sammeln sich mehr als drei Nachzügler, werden sie zu einem gemeinsamen Reparatur-PR gebündelt,
statt drei einzelne PRs durch die CI zu schieben.

## Task 6 — Abschluss und Nachweis

```bash
# AC1: keine Changes mehr, deren Ticket done/archived ist (Messmethode aus proposal.md)
# AC4: Feed-Grösse nach dem Abbau dokumentieren
bash scripts/plan-context.sh orchestrator --with-openspec | grep -c '^## ' || true
ls -d openspec/changes/*/ | grep -v '/archive/$' | wc -l
```

Beide Zahlen als Kommentar an T002569 hängen (`bash scripts/ticket.sh comment --id T002569`),
zusammen mit der Nummer des Folgetickets aus Task 3 und dem Inhalt von `stragglers.md`, falls
die Datei entstanden ist.

## Task 7 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil dieser Vorgang `openspec/` grossflächig anfasst:

```bash
task openspec:validate
bash scripts/openspec-half-archive-check.sh
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow/
```
