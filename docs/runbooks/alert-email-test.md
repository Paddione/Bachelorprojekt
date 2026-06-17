# Alert-E-Mail-Test (synthetisch)

## Offline-Validierung

```bash
# promtool rule check
yq '.spec' k3d/monitoring/prometheus-rules.yaml > /tmp/r.yaml && promtool check rules /tmp/r.yaml

# Kustomize-Build (Base + Prod)
task monitoring:validate

# bats-Suite
./tests/runner.sh local T000617
```

## Live-Synthetik pro Brand (fleet-Kontext)

1. Kontext setzen:
   ```bash
   kubectl config use-context fleet
   ```

2. Test-Alert an den Alertmanager senden (Port-forward oder direkt via Service):
   ```bash
   # Port-forward zum Alertmanager
   kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-alertmanager 9093:9093 &
   sleep 2

   # Test-Alert senden
   curl -X POST http://localhost:9093/api/v2/alerts \
     -H "Content-Type: application/json" \
     -d '[{
       "labels": {
         "alertname": "TestAlertEmail",
         "severity": "warning",
         "namespace": "workspace"
       },
       "annotations": {
         "summary": "Synthetischer Test für E-Mail-Benachrichtigung",
         "description": "Dieser Alert testet den E-Mail-Versand. Wird nach 1m automatisch gelöscht."
       },
       "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
       "endsAt": "'$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%SZ)'"
     }]'

   kill %1 2>/dev/null || true
   ```

3. **Erwartung:** E-Mail an `CONTACT_EMAIL` mit Betreff `[FIRING] TestAlertEmail ...` wird innerhalb weniger Minuten zugestellt.

4. **Verifikation:** Posteingang des konfigurierten `CONTACT_EMAIL` prüfen. Der Alert läuft nach `endsAt` automatisch ab.
