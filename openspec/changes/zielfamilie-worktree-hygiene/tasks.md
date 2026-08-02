---
title: "zielfamilie-worktree-hygiene — Implementation Plan"
ticket_id: T002443
domains: [agentic-tooling, testing, plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# zielfamilie-worktree-hygiene — Implementation Plan

_Ticket: T002443_

## File Structure

```
scripts/lib/wt-hygiene-measure.sh          (neu)  Messquelle für G-WT01..G-WT06
tests/spec/health-goals/worktree-hygiene-goals.bats  (neu)  Output-Verifikation je Ziel
.claude/lib/goals.md                       (geändert)  Bereich ab "## G-WT01" bis Prio-C-Grenze
scripts/health-goals-check.sh              (geändert)  nur die WT-TARGETS-Sektion
Taskfile.yml                               (geändert)  health:wt + Warn-Block in freshness:check
website/src/lib/goals-data.generated.json  (generiert) via task freshness:regenerate
website/src/data/test-inventory.json       (generiert) via task test:inventory
```

**Zeilenbudget (S1).** Nur `scripts/health-goals-check.sh` fällt unter ein S1-Extension-Limit und
existiert bereits; `.claude/lib/goals.md` (`.md`) und `Taskfile.yml` (`.yml`) haben kein Limit in
`docs/code-quality/gates.yaml`.

| Datei | Ist | Budget |
|---|---|---|
| `scripts/health-goals-check.sh` | 615 | 185 |

Der Umbau in dieser Datei ist **netto zeilenreduzierend**: die sechs Messblöcke werden durch je
einen einzeiligen Skriptaufruf ersetzt. `scripts/lib/wt-hygiene-measure.sh` ist neu und wird mit
Wachstumsreserve unter dem `.sh`-Limit von 800 Zeilen geschnitten (Zielgröße unter 300 Zeilen).

## Entscheidungen, die dieser Plan voraussetzt

Die Begründungen stehen vollständig in `proposal.md`. Kurzfassung, damit der Implementer nicht
gegen sie anläuft:

1. **Lokal, nicht CI.** Die Familie misst lokalen Maschinenzustand. In CI wird sie mit sichtbarer
   Notiz übersprungen, nicht grün gemeldet.
2. **`n/a` statt `0`.** Fehlt die Messgrundlage, ist die Ausgabe `n/a`. `health-goals-check.sh`
   zählt das als übersprungen.
3. **Eine Messquelle.** Messlogik lebt in `scripts/lib/wt-hygiene-measure.sh`; `goals.md` und
   `health-goals-check.sh` rufen sie nur auf.
4. **Kein Fail im Merge-Gate.** Der Block in `freshness:check` warnt und ändert den Exit-Status
   nicht.
5. **Abgrenzung zu `G-LLM*` (T002442).** Nur der Bereich ab `## G-WT01` in `goals.md` und nur die
   `WT-TARGETS`-Sektion in `health-goals-check.sh` werden angefasst. Der Warn-Block wird über die
   Liste `HG_LOCAL_ONLY_GOALS` parametrisiert, damit T002442 seine IDs dort nachträgt statt einen
   zweiten Block anzulegen.

## Task 1 — RED: Verhaltenstests für die sechs Messungen

Neue Datei `tests/spec/health-goals/worktree-hygiene-goals.bats` nach der Verzeichniskonvention
aus T002416 (eine Datei pro Vorgang, Verzeichnis nach dem SSOT-Spec-Slug `health-goals`).

Prüfmodus im Dateikopf dokumentieren: **command output verification** (T002448-M4). Jeder Test
führt `scripts/lib/wt-hygiene-measure.sh <subcommand>` gegen eine Fixture aus und prüft `$output`
und `$status`; kein `grep` auf den Skriptquelltext.

Fixture-Aufbau je Test in `mktemp -d`:

- ein Git-Repo mit einem Commit auf `main` und einer gesetzten `origin/main`-Referenz
  (`git update-ref refs/remotes/origin/main HEAD`), damit kein Netzzugriff nötig ist,
- Worktrees per `git worktree add`,
- Lock-Dateien als JSON direkt in ein per `AGENT_LOCK_DIR` überschriebenes Verzeichnis geschrieben.

Pro Ziel **zwei** Tests, in dieser Reihenfolge (Positiv-Anker zuerst, T002356-M1):

- **Anker-Test:** ohne Messgrundlage muss die Ausgabe `n/a` sein und darf nicht `0` sein.
- **Verletzungs-Test:** mit präparierter Verletzung muss die Ausgabe die Verletzung zählen, und ein
  gültiger Nachbarfall in derselben Fixture darf nicht mitgezählt werden.

Zusätzlich drei Tests aus den belegten Vorfällen:

- `G-WT03`, Fall T002570: Lock mit toter `owner_pid` **und** `heartbeat_at == created_at`, älter als
  zweimal TTL, bei **existierendem** Worktree. Erwartung: wird gezählt. Dieser Fall ist der Grund
  für die Heartbeat-Regel — `agent-lock.sh reap` räumt ihn nicht, weil der Worktree noch steht.
- `G-WT03`, Gegenprobe: Lock mit lebender `owner_pid` (`$$` des Testprozesses) und frischem
  Heartbeat. Erwartung: wird nicht gezählt.
- `G-WT06`: Lock mit `scope` gleich `--label` neben einem Lock mit `scope` gleich `ticket`.
  Erwartung: Zählwert 1.

Ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/worktree-hygiene-goals.bats
# expected: FAIL — scripts/lib/wt-hygiene-measure.sh existiert noch nicht
```

Syntax-Vorprüfung der neuen Datei mit `tests/unit/lib/bats-core/bin/bats --count <datei>`;
`bash -n` ist für `.bats` untauglich (T002351-M2).

## Task 2 — GREEN: Messquelle `scripts/lib/wt-hygiene-measure.sh`

Ein Skript mit sechs Subkommandos, je eine Zahl oder `n/a` auf stdout, Exit 0 auch bei `n/a`
(der Aufrufer unterscheidet über den Wert, nicht über den Status):

| Subkommando | Ziel | Was gezählt wird |
|---|---|---|
| `main-checkout` | `G-WT01` | 1 wenn Hauptcheckout nicht auf `main` steht oder dirty ist, sonst 0 |
| `stale-worktrees` | `G-WT02` | Worktrees mit nach `main` gemergtem HEAD oder letztem Commit älter als 14 Tage |
| `orphan-locks` | `G-WT03` | Locks mit toter `owner_pid` oder `heartbeat_at` älter als zweimal TTL |
| `unsafe-worktrees` | `G-WT04` | Worktrees, die gleichzeitig löschbereit und dirty sind |
| `main-divergence` | `G-WT05` | Commits in `main..origin/main` |
| `phantom-scope-locks` | `G-WT06` | Locks mit leerem `scope` oder `scope` beginnend mit `-` |

Gemeinsame Regeln:

- Repo-Wurzel aus `HG_REPO_ROOT`, Vorgabe `$HOME/Bachelorprojekt`. Lock-Verzeichnis aus
  `AGENT_LOCK_DIR`, Vorgabe `$(git rev-parse --git-common-dir)/agent-locks` — dieselben
  Überschreibungen, die `scripts/agent-lock.sh` bereits kennt, damit die Tests ohne Sonderpfad
  auskommen.
- Positiv-Anker als erste Anweisung jedes Subkommandos; schlägt er fehl, `n/a` ausgeben und
  beenden.
- `stderr` nicht nach `/dev/null` umleiten, wenn dadurch ein Fehler als leere Eingabe bei `wc -l`
  landen könnte — leerer Eingabestrom darf nie als Null-Befund durchgehen.
- Für `orphan-locks` die TTL nicht neu erfinden, sondern `AGENT_LOCK_TTL` mit derselben Vorgabe wie
  `scripts/agent-lock.sh` lesen und mit Faktor zwei anwenden.
- Merged-Erkennung über `git merge-base --is-ancestor <worktree-head> origin/main`, nicht über
  `git branch -r --contains <branchname>`: der HEAD-Commit ist die Aussage, die interessiert, und
  ein Worktree mit detached HEAD hat keinen Branchnamen.

Nach diesem Task muss der Testlauf aus Task 1 grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals/worktree-hygiene-goals.bats
```

## Task 3 — `.claude/lib/goals.md`: Familie auf sechs Ziele bringen

Nur den Bereich ab `## G-WT01` bearbeiten. Der `G-LLM*`-Block darüber bleibt unangetastet.

- `G-WT01` bis `G-WT03`: Messblock durch den Aufruf von `scripts/lib/wt-hygiene-measure.sh` ersetzen,
  Prosa zum Positiv-Anker an das tatsächliche Verhalten angleichen. Bei `G-WT03` die Heartbeat-Regel
  und den Vorfall vom 2026-08-02 als Begründung aufnehmen.
- `G-WT04` bis `G-WT06` neu anlegen, im Format der Bestandsziele: H2-Zeile mit Wertepfeil,
  Abschnitt `**Was:**`, Messblock, Meta-Zeile mit Priorität, Baseline, Target, Aufwand,
  Messzyklus, Reproduzierbarkeit und `**Ticket:** T002443`.
- Reproduzierbarkeit einheitlich als „nur lokal" führen; das ist die Scope-Entscheidung aus dem
  Proposal und ihr sichtbarer Niederschlag in der SSOT.
- Im Abschnitt `Messzyklus` am Dateiende eine Zeile für die lokale Familie ergänzen, damit die
  sechs IDs nicht in der Wöchentlich-Liste der CI-Ziele landen.

Baselines werden **gemessen**, nicht geschätzt: einmal `bash scripts/lib/wt-hygiene-measure.sh`
je Subkommando auf dem Hauptcheckout laufen lassen und die Werte eintragen.

## Task 4 — `scripts/health-goals-check.sh`: WT-Sektion auf die Messquelle umstellen

Ausschließlich die Sektion `WT-TARGETS` ersetzen. Die `LLM-TARGETS`-Sektion davor bleibt
unangetastet, damit T002442 dort ohne Konflikt arbeiten kann.

Je Ziel eine `row target`-Zeile mit dem Skriptaufruf als Wert. Die bisherigen mehrzeiligen
Shell-Substitutionen entfallen — das ist die Netto-Zeilenreduktion aus dem Budget-Abschnitt oben.

Prüfen, dass ein `n/a`-Wert vom Report als übersprungen gezählt wird und nicht als erreicht:

```bash
bash scripts/health-goals-check.sh --only=G-WT01,G-WT02,G-WT03,G-WT04,G-WT05,G-WT06
```

## Task 5 — Messort: `health:wt` und Warn-Block in `freshness:check`

- Neue Task `health:wt` in `Taskfile.yml`, die `scripts/health-goals-check.sh` auf die IDs aus
  `HG_LOCAL_ONLY_GOALS` einschränkt. Das erfüllt zugleich das S4-Gate: das neue Skript ist über
  Taskfile und `health-goals-check.sh` erreichbar und damit kein Orphan.
- `HG_LOCAL_ONLY_GOALS` als Taskfile-Variable mit den sechs `G-WT*`-IDs anlegen. T002442 hängt seine
  `G-LLM*`-IDs an dieselbe Variable an.
- In `freshness:check` einen Warn-Block hinter dem bestehenden Divergenz-Hinweis aus T002561
  ergänzen. Ist `CI` gesetzt, eine Skip-Notiz mit Begründung ausgeben und nichts messen. Ist `CI`
  leer, `health:wt` aufrufen und das Ergebnis mit `|| true` entkoppeln, damit der Exit-Status des
  Gates unverändert bleibt.

Der Block gehört bewusst **nicht** in `freshness:regenerate`: diese Task schreibt Artefakte und
läuft auch in CI, der Warn-Block ist reine lokale Anzeige.

Gegenprobe beider Zweige:

```bash
task freshness:check 2>&1 | grep -c 'G-WT'
CI=true task freshness:check 2>&1 | grep -c 'uebersprungen'
```

## Task 6 — Finale Verifikation

- [ ] Testinventar neu erzeugen, weil eine BATS-Datei hinzugekommen ist:

```bash
task test:inventory
```

- [ ] OpenSpec-Delta validieren:

```bash
bash scripts/openspec.sh validate zielfamilie-worktree-hygiene
```

- [ ] Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:regenerate` erzeugt `website/src/lib/goals-data.generated.json` aus der geänderten
`goals.md` neu; die Datei gehört mit in den Commit, sonst schlägt `freshness:check` an.
