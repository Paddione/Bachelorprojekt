# Proposal: fix-t013300-filen-remote-retention

## Why

Die db-backup/pvc-backup CronJobs legen auf Filen neue Stempel-Verzeichnisse an
(`~/20260822-005802`, `pvc-~/…`), löschen aber nie alte Generationen remote.
Messung T013037: ~154 MiB/Tag ≈ 4,6 GiB/Monat — der korczewski-Account
(10 GiB Free Tier) war dadurch Anfang Juli voll ("Maximum storage reached").
Ohne Retention wiederholt sich die Quota-Voll-Outage in ~2 Monaten.

## What

Remote-Retention in beiden `filen-upload`-Sidecars (`k3d/backup-cronjob.yaml`,
`k3d/pvc-backup-cronjob.yaml`): nach erfolgreichem Upload listet der Sidecar den
Upload-Pfad (`filen ls`) und soft-deleted alle Generationen außer den neuesten 14
(`filen rm -y`, throttle 3s, timeout je Call). Nur Namen mit Muster
`^(pvc-)?[0-9]{8}-[0-9]{6}$` werden angerührt. Fehlgeschlagener Prune → Exit 1
(Failed-Job-Sichtbarkeit statt stiller Wiederholung der Outage).
Zusätzlich: `@filen/cli` auf die erprobte v0.0.39 gepinnt (Retention hängt am
ls/rm-Verhalten dieser Version).

CLI-Mechanik laut T013037-Live-Messung: jeder Aufruf ist ein Login (~30/min),
trash-empty/trash-delete hängen, CLI kann stallen → timeout everywhere.

_Ticket: T013300_
