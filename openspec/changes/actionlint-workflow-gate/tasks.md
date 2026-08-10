---
title: actionlint-workflow-gate
ticket_id: T003008
domains: [ci-cd, scripts]
status: plan_staged
---

# actionlint-workflow-gate — Implementation Plan

## File Structure

| Datei | Art | Rolle |
|---|---|---|
| `tests/spec/ci-cd/actionlint-workflow-gate.bats` | vorhanden (RED, in dieser Branch bereits committet) | 7 Guards; muss am Ende grün sein |
| `scripts/lint-workflows.sh` | NEU | einziger Einstiegspunkt für den Lint (lokal wie CI) |
| `.github/actionlint.yaml` | NEU | deklariert das self-hosted-Label `fleet-gpu` |
| `.github/workflows/ci.yml` | ändern | actionlint gepinnt installieren + Lint-Schritt im Job `BATS Unit + Quality Gates` |
| `Taskfile.yml` | ändern | Target `lint:workflows`; Selektionszweig für `.github/workflows/` in `test:changed` |
| `openspec/specs/ci-cd.md` | wird beim Archivieren gemerged | Delta liegt in `openspec/changes/actionlint-workflow-gate/specs/ci-cd.md` |

**Zeilenbudgets (S1):** `docs/code-quality/gates.yaml` → `s1.limits` führt **keine** Einträge
für `.yml`, `.yaml` oder `.bats`. `Taskfile.yml` und `.github/workflows/ci.yml` unterliegen
damit nicht dem S1-Ratchet; beide sind auch nicht in `docs/code-quality/baseline.json`
gebaselinet. Für die neue Datei `scripts/lint-workflows.sh` gilt das statische
`.sh`-Limit — sie wird deutlich darunter geschnitten (Zielgröße < 80 Zeilen).

**S4 (Orphan-Guard):** `scripts/lint-workflows.sh` wird sowohl vom Taskfile-Target
`lint:workflows` als auch von `.github/workflows/ci.yml` aufgerufen und ist damit erreichbar.

<!-- vitest: kein neuer Test nötig, weil weder `website/src/lib/**` noch
     `website/src/pages/api/**` berührt wird — die Änderung betrifft ausschließlich
     CI-Verdrahtung, ein Shell-Skript und das Taskfile. -->

---

## Task 1 — Roten Zustand reproduzieren

Der Guard liegt bereits in der Branch und ist rot. Vor jeder Implementierungszeile den
Ausgangszustand bestätigen, damit später belegbar ist, dass die Änderung ihn gedreht hat.

```bash
# actionlint gepinnt bereitstellen (dieselbe Version wie später in CI)
curl -sSfL https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz \
  | tar -xz -C /tmp actionlint && install -m 0755 /tmp/actionlint ~/.local/bin/actionlint
actionlint --version   # muss 1.7.7 melden

tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/actionlint-workflow-gate.bats
# expected: FAIL — alle 7 Tests rot (scripts/lint-workflows.sh fehlt,
# task-Target lint:workflows unbekannt, ci.yml erwähnt actionlint nicht)
```

Zusätzlich die Skip-Richtung prüfen — der Verfügbarkeits-Guard muss ohne Binary sauber
überspringen statt einen Implementierungsfehler vorzutäuschen:

```bash
env PATH=/usr/bin:/bin tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/actionlint-workflow-gate.bats
# expected: FAIL — die drei binary-unabhängigen Guards bleiben rot,
# die vier actionlint-abhängigen melden "skip actionlint binary not installed"
```

Syntaxprüfung für `.bats` läuft über `--count`, nicht über `bash -n`
(`@test "…" { … }` ist keine gültige Bash-Syntax):

```bash
tests/unit/lib/bats-core/bin/bats --count tests/spec/ci-cd/actionlint-workflow-gate.bats   # → 7
```

---

## Task 2 — `.github/actionlint.yaml` anlegen

Das self-hosted-Label `fleet-gpu` deklarieren, statt die `runner-label`-Regel abzuschalten —
ein echter Tippfehler in einem Label soll weiterhin auffallen.

```yaml
self-hosted-runner:
  labels:
    - fleet-gpu
```

Betroffene Workflows, die dieses Label tragen: `.github/workflows/arbitration.yml` und
`.github/workflows/opencode.yml` (`runs-on: [self-hosted, fleet-gpu]`).

Prüfen:

```bash
actionlint -shellcheck= -pyflakes= -oneline | grep -c 'runner-label'   # → 0
```

---

## Task 3 — `scripts/lint-workflows.sh` schreiben

Ein Einstiegspunkt für lokal und CI, damit beide Seiten dieselbe Regelmenge prüfen.
Anforderungen an das Skript:

- `set -euo pipefail`, Ausführbit gesetzt (`chmod +x`).
- Version zentral als Konstante `ACTIONLINT_VERSION=1.7.7` im Skript.
- Lint-Aufruf mit abgeschalteten Sub-Lintern: `actionlint -shellcheck= -pyflakes= -color`.
  Begründung siehe `proposal.md` — die stehende Anforderung „Kein yamllint/shellcheck/
  kubeconform in CI" in `openspec/specs/ci-cd.md` bleibt damit unverletzt, und die 22
  gemessenen shellcheck-Stilbefunde werden nicht zu Merge-Blockern.
- Konfiguration wird nicht per Flag übergeben: actionlint liest `.github/actionlint.yaml`
  relativ zur Git-Wurzel des aktuellen Verzeichnisses. Das Skript darf also **nicht** auf
  die Repo-Wurzel `cd`-en — der BATS-Guard ruft es aus Fixture-Repos heraus auf und erwartet,
  dass dort deren eigene Workflows geprüft werden.
- Fehlt das Binary: Exit ungleich 0 **mit** dem vollständigen curl-Installationsbefehl in der
  Ausgabe. Kein stiller Skip — das ist die gitleaks-Falle aus T002506/T002554.
- Setzt der Aufrufer `ACTIONLINT_AUTO_INSTALL=1` (CI tut das nicht; der Schritt installiert
  explizit), lädt das Skript die gepinnte Version nach `${XDG_CACHE_HOME:-$HOME/.cache}/actionlint/<version>/`
  und verwendet sie von dort.
- Exit-Code von actionlint unverändert durchreichen.

Verifizieren (beide Richtungen, wie im Guard):

```bash
bash scripts/lint-workflows.sh; echo "exit=$?"       # → 0 auf dem aktuellen Stand
env PATH=/usr/bin:/bin bash scripts/lint-workflows.sh; echo "exit=$?"   # → ungleich 0, mit Installationshinweis
```

---

## Task 4 — Taskfile: Target `lint:workflows` und Selektion in `test:changed`

In `Taskfile.yml`:

1. Neues Target:

   ```yaml
   lint:workflows:
     desc: "Lint aller GitHub-Actions-Workflows mit gepinntem actionlint (Kontexte, Action-Inputs, Runner-Labels)"
     cmds:
       - bash scripts/lint-workflows.sh
   ```

2. In `test:changed` einen Selektionszweig ergänzen, damit eine reine Workflow-Änderung
   den Lint erreicht. Ohne ihn setzt eine Änderung an `.github/workflows/**` **keine**
   der bestehenden `RUN_*`-Flaggen und liefe ungeprüft durch:

   ```bash
   echo "$CHANGED" | grep -qE "^\.github/workflows/" && RUN_WORKFLOWS=true || true
   ```

   und weiter unten, in der Reihenfolge der übrigen Zweige:

   ```bash
   if [ "$RUN_WORKFLOWS" = "true" ]; then echo "→ workflow changes: task lint:workflows"; task lint:workflows; fi
   ```

   `RUN_WORKFLOWS=false` in der Initialisierungszeile der `RUN_*`-Variablen mit aufnehmen.

Prüfen — Semantik statt Darstellung (T002716), der Exit-Code der Auflösung ist das Signal,
nicht das Format von `task --list`:

```bash
task --summary lint:workflows >/dev/null 2>&1; echo "exit=$?"   # → 0
task --list >/dev/null 2>&1; echo "exit=$?"                     # → 0 (kein toter includes:-Pfad)
```

---

## Task 5 — CI-Verdrahtung in `.github/workflows/ci.yml`

Im Job `test-bats` (`name: BATS Unit + Quality Gates`) zwei Schritte ergänzen, platziert
direkt neben „Code-quality gates (always)" — also ohne `if:`, damit der Lint auch bei
`push`- und `schedule`-Läufen greift und nicht nur bei `pull_request`:

```yaml
      - name: Install actionlint (pinned)
        run: |
          curl -sSfL https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz \
            | tar -xz -C /tmp actionlint
          sudo install -m 0755 /tmp/actionlint /usr/local/bin/actionlint
          actionlint --version

      - name: Workflow lint (always)
        run: bash scripts/lint-workflows.sh
```

Die Version steht damit an zwei Stellen (Skript-Konstante und CI-Schritt). Der Guard
`T003008: actionlint ist in CI auf eine Version gepinnt` prüft nur, dass die CI-Zeile
überhaupt eine `x.y.z`-Version trägt — ein Gleichlauf-Guard über beide Stellen ist
bewusst nicht Teil dieses Changes: er wäre eine zweite Mechanik für ein Problem, das
beim nächsten Versionswechsel ohnehin in einem Diff sichtbar wird.

Selbstbezug beachten: `ci.yml` wird durch diese Änderung selbst geändert und damit vom
eigenen Lint erfasst. Nach dem Edit erneut messen:

```bash
bash scripts/lint-workflows.sh; echo "exit=$?"   # → 0, auch für die neu eingefügten Schritte
```

---

## Task 6 — Guard grün fahren und beide Richtungen belegen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/actionlint-workflow-gate.bats
# erwartet: 7 ok

env PATH=/usr/bin:/bin tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/actionlint-workflow-gate.bats
# erwartet: 3 ok + 4 skip ("actionlint binary not installed") — kein Fehlschlag
```

Beide Formen der Spec-Konvention miterfassen (T002696) — Sammeldatei *und* Verzeichnis:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
```

---

## Task 7 — Abschluss-Verifikation

```bash
task test:inventory        # neue Testdatei ins Inventar aufnehmen
task test:changed          # gezielte Tests für die geänderten Domains
task freshness:regenerate  # generierte Artefakte aktualisieren
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4) + Baseline-Assertion
task openspec:validate     # Delta-Spec gegen das OpenSpec-Schema
```

`website/src/data/test-inventory.json` mit committen — der CI-Inventar-Check vergleicht die
regenerierte Datei gegen die committete Version und schlägt sonst fehl.
