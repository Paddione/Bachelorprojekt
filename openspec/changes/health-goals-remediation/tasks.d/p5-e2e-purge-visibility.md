# p5-e2e-purge-visibility — Surface post-run E2E purge failures + archive the done change that added the step

Rolle: `impl` · Ziel-Datei: `.github/workflows/e2e.yml`.

Erfüllt `REQ-HEALTH-GOALS-013` (`openspec/changes/health-goals-remediation/specs/health-goals.md`)
und damit G-E2E02: der "Post-run test-data purge (defense-in-depth)"-Step in `e2e.yml`
(aktuell Z.136–145, eingeführt von T002096 / commit `8f273c77d`) swallowt den Fehlerfall der
`curl`-POST an `/api/admin/systemtest/purge-all-test-data` mit einem nackten `|| true` — ein
4xx/5xx oder ein Netzwerkfehler des Purge-Aufrufs bleibt dadurch komplett unsichtbar im
Workflow-Run (kein `::warning::`, kein `::error::`, kein non-2xx-Status irgendwo im Log).
Genau das ist im Live-Check bestätigt worden: frische `is_test_data=true`-Zeilen in
`public.inbox_items` in beiden Brand-DBs (mentolder=3, korczewski=1), obwohl der T002096-Fix
längst gemerged ist — die Defense-in-Depth-Ebene selbst versagt lautlos.

**Kein** `task test:*`-Final-Verify hier (lebt im `tasks.md`-Index) und **kein**
RED-Failing-Test-Step (lebt in `p6-tests`). Der rot→grün-Test für dieses Verhalten ist der
p6-Fall, der die neue `http_code`-Capture-Logik gegen einen simulierten non-2xx-Response prüft
(`tests/spec/health-goals-remediation.bats`, design siehe `p6-tests.md`). Jeder Task hier endet
mit einem konkreten lokalen Prüf-Step.

`.github/workflows/e2e.yml` ist eine `.yml`-Datei — laut `docs/code-quality/gates.yaml` /
`.claude/skills/references/plan-quality-gates.md` (S1-Tabelle: `.ts/.js/.jsx/.py`,
`.svelte/.sh/.mjs/.mts`, `.astro/.tsx/.java/.php`, `.cjs`) gibt es **kein** S1-Zeilenlimit für
`.yml`/`.yaml` — die Datei ist S1-ungated, daher keine Budget-Tabelle nötig. Ist-Zustand:
200 Zeilen (`wc -l .github/workflows/e2e.yml`); nach Task 1 wächst die Datei um ~8 Zeilen
(neue `http_code`-Capture-Logik ersetzt die 2-Zeilen-`curl`), unproblematisch da ungated.

---

## Task 1: Purge-Step-Fehler sichtbar machen (`http_code`-Capture statt `|| true`)

**Warum dieses Muster und nicht `continue-on-error` + separater Status-Check-Step:** der
existierende "Ingest Playwright results into website"-Step direkt darunter (aktuell Z.152–191)
löst exakt dasselbe Problem — best-effort, darf den Job nicht failen, muss aber sichtbar
melden — bereits mit genau diesem Muster: `curl -s -o <response-file> -w '%{http_code}'`,
Statuscode in einer Variable capturen, danach `if [ "${http_code}" != "200" ]; then
echo "::warning::…"; fi`. Der Purge-Step übernimmt dasselbe Muster 1:1 (Konsistenz mit dem
bestehenden Datei-Stil, wie in der Aufgabenstellung gefordert) statt `continue-on-error: true`
neu einzuführen. Unterschied zur Ingest-Vorlage: die Ingest-Vorlage nutzt `::warning::` weil ein
fehlgeschlagener Ingest nur Reporting/Trend-Daten betrifft; ein fehlgeschlagener Purge lässt
personenbezogene Test-Kontaktdaten (`[TEST] E2E User` / `test-e2e@example.invalid`) live in der
Prod-DB liegen (DSGVO-relevant) — dafür `::error::` (bleibt trotzdem nur eine Annotation, kein
`exit 1`; die GitHub-Actions-`::error::`-Workflow-Command failt den Step NICHT selbst, das tut
ausschließlich ein non-zero Exit-Code, den dieser Step weiterhin vermeidet, siehe Verify unten).

Der bisherige `curl -fsS … || true` (Z.142–143) wird durch die Ingest-Stil-Capture ersetzt: kein
`-f` mehr (sonst liefert `curl` bei HTTP-Fehlern gar keinen Body/Status mehr über `-w`, weil `-f`
den Fehlerfall unterdrückt/abbricht), stattdessen `-s -o <tmp-response> -w '%{http_code}'` gegen
eine Variable, plus ein `|| echo "000"`-Fallback für reine Netzwerk-/Timeout-Fehler (dieselbe
Absicherung wie im Ingest-Step Z.180–186, damit ein DNS-/Connect-Fehler nicht unter `set -e` den
ganzen `run:`-Block abbricht, bevor der Fehlerfall geloggt werden kann — GitHub-Actions-`bash`-
Steps laufen mit `-eo pipefail`).

- [ ] In `.github/workflows/e2e.yml`, im Step `Post-run test-data purge (defense-in-depth)`
      (aktuell Z.136–145), den `run:`-Block-Body (Z.141–143) durch die unten stehende
      `http_code`-Capture-Logik ersetzen. Die vorangehende `if [ -z "${CRON_SECRET:-}" ]; then
      …; fi`-Zeile (Z.141) bleibt unverändert — nur der `curl`-Aufruf danach (Z.142–143) wird
      ersetzt.
- [ ] Kommentar über dem Step (Z.135, `# G-E2E02 / T002096: defense-in-depth post-run purge
      (covers timeout kill)`) um einen zweiten Kommentar-Satz ergänzen, der auf G-E2E02 /
      REQ-HEALTH-GOALS-013 als Ursprung der Sichtbarkeits-Änderung verweist (Health-Goal-Check
      `scripts/health-goals-check.sh --only=G-E2E02` liest keine Workflow-Logs, aber der Kommentar
      dokumentiert die Historie für den nächsten Bearbeiter — dieselbe Konvention wie der
      `CRON_SECRET`-Kommentarblock bei Z.128–131).
- [ ] `env:`-Block (Z.144–145) unverändert lassen — `CRON_SECRET` wird weiterhin dort injiziert.

```yaml
      # G-E2E02 / T002096: defense-in-depth post-run purge (covers timeout kill).
      # G-E2E02 / T002148: a failed purge must be VISIBLE in the run, not swallowed by
      # an unconditional `|| true` — a silent purge failure leaves is_test_data=true
      # rows (incl. contact PII) in prod undetected (see health-goals-remediation).
      - name: Post-run test-data purge (defense-in-depth)
        working-directory: tests/e2e
        if: always() && steps.gate.outputs.skip != 'true'
        run: |
          if [ -z "${CRON_SECRET:-}" ]; then echo "::warning::CRON_SECRET not set; skipping purge."; exit 0; fi
          http_code=$(curl -s -o /tmp/purge-response.json -w '%{http_code}' -X POST \
            "${{ matrix.website_url }}/api/admin/systemtest/purge-all-test-data" \
            -H "X-Cron-Secret: ${CRON_SECRET}" || echo "000")
          echo "purge http_code=${http_code}"
          cat /tmp/purge-response.json 2>/dev/null || true
          if [[ "${http_code}" != 2* ]]; then
            echo "::error::Post-run test-data purge failed (HTTP ${http_code}) against ${{ matrix.website_url }} — is_test_data=true rows may remain in the ${{ matrix.cluster }} prod DB. Investigate immediately (G-E2E02, T002096/T002148)."
          fi
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

**Verify:**

```bash
# YAML stays parseable (workflow syntax check without a live Actions run).
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/e2e.yml'))" && echo "yaml ok"
# expected: "yaml ok"

# The old silent-swallow pattern is gone, scoped to just this step's run: block
# (the `|| true` and the `purge-all-test-data` URL are on two different lines,
# so this must be range-scoped rather than a single grep -c).
awk '/name: Post-run test-data purge/,/^      - name: Ingest Playwright/' .github/workflows/e2e.yml \
  | grep -c '|| true'
# expected: 0 (no bare `|| true` left anywhere inside the purge step)

# The new visibility path exists exactly once, using the same http_code idiom as the
# existing Ingest step (consistency check).
grep -c "purge http_code=" .github/workflows/e2e.yml
# expected: 1
grep -c '::error::Post-run test-data purge failed' .github/workflows/e2e.yml
# expected: 1

# Non-2xx still does NOT fail the job: the step has no `exit 1` on the error branch,
# only a workflow annotation — confirm no bare `exit 1`/non-zero exit was added to
# this step's run: block.
awk '/name: Post-run test-data purge/,/^      - name: Ingest Playwright/' .github/workflows/e2e.yml | grep -c 'exit 1'
# expected: 0 (defense-in-depth purge failing must never fail the E2E job itself)
```

---

## Task 2: `openspec/changes/e2e-testdata-leak/` archivieren (Prozess-Hygiene)

Der T002096-Fix (der genau den in Task 1 nachgebesserten Purge-Step ursprünglich eingeführt hat)
ist längst gemerged, aber sein OpenSpec-Change-Verzeichnis wurde nie archiviert — es liegt noch
unter `openspec/changes/e2e-testdata-leak/` statt unter `openspec/changes/archive/`. Das ist reine
Repo-Hygiene (kein Code-Diff), aber Teil desselben G-E2E02-Blocks laut Proposal
(`openspec/changes/health-goals-remediation/proposal.md` → "What" → letzter Punkt).

**CLI-Kommando ermittelt (nicht geraten):** `openspec/changes/e2e-testdata-leak/specs/` enthält
genau eine Delta-Datei, `ci-cd.md`, benannt nach dem **Parent-SSOT-Slug** — und
`openspec/specs/ci-cd.md` **existiert bereits** als SSOT-Spec. Die Delta-Konvention
(`CLAUDE.md` → "Delta-Spec-Konvention T001304") verlangt `--create-new` nur, wenn der
Ziel-SSOT-Spec noch **nicht** existiert; hier existiert er, also ist `--create-new` **falsch**
(würde eine parallele/duplizierte Spec-Komponente statt eines Merges erzeugen) und wird **nicht**
verwendet. Die Delta-Datei enthält ausschließlich einen `## ADDED Requirements`-Block (geprüft:
`Requirement: Nightly-E2E Post-Run-Purge-Fallback` + eine Scenario), also einen reinen additiven
Merge in die bestehende `ci-cd.md` — kein `RENAMED`, kein Sonderfall, der einen weiteren Flag
bräuchte. `scripts/openspec.sh archive` verlangt zusätzlich `status=done` auf dem verknüpften
Ticket (`.ticket` → `T002096`) — bereits geprüft: Status ist `done`. Das exakte Kommando ist
daher ohne zusätzliche Flags:

```bash
bash scripts/openspec.sh archive e2e-testdata-leak
```

- [ ] Vor dem Archivieren den Ticket-Status nochmal live bestätigen (Drift seit der
      Investigation ausschließen):
      ```bash
      bash scripts/ticket.sh get --id T002096 | grep -o '"status" *: *"[^"]*"'
      # expected: "status" : "done"
      ```
- [ ] `bash scripts/openspec.sh archive e2e-testdata-leak` ausführen (kein `--create-new`, kein
      `--target-spec` — Begründung siehe oben). Das Skript merged
      `openspec/changes/e2e-testdata-leak/specs/ci-cd.md` additiv in `openspec/specs/ci-cd.md`
      und verschiebt das Change-Verzeichnis nach
      `openspec/changes/archive/<YYYY-MM-DD>-e2e-testdata-leak/`.
- [ ] Ergebnis verifizieren: altes Verzeichnis weg, neues Archiv-Verzeichnis da, SSOT enthält
      den gemergten Requirement-Block, `openspec:validate` bleibt grün.

**Verify:**

```bash
[ ! -d openspec/changes/e2e-testdata-leak ] && echo "old dir gone: ok"
# expected: "old dir gone: ok"

ls -d openspec/changes/archive/*-e2e-testdata-leak 2>/dev/null
# expected: exactly one match, e.g. openspec/changes/archive/2026-07-24-e2e-testdata-leak

grep -q "Nightly-E2E Post-Run-Purge-Fallback" openspec/specs/ci-cd.md && echo "merged into SSOT: ok"
# expected: "merged into SSOT: ok"

bash scripts/openspec.sh validate
# expected: exit 0 (no "FAIL:" lines for e2e-testdata-leak; the archived dir is skipped by
# validate, and ci-cd.md's merged requirement is a well-formed additive block)
```
