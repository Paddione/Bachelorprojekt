---
title: "post-merge-branch-reaper — Implementation Plan"
ticket_id: T002520
domains: [ci-cd, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-merge-branch-reaper — Implementation Plan

_Ticket: T002520_

## File Structure

```
scripts/branch-reaper.sh                     (neu)       Reaper-Logik, Dry-Run-faehig
tests/spec/ci-cd/branch-reaper.bats          (neu)       Output-verifizierende Tests gegen Fixture-Repo
.github/workflows/post-merge.yml             (geaendert) neuer Job reap-branches
.claude/skills/references/repo-hygiene-ops.md (geaendert) Verweis auf den manuellen Einstieg
website/src/data/test-inventory.json         (generiert) via task test:inventory
```

Zeilenbudgets: `scripts/branch-reaper.sh` ist neu, das `.sh`-Limit laut
`docs/code-quality/gates.yaml` ist 800 Zeilen — die erwarteten rund 180 Zeilen lassen reichlich
Reserve. `.github/workflows/post-merge.yml` (294 Zeilen, nicht gebaselined) unterliegt keinem
S1-Limit, weil `.yml` in `gates.yaml` unter `s1.limits` nicht geführt wird. Für
`tests/spec/ci-cd/branch-reaper.bats` gilt dasselbe, `.bats` ist ebenfalls ungelistet.

S4 (Orphan-Skripte) ist erfüllt: `scripts/branch-reaper.sh` wird vom neuen Workflow-Job
aufgerufen und in `.claude/skills/references/repo-hygiene-ops.md` §2 als manueller Einstieg
verlinkt.

## Task 1 — Failing Test: Fixture-Repo und Erwartungen (RED)

Lege `tests/spec/ci-cd/branch-reaper.bats` an. Der Header-Kommentar dokumentiert nach
Repo-Konvention den Prüfmodus: **command output verification** — geprüft wird, was
`scripts/branch-reaper.sh --dry-run` ausgibt, nicht welche Muster im Quelltext stehen.

`setup()` baut in `$BATS_TEST_TMPDIR` ein echtes Fixture-Git-Repo mit einem `main` und vier
Branches, dazu Stub-Executables für `gh` und `ticket.sh` in einem `$PATH`-Vorspann, damit der
Test ohne Netz und ohne Cluster läuft.

| Fixture-Branch | Ticket-Stub | PR-Stub | Abweichung zu main | Erwartung |
|---|---|---|---|---|
| `chore/plan-T009001` | `done` | keiner | `openspec/changes/x/tasks.md` | wird zum Löschen vorgeschlagen |
| `chore/src-T009002` | `done` | keiner | `scripts/echt.sh` | verschont, Grund genannt |
| `chore/openpr-T009003` | `done` | offener PR | nur Allowlist | verschont, Grund genannt |
| `chore/openticket-T009004` | `in_progress` | keiner | nur Allowlist | verschont, Grund genannt |

Die vier Tests entstehen in dieser Reihenfolge, damit die drei Negativ-Aussagen nicht vakuos
bestehen:

1. **Positiv-Anker zuerst.** `--dry-run --ticket T009001` gibt `chore/plan-T009001` als
   Löschkandidat aus. Läuft dieser Test rot, sind die folgenden drei bedeutungslos — deshalb
   steht er vorn.
2. `--dry-run --ticket T009002` schlägt den Branch **nicht** vor und nennt `scripts/echt.sh`
   als Grund.
3. `--dry-run --ticket T009003` schlägt den Branch **nicht** vor und nennt den offenen PR.
4. `--dry-run --ticket T009004` schlägt den Branch **nicht** vor und nennt den Ticket-Status.

Assertions greifen auf die jeweilige Ergebniszeile zu (`grep '^REAP '` bzw. `grep '^KEEP '`),
nicht auf den vollen `$output` — ein ungefiltertes Substring-Match würde bereits vom
Worktree-Pfad im Usage-Text erfüllt, der den Change-Slug enthält.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper.bats
# expected: FAIL (rot — scripts/branch-reaper.sh existiert noch nicht)
```

## Task 2 — scripts/branch-reaper.sh

Neues Skript mit `set -euo pipefail` und einem Kopfkommentar aus Zweck, Aufrufbeispiel und
Ticket-Referenz, im Stil von `scripts/devflow-post-merge-ticket-closure.sh`.

Argumente: `--ticket <T######>` (Pflicht), `--dry-run` (nur berichten), `--remote <name>`
(Vorgabe `origin`), `--repo <pfad>` (Vorgabe `$PWD`, damit der Test auf sein Fixture zeigen kann).

Ablauf:

1. Ticket-ID gegen `T[0-9]{6}` validieren und ablehnen, wenn sie nicht passt. Ohne diese Prüfung
   landet die ID als Regex in späteren Vergleichen — dasselbe Muster, das
   `devflow-post-merge-deploy.sh` bereits absichert.
2. Kandidaten aus `git ls-remote --heads <remote>` ziehen und auf Namen filtern, die die
   Ticket-ID case-insensitiv enthalten. `main` und der gerade gemergte Head sind ausgenommen.
3. Pro Kandidat der Reihe nach prüfen, beim ersten Ausschlussgrund abbrechen:
   - offener PR via `gh pr list --head "$b" --state open --json number`
   - Ticket-Status via `bash scripts/ticket.sh get --id "$tid"`; akzeptiert werden nur
     `done` und `archived`
   - Blob-Vergleich: `mb=$(git merge-base <remote>/main "$b")`, dann für jede Datei aus
     `git diff --name-only "$mb" "$b"` die Hashes `git rev-parse "$b:$f"` und
     `git rev-parse "<remote>/main:$f"` vergleichen. Nur Dateien mit ungleichem Hash gelten als
     abweichend, und jede davon muss die Allowlist treffen.
4. Allowlist als Array von Glob-Mustern am Dateikopf, damit sie ohne Logikänderung erweiterbar
   bleibt: `openspec/changes/*`, `docs/code-quality/*`, `website/src/data/*`,
   `.release-please-manifest.json`, `website/CHANGELOG.md`, `website/package.json`.
5. Ausgabe zeilenweise und maschinenlesbar: `REAP <branch>` für Kandidaten,
   `KEEP <branch> — <grund>` für alles andere. Diese beiden Präfixe sind der Vertrag, auf den
   die Tests aus Task 1 zugreifen.
6. Ohne `--dry-run` pro `REAP`-Zeile zuerst
   `git push <remote> <sha>:refs/tags/reaped/<branch>`, danach
   `git push <remote> --delete <branch>`. Schlägt der Tag-Push fehl, wird der Branch **nicht**
   gelöscht — das Sicherheitsnetz ist Vorbedingung, nicht Beiwerk.

Der Blob-Vergleich ist bewusst hash-basiert und nicht `git diff <commit> -- <pfad>`: Letzteres
vergleicht gegen den Arbeitsbaum und verwechselt einen git-Fehler mit einer Inhaltsänderung
(T002519). Ein Three-Dot-Diff wäre ebenso falsch, weil er gegen den Abzweigpunkt misst, der sich
beim Squash-Merge nicht verschiebt.

Nach diesem Task laufen die Tests aus Task 1 grün.

## Task 3 — Job `reap-branches` in post-merge.yml

Neuer Job im bestehenden Workflow:

- `needs: [mark-awaiting]` — bewusst **nicht** am Deploy-Pfad, damit ein Reaper-Fehler nie einen
  Deploy blockiert.
- `permissions: { contents: write }` **nur auf diesem Job**. Der Workflow steht global auf
  `contents: read`; die Erweiterung bleibt lokal, aus demselben Grund, den der Kommentar am Job
  `render-artifact` im selben File dokumentiert.
- `continue-on-error: true`, passend zum non-fatalen Verhalten der übrigen Post-Merge-Schritte.
- Schritte: Checkout mit `fetch-depth: 2`; Kubeconfig aus `secrets.FLEET_KUBECONFIG` schreiben
  (identisch zu den bestehenden Schritten, weil `ticket.sh` sie braucht); Ticket-ID aus
  `git log -1 --pretty=%B` extrahieren; bei leerer ID sauber mit 0 beenden; sonst
  `bash scripts/branch-reaper.sh --ticket "$TICKET_ID"` aufrufen und dessen Ausgabe zusätzlich
  nach `$GITHUB_STEP_SUMMARY` schreiben.
- `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`, damit die `gh`-Abfrage im Skript authentifiziert
  ist.

Ergänze in `.claude/skills/references/repo-hygiene-ops.md` §2 einen Verweis auf
`bash scripts/branch-reaper.sh --ticket <id> --dry-run` als manuellen Einstieg. Das erfüllt
zugleich S4.

## Task 4 — Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper.bats
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

`task test:inventory` läuft vor den drei Pflicht-Gates, weil die neue Testdatei sonst den
Inventar-Check in CI rot färbt. `website/src/data/test-inventory.json` wird mitcommittet.

Dazu der YAML-Sanity-Check auf den geänderten Workflow:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/post-merge.yml')); print('yaml ok')"
```
