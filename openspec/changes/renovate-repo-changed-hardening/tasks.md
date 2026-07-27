---
title: "renovate-repo-changed-hardening — Implementation Plan"
ticket_id: T002249
domains: [ci-cd, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# renovate-repo-changed-hardening — Implementation Plan

_Ticket: T002249_

Renovate bricht bei Base-Branch-Drift mit `result=repository-changed` ab — ohne Retry und
mit Exit-Code 0, weshalb zehn aufeinanderfolgende Runs auf `success` stehen, während seit
2026-06-17 kein einziger PR entstanden ist. Der Plan macht den Abbruch sichtbar, wiederholt
ihn bis zu dreimal und verkürzt per Cache die Lookup-Phase, die 127 der 157 Laufzeitsekunden
ausmacht. Root-Cause, Messwerte und verworfene Alternativen stehen in `design.md`.

Das S1-Zeilen-Gate greift für keine der geänderten Dateien: `.yml`, `.bats`, `.md` und
`.json5` stehen nicht in `s1.limits` (`docs/code-quality/gates.yaml`), und keine der Dateien
ist in `docs/code-quality/baseline.json` gebaselined.

## File Structure

| Datei | Änderung |
|---|---|
| `tests/spec/ci-cd.bats` | erweitert — vier `T002249-*`-Tests (RED, im Stage-Commit bereits erbracht) |
| `.github/workflows/renovate.yml` | umgebaut — `docker run` in Retry-Schleife, Cache-Steps, Digest-Pin |
| `openspec/changes/renovate-repo-changed-hardening/specs/ci-cd.md` | neu — Delta-Spec, drei Requirements |
| `website/src/data/test-inventory.json` | regeneriert — CI-Gate nach Test-Änderung |

---

## Task 1 — Failing-Test-Nachweis (RED)

- [ ] Ausgangszustand bestätigen. Bereits im Stage-Commit dieses Branches erbracht; vor
      Beginn der Implementierung erneut prüfen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002249"
# expected: FAIL — 4 von 4 rot
```

**expected: FAIL** — vier rote Tests (`T002249-A` bis `-D`), jeder mit seiner spezifischen
FAIL-Meldung, nicht mit einem Setup-Fehler. Sie kodieren den Implementierungsvertrag der
folgenden Tasks:

- `-A` Retry-Schleife plus Auswertung von `repository-changed`
- `-B` `exit 1` nach erschöpften Versuchen (fail-closed)
- `-C` `RENOVATE_REPOSITORY_CACHE=enabled`, `RENOVATE_CACHE_DIR`, `actions/cache`-Step
- `-D` digest-gepinntes Image **und** Entfernung von `renovatebot/github-action`

---

## Task 2 — Image-Digest ermitteln

- [ ] Digest frisch auflösen, statt den aus dem Log übernommenen Wert blind zu setzen.

Der Container erhält den GitHub-App-Installation-Token und fällt damit unter dieselbe
Supply-Chain-Regel wie die secret-tragenden Actions im selben Workflow.

```bash
docker buildx imagetools inspect ghcr.io/renovatebot/renovate:43 --format '{{.Manifest.Digest}}'
```

Fallback ohne buildx:

```bash
docker pull ghcr.io/renovatebot/renovate:43
docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/renovatebot/renovate:43
```

Referenzwert aus Run `30238038240` (2026-07-27) zum Abgleich:
`sha256:2a4e6df0330b0aa42b21f40589666b678bbd19bcd9a14c3c24ce0492c237c2ff`. Weicht der
aufgelöste Digest ab, gilt der frisch aufgelöste — der Tag `43` ist beweglich.

Die Referenz wird als `<tag>@sha256:<digest>` geschrieben, nicht als reiner Digest: nur mit
Tag erkennt Renovates eigener `docker`-Manager das Image als aktualisierbar und hält den Pin
künftig selbst frisch. Ein reiner Digest-Pin würde einfrieren.

---

## Task 3 — `renovatebot/github-action` durch `docker run` ersetzen

- [ ] Den Step `Self-hosted Renovate` in `.github/workflows/renovate.yml` ersetzen.

Die Action kapselt genau ein `docker run`; ein `uses:`-Step lässt sich nicht schleifen. Der
Aufruf wird deshalb ausgeschrieben. Vorlage ist das Kommando, das die Action in Run
`30238038240` erzeugt hat — inklusive des bereits vorhandenen `--volume /tmp:/tmp`, über das
Cache-Verzeichnis und Logs ohne zusätzlichen Mount host-seitig sichtbar sind.

```yaml
      - name: Restore Renovate cache
        uses: actions/cache@v6
        with:
          path: /tmp/renovate-cache
          # Rolling-Key: jeder Run schreibt einen neuen Eintrag, restore-keys
          # zieht den zuletzt geschriebenen. Ein statischer Key wuerde nach dem
          # ersten Run nie wieder aktualisiert (actions/cache ueberschreibt nicht).
          key: renovate-cache-${{ github.run_id }}
          restore-keys: |
            renovate-cache-

      - name: Self-hosted Renovate (retry on repository-changed)
        env:
          RENOVATE_TOKEN: ${{ steps.app-token.outputs.token }}
          RENOVATE_REPOSITORIES: ${{ github.repository }}
          LOG_LEVEL: ${{ vars.RENOVATE_LOG_LEVEL || 'info' }}
        run: |
          set -euo pipefail
          # Tag + Digest: der Tag haelt Renovates docker-Manager den Pin frisch,
          # der Digest ist die eigentliche Supply-Chain-Zusicherung (Task 2).
          IMAGE='ghcr.io/renovatebot/renovate:43@sha256:<digest-aus-task-2>'
          MAX_ATTEMPTS=3
          mkdir -p /tmp/renovate-cache

          success=0
          for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
            echo "::group::Renovate attempt ${attempt}/${MAX_ATTEMPTS}"
            log="/tmp/renovate-attempt-${attempt}.log"

            # Kein -t: ein TTY faerbt den Output ein und stoert das Grep unten.
            # PIPESTATUS statt $? — durch die tee-Pipe waere $? der Code von tee.
            set +e
            docker run --rm \
              --env RENOVATE_TOKEN \
              --env RENOVATE_REPOSITORIES \
              --env LOG_LEVEL \
              --env RENOVATE_CONFIG_FILE=/github-action/renovate.json5 \
              --env RENOVATE_REPOSITORY_CACHE=enabled \
              --env RENOVATE_CACHE_DIR=/tmp/renovate-cache \
              --env RENOVATE_REPORT_TYPE=file \
              --env "RENOVATE_REPORT_PATH=/tmp/renovate-report-${attempt}.json" \
              --volume "${GITHUB_WORKSPACE}/renovate.json5:/github-action/renovate.json5" \
              --volume /tmp:/tmp \
              "$IMAGE" 2>&1 | tee "$log"
            docker_rc=${PIPESTATUS[0]}
            set -e
            echo "::endgroup::"

            if [ "$docker_rc" -ne 0 ]; then
              echo "::error::Renovate exited ${docker_rc} on attempt ${attempt}."
              exit "$docker_rc"
            fi

            # Erkennung ueber das Log, nicht ueber das Report-JSON: diese Zeile ist
            # in Run 30238038240 empirisch belegt, das Report-Schema ist ungeprueft.
            # Ein falsch geratener JSON-Pfad wuerde stumm nie matchen — der Retry
            # griffe nie und der Job waere wieder gruen, also genau der Defekt hier.
            if grep -q '"result": "repository-changed"' "$log"; then
              echo "::warning::Attempt ${attempt}: base branch moved mid-run — retrying."
              continue
            fi

            success=1
            break
          done

          if [ "$success" -ne 1 ]; then
            echo "::error::Renovate aborted with repository-changed on all ${MAX_ATTEMPTS} attempts — no repository was processed."
            exit 1
          fi
```

Kein Backoff zwischen den Versuchen: die Schreiblast auf `main` ist über die Zeit verteilt,
nicht gebündelt — Warten erhöht die Trefferchance nicht, verbrennt aber Job-Zeit. Der
Folgeversuch profitiert stattdessen vom warmen Cache und ist dadurch kürzer.

`timeout-minutes: 15` bleibt unverändert: drei Versuche à 157 s ergeben rund acht Minuten
plus Checkout, und mit warmem Cache liegen Versuch 2 und 3 deutlich darunter.

---

## Task 4 — Cache-Rechte und Report-Artefakt

- [ ] Ownership-Normalisierung und Artefakt-Upload ergänzen.

Der `actions/cache`-Post-Step läuft als Benutzer `runner`. Schreibt der Container seine
Cache-Dateien als root, scheitert das Packen an fehlenden Rechten — der Cache wäre beim
nächsten Lauf wieder kalt, ohne dass der Job rot würde. Das `chown` ist das Sicherheitsnetz
dagegen, `if: always()`, damit es auch nach einem fehlgeschlagenen Lauf greift.

```yaml
      - name: Normalize cache ownership
        if: always()
        run: sudo chown -R "$(id -u):$(id -g)" /tmp/renovate-cache || true

      - name: Upload Renovate reports
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: renovate-reports
          path: |
            /tmp/renovate-report-*.json
            /tmp/renovate-attempt-*.log
          if-no-files-found: ignore
          retention-days: 7
```

Die Reports sind Debug-Material, kein Gate — das Gate ist der Log-Grep aus Task 3.

---

## Task 5 — Kommentar-Altlasten korrigieren

- [ ] Header- und Inline-Kommentare an den neuen Stand angleichen.

Der Header-Kommentar beschreibt die abgelöste Action, und die Begründung an `fetch-depth: 0`
behauptet, der volle Klon verhindere den Abbruch. Sie markiert sich selbst als offen und ist
durch die Logs widerlegt — der Abbruch tritt weiter auf, weil Renovate im Container ohnehin
eigenständig klont und der Checkout nur `renovate.json5` liefert.

- Den Kommentarblock zu `renovatebot/github-action` auf das `docker run` umschreiben.
- Die Begründung an `fetch-depth: 0` durch den belegten Stand ersetzen. `fetch-depth` selbst
  **nicht** ändern — eine Rückstufung braucht eigene Verifikation und ist in `design.md` als
  Nebenbefund außerhalb dieses Scopes vermerkt.
- Die Hinweise zu `RENOVATE_REPOSITORIES` (T002165) und den App-Token-Secrets (T002161)
  unverändert erhalten — sie gelten für das `docker run` genauso.

---

## Task 6 — Verifikation

- [ ] Alle Gates grün.

```bash
# 1. Vertragstests gruen (Gegenprobe zu Task 1)
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd.bats --filter "T002249"

# 2. Workflow-YAML syntaktisch valide
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/renovate.yml'))"

# 3. Bash-Block der Retry-Schleife auf Syntaxfehler pruefen
python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/renovate.yml')); \
  [print(s['run']) for s in d['jobs']['renovate']['steps'] if 'run' in s]" > /tmp/renovate-steps.sh
bash -n /tmp/renovate-steps.sh

# 4. Test-Inventar nach Test-Aenderung regenerieren (eigenes CI-Gate)
task test:inventory

# 5. OpenSpec-Delta validieren
task openspec:validate

# 6. Mandatory Verify-Kette
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartung: Schritt 1 grün (4/4), Schritte 2–5 ohne Fehler, Schritt 6 ohne Diff.
`website/src/data/test-inventory.json` wird mitcommittet — sonst schlägt der
Inventory-Vergleich in CI fehl.

Vor dem Merge nicht verifizierbar ist, ob die Retry-Schleife im Ernstfall greift. Das zeigt
erst ein `workflow_dispatch` auf `main` nach dem Merge. Erwartetes Signal dort: entweder ein
Renovate-PR beziehungsweise ein aktualisiertes Dependency Dashboard #3219 — oder ein
**roter** Job mit der `::error::`-Meldung. Ein grüner Job ohne beides wäre der alte Defekt
und hieße, dass der Log-Grep nicht matcht.
