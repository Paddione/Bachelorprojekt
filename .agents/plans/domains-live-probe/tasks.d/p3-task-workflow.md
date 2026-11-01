# p3 — Task + Workflow

## `task domains:probe` (`taskfiles/Taskfile.platform.yml`, +8 Zeilen)
```yaml
domains:probe:
  desc: "Live-Host-E2E-Probe je Registry-Host (DNS/TLS/Status/Redirect; task domains:probe -- --cluster fleet)"
  cmds:
    - node scripts/domains-check.mjs --validate-only  # Platzhalter auflösbar? (fällt weg, wenn Script anders heißt: an p1-Namen koppeln)
    - node scripts/domains-probe.mjs {{.CLI_ARGS}}
```
Hinweis an die Ausführung: Der erste Befehl ist nur sinnvoll, falls p1 das
Flag `--validate-only` exakt so implementiert — sonst streichen, das
Probe-Script validiert vor dem Lauf ohnehin selbst.

## `.github/workflows/domains-probe.yml` (neu, ≈ 60 Zeilen, Vorbild `e2e.yml`)
- `on.schedule.cron: "0 4 * * *"` (03:00 ist durch e2e.yml belegt),
  `on.workflow_dispatch` mit `cluster`-Choice (`both`, `fleet`, `devmesh`, Default `both`).
- `concurrency.group: domains-probe-${{ github.ref }}`, `cancel-in-progress: false`.
- Ein Job `probe` (ubuntu-latest, timeout 15 min): checkout, setup-node 22,
  `npm ci` (für das `yaml`-Paket), dann
  `node scripts/domains-probe.mjs --cluster ${{ inputs.cluster || 'both' }}`.
- Keine Secrets (unauthentifizierte Erwartungen per B3), keine Services.
- Bewusst KEIN Required Check (analog E2E-Entpflichtung: nightly informiert,
  blockiert kein Auto-Merge) — im Workflow-Header als Kommentar begründen.

## Gates
- `task lint:workflows` grün (läuft bei Workflow-Änderungen auch in `test:changed`).
- `task --list-all` enthält `domains:probe` (Golden-Refresh folgt in p4).
