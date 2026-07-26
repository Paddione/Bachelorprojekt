---
title: "mishap-t002242 — Implementation Plan"
ticket_id: T002242
domains: [dev-flow-execute, software-factory, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002242 — Implementation Plan

_Ticket: T002242_

Bundle von drei unabhängigen Mishaps aus T002240 (dev-flow-execute-Lauf): ein
umgehbares Merge-Gate (M1), ein ungeklärter Worktree/Branch-Verlust (M2), und
ein Deploy-Skript, das Fehlschläge verschluckt (M3). Jedes Mishap bekommt
einen eigenen Fix-Task und einen eigenen RED-Test; alle drei Tests landen in
**bestehenden** `tests/spec/*.bats`-Dateien (siehe Begründung je Task) —
`tests/spec/mishap-t002242.bats` wird **nicht** angelegt (verstößt gegen die
BATS-Konvention in CLAUDE.md).

## File Structure

```
scripts/devflow-ci-watch.sh              # M1: fail-closed phase-chain gate vor exit 0
scripts/factory/watchdog.sh              # M2: git-status-Guard vor Zombie-Worktree-Force-Remove
scripts/agent-lock.sh                    # M2: Doku-Klarstellung ueber cmd_reap()
scripts/devflow-post-merge-deploy.sh     # M3: Exit-Code-Sammlung, fail-closed deploy-Phase-Event
tests/spec/ci-cd.bats                    # RED-Tests M1 + M3 (SSOT: openspec/specs/ci-cd.md)
tests/spec/software-factory.bats         # RED-Test M2 (SSOT: openspec/specs/software-factory.md)
```

## Verifizierte Ausgangslage (Code-Lektüre, nicht Vermutung)

- **M1**: `grep -rn 'assert-phase-chain' --include='*.sh' --include='*.yml' --include='*.js' --include='*.mjs' .`
  findet außerhalb von `scripts/ticket.sh` (Dispatch-Zeile 846) und
  `scripts/vda/ticket/assert-phase-chain.sh` (Definition) **keinen** Aufrufer.
  `scripts/devflow-ci-watch.sh` Zeilen 76–79 melden `exit 0` ("✅ … alle
  grün.") ohne jede Prüfung der Phase-Chain — genau die Stelle, die
  dev-flow-execute Schritt 6 als Merge-Voraussetzung behandelt.
- **M2**: `scripts/agent-lock.sh` `cmd_reap()` (Zeilen 328–364) tut heute
  **NICHT**, was der Mishap-Text unterstellt: Schritt 1 killt nur Prozesse mit
  cwd `*(deleted)`; Schritt 2 `git worktree prune` entfernt ausschließlich
  Admin-Metadaten für bereits fehlende Verzeichnisse (kein Effekt auf
  existierende Worktrees); Schritt 2c löscht nur lokale Branches, die
  **bereits in `main` gemerged** sind (`git branch --merged main`) — ein
  2 Minuten alter, ungemergeter Branch qualifiziert dafür nicht; Schritt 3
  löscht ausschließlich `.json`-Lock-Dateien via `_reapable()`, niemals
  Worktree-Verzeichnisse. **Fazit: `agent-lock.sh reap` kann den beobachteten
  Vorfall nach aktuellem Code nicht auslösen — die im Mishap-Text genannte
  Ursache ist durch Code-Lektüre NICHT bestätigt.** Das bleibt eine
  ungeklärte Hypothese (siehe Task M2 unten für die gewählte Alternative).
  Der einzige Skript-Pfad im Repo, der tatsächlich unbedingt (`--force`, ohne
  `git status`-Prüfung) einen Worktree-Verzeichnisbaum entfernt und sich
  selbst als Stale-Reaper versteht, ist die Zombie-Worktree-Cleanup in
  `scripts/factory/watchdog.sh` Zeilen 46–55 (matcht nur `sf-<ext_id>`-Branches
  von gestuckten Factory-Pipelines, nicht `chore/plan-archive-*` — deckt den
  konkreten Vorfall also ebenfalls nicht ab, ist aber der reale Kandidat für
  die geforderte Härtung "kein Force-Remove ohne leeren `git status --short`").
- **M3**: `scripts/devflow-post-merge-deploy.sh` Zeilen 29–32 rufen
  `task feature:website` / `feature:brett` / `docs:deploy` / `feature:deploy`
  ohne `$?`-Prüfung auf (kein `set -e` im Skript, Zeile 4: `set -u`); Zeilen
  34–35 schreiben danach bedingungslos
  `./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "deployed (post-merge)" 2>/dev/null || true`.
  Live beobachtet (T002240): `task feature:website` scheiterte mit Exit 201,
  das Skript meldete trotzdem `deploy/done`.

## Tasks

### M1 — Fail-closed Phase-Chain-Gate in devflow-ci-watch.sh verankern

**Komponente:** `scripts/devflow-ci-watch.sh`

**Fix:** Unmittelbar vor dem bestehenden `echo "✅ $TOTAL_CHECKS CI-Checks,
alle grün." ; exit 0` (aktuell Zeilen 77–78) einen Aufruf
`./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"` einfügen. Bei
Exit 0 (Kette vollständig) wie bisher `exit 0`. Bei Exit ≠ 0 (Kette
unvollständig) eine klare Fehlermeldung ausgeben (inkl. der von
`assert-phase-chain` bereits gelieferten Backfill-Befehle auf stderr) und das
Skript mit einem neuen, eindeutigen Exit-Code (`6` — `5` ist bereits durch
"keine CI-Checks" belegt) beenden. Da `devflow-ci-watch.sh` laut
dev-flow-execute Schritt 6 die einzige Instanz ist, deren Exit-Code über
"weiter zum Merge" entscheidet, macht das den Gate-Check nicht mehr
überspringbar — kein zusätzlicher CI-Workflow-Check ist für das
Kern-Problem nötig (das Ticket kommt aus lokalen Implementer-Läufen, nicht
aus einem GitHub-Actions-Kontext; ein CI-Check auf der Ticket-ID im
Commit-Subject würde erst NACH dem bereits erfolgten `gh pr merge` greifen
und den Merge selbst nicht mehr verhindern können). Diese Entscheidung ist
im Plan begründet dokumentiert, wie vom Auftrag gefordert.

- [ ] **M1-RED.** In `tests/spec/ci-cd.bats` (SSOT `openspec/specs/ci-cd.md`,
      Requirement "Squash-Auto-Merge" / "Post-Merge Ticket-Lifecycle und
      Manifest-Deploy" — dieselbe Datei enthält bereits den verwandten Test
      `T002186: devflow-ci-watch: 0 check-runs exits with code 5`, direkt
      darunter einfügen) folgenden Test ergänzen:

  ```bash
  @test "T002242-M1: devflow-ci-watch.sh ruft assert-phase-chain vor dem gruenen Exit auf" {
    run grep -n "assert-phase-chain" "$REPO_ROOT/scripts/devflow-ci-watch.sh"
    [ "$status" -eq 0 ]
  }
  ```

  Verifiziert RED auf dem aktuellen Branch:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002242-M1"
  # expected: FAIL (red — grep findet "assert-phase-chain" heute in devflow-ci-watch.sh nicht)
  ```

- [ ] **M1-GREEN.** Fix wie oben implementieren (Aufruf + neuer Exit-Code 6 +
      Fehlermeldung). `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002242-M1"`
      muss danach PASSen. Zusätzlich manuell/funktional gegenprüfen: ein
      Mock-`ticket.sh`, der `assert-phase-chain` mit Exit 1 beantwortet, muss
      `devflow-ci-watch.sh` mit Exit 6 (nicht 0) beenden lassen — als
      Ergänzungstest analog zum bestehenden T002186-Mock-Muster in derselben
      Datei, falls Zeitbudget erlaubt (kein Hard-Gate, STRUCT2 ist bereits
      durch den Grep-Test erfüllt).

### M2 — Zombie-Worktree-Force-Remove ohne git-status-Guard härten

**Komponente:** `scripts/factory/watchdog.sh` (Zombie-Worktree-Cleanup,
Zeilen 46–55), plus eine Klarstellung in `scripts/agent-lock.sh`.

**Hypothese-Status:** Der im Mishap-Text vermutete Mechanismus
(`agent-lock.sh reap` entfernt einen fremden, sekundenalten Worktree als
"stale") ist durch Code-Lektüre **widerlegt** — `cmd_reap()` besitzt heute
keinen Codepfad, der einen existierenden Worktree-Verzeichnisbaum löscht
(siehe "Verifizierte Ausgangslage" oben). Die eigentliche Ursache des
T002240-Vorfalls bleibt ungeklärt. Statt eine nicht belegbare Ursache zu
"fixen", wird hier der real existierende, unbedingte Force-Remove-Pfad
gehärtet, der am ehesten dem im Mishap beschriebenen Fix-Kriterium
(a) Mindestalter, (b) leerer `git status --short`, (c) keine aktive
Lock/Branch-Bindung entspricht — und der heute (b) nicht erfüllt.

**Fix:** In `scripts/factory/watchdog.sh`, unmittelbar vor Zeile 53
(`git worktree remove --force "$stale_wt" …`), eine Guard-Prüfung einfügen:
`git -C "$stale_wt" status --short` muss leer sein, sonst wird der Remove
übersprungen und stattdessen ein Kommentar über `ticket.sh add-comment`
geschrieben ("Watchdog: zombie worktree $stale_wt has uncommitted changes —
skipped force-remove, needs manual review"), damit unwiederbringliche
WIP nicht stillschweigend vernichtet wird (Bedingung a — Mindestalter 30 min
— ist über `FACTORY_STALE_MIN`/`updated_at` bereits gegeben; Bedingung c —
keine aktive Lock-Bindung — ist implizit gegeben, weil der Watchdog nur bei
`status='in_progress'` UND `updated_at` älter als `STALE_MIN` greift, was
eine tote/gestuckte Pipeline voraussetzt).

- [ ] **M2-RED.** In `tests/spec/software-factory.bats` (SSOT
      `openspec/specs/software-factory.md`, Requirement
      "Watchdog-Eskalation und Zombie-Cleanup" — direkt beim bestehenden
      Block `# ── FA-SF-26-watchdog ───` ab Zeile 850 ergänzen) folgenden
      Test hinzufügen:

  ```bash
  @test "T002242-M2: watchdog zombie-worktree cleanup prueft git status vor Force-Remove" {
    run grep -n "status --short" "$REPO_ROOT/scripts/factory/watchdog.sh"
    [ "$status" -eq 0 ]
  }
  ```

  Verifiziert RED auf dem aktuellen Branch:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "T002242-M2"
  # expected: FAIL (red — watchdog.sh entfernt den Worktree heute unbedingt, ohne git-status-Pruefung)
  ```

- [ ] **M2-GREEN.** Guard wie oben implementieren.
      `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "T002242-M2"`
      muss danach PASSen.

- [ ] **M2-DOC.** Einen kurzen Kommentar oberhalb von `cmd_reap()` in
      `scripts/agent-lock.sh` ergänzen, der explizit festhält, dass die
      Funktion aktuell **keine** Worktree-Verzeichnisse löscht (nur
      Lock-Dateien und gemergte Branches) — verhindert, dass ein künftiger
      Leser (Mensch oder Agent) demselben Fehlschluss wie im T002240-Mishap
      erliegt. Keine Verhaltensänderung, reiner Doku-Fix; kein eigener Test
      nötig (STRUCT2 ist bereits durch M2-RED erfüllt).

### M3 — devflow-post-merge-deploy.sh: Exit-Codes einsammeln, fail-closed melden

**Komponente:** `scripts/devflow-post-merge-deploy.sh`

**Fix:** Jeden `task …`-Aufruf (Zeilen 29–32) auf Exit-Code prüfen und in
einem Array sammeln (Task-Name + Exit-Code), z. B.:

```bash
FAILED_TASKS=()
if [[ "$DEPLOY_WEBSITE" == true ]]; then
  echo "🚀 Deploye Website (beide Brands)..."
  task feature:website || FAILED_TASKS+=("feature:website=$?")
fi
# … analog für feature:brett, docs:deploy, feature:deploy …

if [[ ${#FAILED_TASKS[@]} -eq 0 ]]; then
  ./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow \
    --detail "deployed (post-merge)" 2>/dev/null || true
else
  DETAIL="deploy blocked: $(IFS=,; echo "${FAILED_TASKS[*]}")"
  ./scripts/ticket.sh phase "$TICKET_ID" deploy blocked --driver devflow \
    --detail "$DETAIL" 2>/dev/null || true
  echo "❌ $DETAIL" >&2
  exit 1
fi
```

`deploy`/`blocked` ist laut `scripts/vda/ticket/_ticket-core.sh`-Enum bereits
ein gültiger Phase-State (analog zu `plan`/`implement`/`verify`); vor der
Implementierung kurz gegenprüfen, dass `blocked` für die Phase `deploy` vom
Schema akzeptiert wird (`scripts/ticket.sh phase --help` bzw. DB-Enum), sonst
alternativ `deploy failed` verwenden — dem Implementer-Sub­agent überlassen,
welcher Enum-Wert real existiert.

- [ ] **M3-RED.** In `tests/spec/ci-cd.bats` (SSOT `openspec/specs/ci-cd.md`,
      Requirement "Post-Merge Ticket-Lifecycle und Manifest-Deploy") folgenden
      Test ergänzen:

  ```bash
  @test "T002242-M3: devflow-post-merge-deploy.sh sammelt Exit-Codes und schlaegt fail-closed fehl" {
    run grep -nE '\|\| FAILED_TASKS|deploy blocked|deploy failed' "$REPO_ROOT/scripts/devflow-post-merge-deploy.sh"
    [ "$status" -eq 0 ]
  }
  ```

  Verifiziert RED auf dem aktuellen Branch:

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002242-M3"
  # expected: FAIL (red — das Skript prueft heute keinen Task-Exit-Code und kennt kein "deploy blocked")
  ```

- [ ] **M3-GREEN.** Fix wie oben implementieren.
      `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002242-M3"`
      muss danach PASSen. Zusätzlich empfohlen (kein Hard-Gate): ein
      Mock-`task`-Binary, das für `feature:website` Exit 201 liefert, gegen
      `devflow-post-merge-deploy.sh` laufen lassen und prüfen, dass das
      Skript selbst mit Exit ≠ 0 endet (reproduziert den live beobachteten
      T002240-Fall).

## Final Verification

- [ ] **Verify.** Alle drei mandatorischen CI-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
