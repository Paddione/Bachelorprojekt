## p5 — T003982: SDLC-Stack aus dem Deploy-Routing ausschließen

**Rolle:** impl · **depends_on:** — · **target_files:**
`scripts/devflow-post-merge-deploy.sh`, `.claude/skills/references/deploy-routing.md`

### Ziel

`devflow-post-merge-deploy.sh` routet Änderungen am rein lokalen SDLC-Stack
(`k3d/sdlc-stack/**`) über `DEPLOY_K8S=true` auf `task feature:deploy` gegen fleet — dort
existiert der Stack nicht (User-Entscheidung T003982: ausschließen, kein Auto-Deploy). Der
Ausschluss läuft als vorgeschalteter Filter auf `$CHANGED`, weil `grep -E` kein Lookahead hat
(Design D3); die Routing-SSOT `deploy-routing.md` wird um den Ausschluss ergänzt.

### S1-Budget (gates.yaml, Stand 2026-08-14)

| Datei | Ist (wc -l) | Budget (effektiv) |
|---|---|---|
| `scripts/devflow-post-merge-deploy.sh` | 97 | 703 |
| `.claude/skills/references/deploy-routing.md` | 71 | n/a — .md nicht S1-gated |

`scripts/devflow-post-merge-deploy.sh`: `.sh`-Limit 800, nicht-baselined → Schwelle 800,
Budget 800 − 97 = 703. Die Änderung (Filter + Kommentar, ~3 Zeilen) bleibt weit darunter;
kein Split nötig. `deploy-routing.md`: `.md` hat kein S1-Limit und keine Baseline (ungated).

### Testanordnung (Spezifikation für p6 — Testdatei legt p6 an)

Die Testdatei `tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats`
(p6) testet das Skript **ohne echten `task`-Aufruf** — es gibt keinen reinen Routing-Modus im
Skript, daher werden alle externen Aufrufe in einem Wegwerf-Fixture gestubbt (Muster:
`tests/spec/batch-repo-hygiene-ops-fixes.bats`):

- **Git-Fixture:** `git init`-Repo im BATS-TMPDIR, ein Commit mit Subject
  `[T004295] fixture` und den gewünschten Dateien; danach
  `git update-ref refs/remotes/origin/main HEAD` (origin/main-Ref ohne Remote). Das Skript
  läuft mit `cwd = Fixture-Repo`, damit `git log origin/main`, `git show` und
  `git diff-tree` (Zeilen 26/32/38) real auflösen. Wichtig: der Fixture-Commit enthält nur
  die Routing-Test-Dateien; die Stub-Dateien liegen als **untracked** Arbeitsbaum-Einträge im
  Repo (`git diff-tree` liest nur den Commit).
- **Stubs im Fixture-Repo (`scripts/`, untracked):** `filter-generated.sh` (Stub: `cat;
  exit 0` — Pass-through, der echte Filter ist in eigenen Tests abgedeckt; cwd-relativer
  Aufruf Zeile 38), `ticket.sh` (Stub: `echo "ticket.sh: $*"; exit 0` — cwd-relativer Aufruf
  Zeilen 84/88), `devflow-post-merge-ticket-closure.sh` (Stub: `exit 0` — BASH_SOURCE-
  relativer Aufruf Zeile 96 löst über die Kopie auf). Die zu testende
  `devflow-post-merge-deploy.sh` wird **in das Fixture-Repo kopiert** (Post-Fix-Stand), damit
  alle relativen Aufrufe hermetisch bleiben.
- **`task`-PATH-Stub (`bin/task`, vor PATH):** `echo "task called: $*"; exit 0` — der einzige
  Indikator dafür, ob `task feature:deploy` (Zeile 80) ausgelöst wurde. Lauf:
  `cd "$fixture" && PATH="$bin:$PATH" bash scripts/devflow-post-merge-deploy.sh T004295`.

Drei Fälle, Reihenfolge nach T002356-M1 (erst Positiv-Anker, dann Negativ-Aussage),
durchgehend Output-Verifikation (T002448-M4) auf `$status`/`$output`:

1. **Positiv-Anker:** CHANGED = nur `k3d/websocket.yaml` → `$status == 0`, `$output` enthält
   `Deploye K8s-Manifeste` und `task called: feature:deploy`. Dieser Fall beweist, dass
   Harness + Stubs funktionieren — er ist auch gegen das ungefixte Skript grün.
2. **Negativ:** CHANGED = nur `k3d/sdlc-stack/*` (z. B. `k3d/sdlc-stack/sdlc-console.yaml`,
   `k3d/sdlc-stack/kustomization.yaml`) → `$status == 0`, `$output` enthält
   `Keine bekannten Deploy-Trigger` (Zeile 53), enthält **nicht** `task called:` und nicht den
   Pfad `k3d/sdlc-stack` (die "Geänderte Dateien"-Liste Zeile 54 zeigt den gefilterten
   `$CHANGED`). Gegen das ungefixte Skript **rot**: `^k3d/` matcht den sdlc-stack-Pfad →
   `DEPLOY_K8S=true` → task-Stub wird gerufen.
3. **Regression (gemischt):** CHANGED = `k3d/websocket.yaml` + `k3d/sdlc-stack/sdlc-console.yaml`
   → `$status == 0`, `task called: feature:deploy` erscheint, aber `k3d/sdlc-stack` nicht in
   der Geänderte-Dateien-Liste — der Filter entfernt nur sdlc-stack-Pfade, nie andere k3d-Pfade.

### Task 1: Filter in `scripts/devflow-post-merge-deploy.sh` einbauen (≤ 1h)

- [ ] **RED-Referenz (Testdatei aus p6):** `deploy-route-sdlc-exclusion.bats` gegen das noch
      ungefixte Skript laufen lassen und das Rot belegen:

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats
      # expected: FAIL — sdlc-only-CHANGED routet aktuell auf task feature:deploy (Befund T003982)
      ```

      Scheitert der Lauf, weil die Testdatei aus dem p6-Partial noch nicht vorliegt, das
      Rot-Dokument auf Fall 2 der Testanordnung stützen (manueller Lauf, siehe Smoke-Check
      unten) und mit dem p6-Partial koordinieren.
- [ ] **Implementierung:** Die `$CHANGED`-Pipeline (Zeile 38) um einen vorgeschalteten
      sdlc-stack-Filter ergänzen — `sed` liefert als einziger der Kandidaten (vs. `grep -v`)
      immer Exit 0 und ist im `set -u`-Skript ohne `set -e`/pipefail die gefahrlose Wahl;
      oberhalb der Pipeline (nach dem T002255-Kommentarblock, Zeilen 34–37) einen T003982-
      Kommentar ergänzen:

      ```bash
      # T003982: k3d/sdlc-stack/ existiert nur auf dem lokalen k3d-Dev-Cluster, nicht auf
      # fleet. grep -E hat kein Lookahead, deshalb VOR dem DEPLOY_K8S-Match (Zeile 48) filtern.
      CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT" \
        | bash scripts/filter-generated.sh | sed '/^k3d\/sdlc-stack\//d')
      ```

      Keine Änderung an den Routing-Regex-Zeilen 45–49 und an `scripts/filter-generated.sh`
      (der bleibt auf linguist-generated beschränkt).
- [ ] **Smoke-Check der Filter-Semantik** (kein echten task-Aufruf):

      ```bash
      bash -n scripts/devflow-post-merge-deploy.sh
      printf '%s\n' 'k3d/sdlc-stack/sdlc-console.yaml' | sed '/^k3d\/sdlc-stack\//d' | grep -q . \
        && echo "UNERWARTET: sdlc-stack-Pfad ueberlebt den Filter" \
        || echo "OK: sdlc-stack-Pfad gefiltert"
      printf '%s\n' 'k3d/websocket.yaml' | sed '/^k3d\/sdlc-stack\//d' | grep -q . \
        && echo "OK: k3d/websocket.yaml bleibt fuer den K8s-Match" \
        || echo "UNERWARTET: k3d/websocket.yaml gefiltert"
      ```

### Task 2: Routing-SSOT `.claude/skills/references/deploy-routing.md` ergänzen (≤ 0,5h)

- [ ] **Prod-Deploy-Tabelle** (Zeilen 24–31): Zeile `k3d/sdlc-stack/**` ergänzen — kein
      Deploy, rein lokaler Stack:

      ```
      | `k3d/sdlc-stack/**` | **kein Deploy** — rein lokaler Stack (k3d-Dev-Cluster), existiert nicht auf fleet; wird vor dem `k3d/**`-Match aus `$CHANGED` gefiltert (T003982) |
      ```

- [ ] **Hinweis-Blockquote** analog zum T002255-Block (nach Zeile 20) ergänzen, damit die
      Ausnahme als eigene Regel sichtbar ist:

      ```
      > **SDLC-Stack löst kein Prod-Deploy aus (T003982).** `k3d/sdlc-stack/**` wird vor der
      > Selektion aus `$CHANGED` entfernt — der Stack existiert nur auf dem lokalen k3d-Dev-
      > Cluster. `grep -E` kann kein Lookahead, deshalb läuft der Ausschluss als vorgeschalteter
      > `sed`-Filter in `scripts/devflow-post-merge-deploy.sh`.
      ```

- [ ] **Auto-Detection-Code-Block** (Zeilen 34–41) an das Skript angleichen — die
      `CHANGED`-Zeile um den `sed`-Filter erweitern, damit das SSOT-Beispiel ausführbar mit
      dem Skript übereinstimmt:

      ```bash
      CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT" | bash scripts/filter-generated.sh | sed '/^k3d\/sdlc-stack\//d')
      ```

### Task 3: Grün-Phase & Verifikation (≤ 0,5h)

- [ ] **Grün:** `deploy-route-sdlc-exclusion.bats` (p6) gegen das gefixte Skript — alle drei
      Fälle grün:

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/deploy-route-sdlc-exclusion.bats
      # expected: PASS — Fälle 1–3 der Testanordnung sind gruen
      ```

- [ ] `bash -n scripts/devflow-post-merge-deploy.sh` — Syntax sauber.
- [ ] Kein neues Test-Inventar nötig (die BATS-Datei legt p6 an und regeneriert
      `website/src/data/test-inventory.json`); hier nur sicherstellen, dass der eigene Stand
      grün ist: `task test:changed`
- [ ] Batch-Final-Gates (laufen verbindlich in tasks.md Task 7, hier als Teilprüfung):
      `task freshness:regenerate` und `task freshness:check`
