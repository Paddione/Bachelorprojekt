# P7 — Tests (Batch)

Rolle: **tests**. Letztes Partial des Changes `batch-ci-check-evaluation` (T003540) — trägt
den STRUCT2-Failing-Test-Step des Gesamtplans. Sechs neue BATS-Dateien: fünf unter
`tests/spec/ci-cd/` (Verzeichnis-Konvention T002416: ein Verzeichnis pro SSOT-Spec) plus die
Batch-Aggregat-Datei `tests/spec/batch-ci-check-evaluation.bats`. Prüfmodus je Datei im
Header dokumentiert (T002448-M4); Assertions formatfrei (`grep -qF`-Substrings, Exit-Codes —
T002716); jeder Negativtest trägt einen Positiv-Anker im selben Test (T002356-M1).

BATS-Runner: `tests/unit/lib/bats-core/bin/bats` (vendored — NICHT `which bats`).
Syntax-Probe für neue Dateien: `tests/unit/lib/bats-core/bin/bats --count <datei>`.

## File `tests/spec/ci-cd/pre-push-scope-guard.bats` (net-new)

### Task P7.1 — Range-Helfer gegen Temp-Git-Fixture (T002827)

- [ ] Header: `# Prüfmodus: Output-Verifikation (run + $status/$output) [T002448-M4]`.
- [ ] `setup()`: Temp-Repo (`git init -b main`), Basis-Commit; zweites bare Repo als
      `origin` mit main-Stand, der „stale"-Scopes trägt (z.B. `chore(ci-cd): x`,
      `chore(mcp-gateway): y` — Scopes, die T002328 konsolidiert hat); Feature-Branch mit
      eigenem gültigen Commit; `origin/main`-Ref des Temp-Repos auf den VOR-Rebase-Stand
      zeigen lassen (stale Ref-Simulation).
- [ ] `@test`-Fälle:
      - `neuer Branch (REMOTE_SHA=Nullen) enthält nur die eigenen Commits` — Helfer mit
        Nullen-REMOTE_SHA; Ausgabe == eigene Commits; Positiv-Anker: Liste ist nicht leer.
      - `nach Rebase auf main enthält der Range keine main-Commits` — Rebase-Fixture;
        Helfer-Ausgabe enthält keinen der main-Subjects (grep -qF schlägt fehl) UND
        enthält den eigenen Commit.
      - `stale origin/main-Ref zieht keine fremden Commits in den Range` — origin/main
        älter als rebased main; `--not REMOTE_SHA` schließt die rebased main-Commits aus.
      - `scope-fremder eigener Commit bleibt im Range` — eigener Commit mit ungültigem
        Scope; Helfer-Ausgabe enthält ihn (Anker: der Validator MUSS ihn ablehnen — im
        selben Test via `validate-commit-msg.sh range` auf die Helfer-Ausgabe).
      - `Usage-Fehler: nicht auflösbare SHA → rc=2`.
- [ ] `SCRIPT="$REPO_ROOT/scripts/pre-push-scope-range.sh"` über `git rev-parse
      --show-toplevel` des Aufruf-Repos auflösen (Test läuft im Temp-Repo-cwd).

## File `tests/spec/ci-cd/cluster-bats-registry.bats` (net-new)

### Task P7.2 — Registry-Parität (T002922)

- [ ] Header: Output-Verifikation + Begründung: CI hat keinen Cluster — geprüft wird die
      Detection/Registry des neuen Skripts, nicht der Cluster selbst (T002820-Verfügbarkeits-
      Guard: der echte Cluster-Lauf ist der CI-Job P2.2).
- [ ] `@test "ci-cluster-bats.mjs list liefert jede Datei mit Cluster-Marker"` — iteriert
      den Marker-Scan (`grep -rlE 'cluster_running|kubectl|--context|k3d-' tests/spec/`)
      und prüft je Datei `grep -qxF` in der `list`-Ausgabe; Positiv-Anker: die Liste ist
      nicht leer (≥ 2 Dateien, Stand design.md: 11).
- [ ] `@test "keine Registry-Datei verliert ihren Cluster-Bezug"` — jede Datei in `list`
      existiert und trägt einen Marker (Rückrichtung; verhindert stille Registry-Schrumpfung).
- [ ] `@test "--check-registry exitet 0 bei synchroner Registry"` — Aufruf über
      `bash scripts/ci-cluster-bats.mjs --check-registry`; Positiv-Anker rc=0.
- [ ] Verfügbarkeits-Guard: `command -v node >/dev/null 2>&1 || skip "node not installed"`.

## File `tests/spec/ci-cd/test-changed-relevance.bats` (net-new)

### Task P7.3 — Relevanz-Entscheidung als pure Funktion (T003138)

- [ ] Header: Output-Verifikation (Funktionen sourcen, Exit-Codes prüfen).
- [ ] `setup()`: `source "$REPO_ROOT/scripts/test-changed.sh"` (nach P3.1).
- [ ] `@test`-Fälle (Pfadlisten als Here-Strings):
      - `openspec/-Pfade sind für korczewski nie relevant` — Liste
        `openspec/specs/website-core.md` + `openspec/changes/foo/specs/korczewski-core.md`:
        `test_changed_relevant "$list" korczewski` rc != 0; Positiv-Anker im selben Test:
        dieselbe Liste ohne `openspec/`-Eintrag (nur `brett/x-korczewski-file.ts`) → rc 0.
      - `generierte Artefakte sind nie relevant` — Liste mit
        `website/src/data/openspec-status.json` → rc != 0.
      - `echte Website-Pfade bleiben relevant` — `website/src/pages/x.astro` für Domäne
        `website` → rc 0 (Bestandsverhalten, kein Regression).
      - `test_changed_reachable: toter Port → rc != 0, offener Port → rc 0` — Probe gegen
        `127.0.0.1` mit einem garantiert toten Port (z.B. 1) und einem in `setup()` per
        `python3 -m http.server` gestarteten lokalen Port (teardown killt den Prozess;
        `command -v python3 || skip`).

## File `tests/spec/ci-cd/archive-freshness-commit.bats` (net-new)

### Task P7.4 — Archive staged das Status-Artefakt (T003136)

- [ ] Header: Output-Verifikation; Fixture-basiert (kein Zugriff auf die echte
      openspec/-Struktur).
- [ ] `setup()`: Temp-Repo mit `openspec/changes/<fixture>/proposal.md` +
      `specs/ci-cd.md` (Mini-Delta), `website/src/data/openspec-status.json` (Basisstand),
      `OPENSPEC_ROOT="$REPO/openspec"` und `TICKET_OFFLINE=1` exportieren.
- [ ] `@test "archive staged website/src/data/openspec-status.json"`:
      `run bash scripts/openspec.sh archive <fixture> --no-merge` (rc 0); danach
      `git diff --cached --name-only` ODER `git status --short` enthält
      `website/src/data/openspec-status.json`; Positiv-Anker: das Change-Verzeichnis liegt
      unter `openspec/changes/archive/`.
- [ ] `@test "archive ohne Status-Map-Änderung bricht nicht"` — Fixture ohne
      status-relevante Struktur; rc 0, kein `git add`-Fehler (Guard P4.1: Datei existiert).
- [ ] `@test "Skill nennt das Status-Artefakt im Archive-Commit"` —
      `grep -qF "openspec-status.json" .opencode/skills/openspec-archive-change/SKILL.md`
      (dokumentierte Grep-Ausnahme: Prüfobjekt ist Doku-Konvention).

## File `tests/spec/ci-cd/devflow-ci-watch-empty-guard.bats` (net-new)

### Task P7.5 — Empty-Verdict über die gemeinsame Funktion (T003109)

- [ ] Header: Output-Verifikation; Fake-`gh`-Muster aus
      `devflow-ci-watch-merged-exit.bats` übernehmen (Marker-Dateien statt Quelltext-Grep).
- [ ] `setup()`: Fake-`gh`-Skript, das `pr checks --json name,state` mit `[]` beantwortet
      und `pr view`-Felder leer/MERGEABLE liefert; Fake-`scripts/ticket.sh`
      (`assert-phase-chain` → rc 0); Mini-Git-Repo für `git rev-parse HEAD`.
- [ ] `@test "leere Check-Liste → Exit 5 mit sichtbarer Meldung"` — `run bash
      scripts/devflow-ci-watch.sh T009999 https://…/pull/1`; rc 5; `$output` enthält
      `Keine CI-Checks`; Positiv-Anker: Marker-Datei zeigt, dass `ci_checks_verdict`-Pfad
      erreicht wurde (Fake-`gh`-Log enthält `--json name,state`).
- [ ] `@test "nichtleere grüne Liste → Exit 0"` — Fake liefert `[{"name":"x","state":"SUCCESS"}]`;
      rc 0; `assert-phase-chain` wurde aufgerufen (Marker).

## File `tests/spec/batch-ci-check-evaluation.bats` (net-new)

### Task P7.6 — Batch-Aggregat: Anker-Parität über alle Fixes

- [ ] Header: dokumentierte Grep-Ausnahme (Prüfobjekt sind Doku-/Registry-Konventionen,
      T002448-M4-Ausnahme) + Begründung: das Aggregat sichert, dass jeder Fix einen
      maschinell prüfbaren Anker hat.
- [ ] `@test "jeder Fix hat einen Test-Anker in tests/spec/ci-cd/"` — Schleife über die
      Ticket-Nummern `T002815 T002827 T002922 T003109 T003136 T003138`; je Ticket
      `grep -rlF "$ticket" tests/spec/ci-cd/ tests/spec/batch-ci-check-evaluation.bats`
      liefert ≥ 1 Treffer; Positiv-Anker: 6 erwartete Tickets, alle gefunden.
- [ ] `@test "git-workflow-Skills beider Harnesses tragen die Commit-Verifikation"` —
      `grep -qF "T002815"` in `.claude/skills/git-workflow/SKILL.md` UND
      `.agents/skills/git-workflow/SKILL.md`; `grep -qF "git log -1 --oneline"` in beiden
      (Parität der zwei Harnesses).
- [ ] `@test "Cluster-Job existiert in ci.yml"` — `grep -qF "cluster-spec-shard"
      .github/workflows/ci.yml`; Positiv-Anker: Job-Name kommt genau einmal vor
      (`grep -cF` == 1).

### Task P7.7 — Failing-Tests zuerst (RED) + Inventar

- [ ] Die sechs Dateien werden VOR der Implementierung von p1–p6 geschrieben und
      eingecheckt. Roter Lauf:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/ tests/spec/batch-ci-check-evaluation.bats
# expected: FAIL — pre-push-scope-guard.bats: scripts/pre-push-scope-range.sh existiert
# noch nicht; cluster-bats-registry.bats: scripts/ci-cluster-bats.mjs fehlt;
# test-changed-relevance.bats: scripts/test-changed.sh fehlt; archive-freshness-commit.bats:
# cmd_archive staged das Artefakt nicht; devflow-ci-watch-empty-guard.bats: Verdict kommt
# nicht aus ci_checks_verdict; batch-ci-check-evaluation.bats: Anker fehlen bis p1–p6.
```

- [ ] Nach GREEN (p1–p6 umgesetzt): derselbe Runner-Aufruf ist grün; zusätzlich
      `task test:inventory` regenerieren und `website/src/data/test-inventory.json`
      mitcommitten (CI-Inventar-Check failt sonst).
