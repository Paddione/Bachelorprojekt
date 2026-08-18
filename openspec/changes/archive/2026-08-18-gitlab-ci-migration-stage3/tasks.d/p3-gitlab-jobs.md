# p3 — Sieben GitLab-Jobs

**target_files:** `.gitlab-ci.yml`
**depends_on:** p1 (ruft `scripts/ci-diff-base.sh` auf)

## Warum

`.github/workflows/ci.yml` definiert zehn Offline-Gate-Jobs, `.gitlab-ci.yml` drei. Ein
Umschalten auf den heutigen Stand wuerde sieben Gates ersatzlos abschalten — also die
Abdeckung verkleinern statt sie zu verlagern.

## Gemeinsame Struktur zuerst

- [ ] `stages` um `lint` und `quality` erweitern; `test` bleibt fuer die bestehenden drei
      Jobs, damit deren Definition unangetastet bleibt.

- [ ] YAML-Anker fuer die wiederkehrenden Teile anlegen, statt sie je Job zu wiederholen:

  ```yaml
  .node_toolchain: &node_toolchain
    image: node:22
    tags: [$CI_RUNNER_TAG]
    interruptible: true

  .scoped_rules: &scoped_rules
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_COMMIT_BRANCH =~ /^(feature|fix|chore)\//
  ```

  `interruptible: true` auf **allen** neuen Jobs: bei mehreren Pushes hintereinander bricht
  GitLab die ueberholte Pipeline ab, statt den Runner mit veralteten Staenden zu belegen.

- [ ] Diff-Basis einheitlich aufloesen. Jeder diff-skopierte Job beginnt mit demselben Block —
      und wertet **beide** Fehler-Codes getrennt aus:

  ```bash
  set -uo pipefail
  git fetch --no-tags --depth=50 origin +main:refs/remotes/origin/main || true
  BASE="$(bash scripts/ci-diff-base.sh)"; rc=$?
  case "$rc" in
    0) echo "Diff-Basis: $BASE" ;;
    3) echo "Keine Diff-Basis (main-Push) — volle Menge"; BASE="" ;;
    *) echo "ERROR: Diff-Basis nicht aufloesbar (rc=$rc)"; exit 1 ;;
  esac
  ```

  Der `*`-Zweig ist der Punkt der Uebung: Waere er mit `3` zusammengefasst, liefe ein Job mit
  kaputter Umgebung als „volle Menge" durch — oder, schlimmer, als leere Auswahl gruen.

## Die sieben Jobs

- [ ] **`factory-openspec`** (stage `test`, `<<: *node_toolchain`) — `npm ci`, dann
      `npm run test:openspec`. Gegenstueck zu `test-factory-openspec`.

- [ ] **`factory-shard`** (stage `test`) — `parallel: 4`. GitLab setzt `CI_NODE_INDEX`
      (1-basiert) und `CI_NODE_TOTAL`; beide werden auf die vom Repo erwarteten Namen
      abgebildet: `SPEC_SHARD=$CI_NODE_INDEX`, `SPEC_SHARDS=$CI_NODE_TOTAL`. `Taskfile.yml`
      wertet diese ab Zeile 789 bereits aus — an `scripts/spec-shard.sh` aendert sich nichts.
      Toolchain: node 22, pnpm 10, Go (fuer den `mcp-task-runner`-Build, den `test:spec`
      braucht), das `task`-Binary.
      **Kein Aggregator-Job.** `test-factory` existiert auf GitHub nur, weil ein
      *uebersprungener* Required Check in der Branch Protection als bestanden zaehlt. GitLab
      kennt diese Semantik nicht; den Job zu spiegeln hiesse, eine Plattform-Eigenheit
      nachzubauen statt ihrer Wirkung.

- [ ] **`gitleaks` erweitern** (bestehender Job) um die drei fehlenden `security-scan`-Schritte.
      Reihenfolge und Fehlerverhalten wie auf GitHub: Image-Pinning **advisory** (meldet
      `:latest`, scheitert nicht), git-crypt-Guard **fail-closed**
      (`bash scripts/git-crypt-guard.sh check-tracked`), gitleaks **fail-closed** (unveraendert),
      Trivy **advisory** (`bash scripts/trivy-scan.sh --json`, Befund wird ausgegeben, nicht
      erzwungen). Den Job auf `security` umbenennen waere ehrlicher, bricht aber die
      Fundstelle, gegen die `gitlab-tool-parity.bats` heute prueft — der Name bleibt, der
      Kommentarkopf nennt den erweiterten Umfang.

- [ ] **`brett-typescript`** (stage `test`, `image: node:24`) —
      `npm ci --prefix components/brett`, dann `typecheck`, `test` (mit `MOCK_DB=true`) und
      `build`. Node **24**, nicht 22: das ist die Version des GitHub-Gegenstuecks, und
      Werkzeug-Paritaet ist der Zweck der Uebung.

- [ ] **`vitest-website`** (stage `test`, `image: node:24`) — pnpm 10 via `corepack`,
      `pnpm install --frozen-lockfile` in `components/website`, dann `vitest --changed
      "$BASE"`. Auf `main` (Exit 3, `BASE` leer) laeuft stattdessen die volle Suite — sonst
      waere der Job auf dem Spiegel-Push dauerhaft ein Leerlauf. Diese Umkehr ist bewusst:
      genau hier wuerde ein „gruen, weil nichts ausgewaehlt" am wenigsten auffallen.

- [ ] **`commit-lint`** (stage `lint`, `image: node:22`, `rules` nur fuer Branch- und
      MR-Pipelines, nicht fuer `main`) — validiert die Commit-Nachrichten im Range mit
      `scripts/validate-commit-msg.sh range` und `scripts/check-commit-vs-diff.sh`, also
      denselben Skripten wie Hook und GitHub-Job. Ist `CI_MERGE_REQUEST_TITLE` gesetzt, wird
      zusaetzlich der Titel gegen dieselbe Typ-Liste geprueft. Die PR-Titel-Pruefung von
      `amannn/action-semantic-pull-request` wird **nicht** nachgebaut: bei einer gespiegelten
      Branch-Pipeline gibt es keinen MR und damit keinen Titel.

- [ ] **`lighthouse`** (stage `quality`, `image: node:24`, `allow_failure: true`) — Website
      bauen, dann der Lighthouse-Lauf wie im GitHub-Job. `allow_failure` spiegelt das dortige
      Verhalten; ein Performance-Wert ist ein Signal, kein Merge-Kriterium.

## Was dieser Partial nicht tut

`.github/workflows/ci.yml` wird nicht angefasst — kein Job abgeschaltet, keine Bedingung
ergaenzt. Der Gate-Flip ist Etappe 4.

## Abnahme

```bash
python3 -c "import yaml; d=yaml.safe_load(open('.gitlab-ci.yml')); \
  jobs=[k for k in d if not k.startswith('.') and k not in ('stages','variables')]; \
  print('Jobs:', sorted(jobs)); print('Anzahl:', len(jobs)); assert len(jobs) >= 9, jobs"
```

Die Abnahme gibt die Job-Namen **und** die Anzahl aus. Eine Zusicherung nur auf die Anzahl
wuerde ein versehentlich doppelt benanntes Gegenstueck nicht bemerken.
