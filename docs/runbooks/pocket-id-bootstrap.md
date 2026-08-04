# Pocket-ID-Bootstrap (frische Instanz) — T002676

Einmaliges manuelles Vorgehen für jeden **neu aufgesetzten** Cluster. Pocket ID
erzeugt API-Keys ausschliesslich in der UI (Session); sie lassen sich nicht per
Secret oder Env vorgeben. Ohne Admin-User existiert also kein Key — Henne-Ei,
das der `pocket-id-client-seed`-Job nicht selbst auflösen kann.

## Symptome

- Job `pocket-id-client-seed` steht auf `Failed` (BackoffLimitExceeded), Pod-Log:
  `HTTP 401` vom Admin-API (`GET /api/oidc/clients`).
- `oidc_clients` hat 0 Zeilen; jeder Login gegen `auth.<domain>` endet mit
  "The requested OAuth 2.0 Client does not exist."

## Manuelle Schritte (einmalig)

1. **Ersten Admin anlegen:** <http://auth.localhost/setup> mit Passkey
   (WebAuthn). Chromium ist nötig — Firefox gewährt `*.localhost` keinen
   Secure Context für WebAuthn.
2. **API-Key erzeugen:** Pocket-ID-UI → Einstellungen → API-Keys → neuen Key
   erstellen.
3. **Key in `workspace-secrets` schreiben:**
   ```bash
   kubectl -n workspace patch secret workspace-secrets --type merge \
     -p '{"stringData":{"POCKET_ID_API_KEY":"<key>"}}'
   ```
   (Für den Dev-Cluster zusätzlich in `website-secrets` im `website`-Namespace,
   falls das dort referenziert wird.)
4. **Seed-Job neu starten:**
   ```bash
   kubectl -n workspace delete job pocket-id-client-seed
   # Job wird beim nächsten workspace:deploy / Flux-Reconcile neu erzeugt,
   # oder manuell: kubectl -n workspace apply -f k3d/pocket-id-client-seed.yaml
   ```

## Hilfreiche Kommandos

Sobald ein User existiert, kann ein One-Time-Access-Token direkt ausgegeben
werden (Login ohne Passkey-Flow in der Konsole):

```bash
kubectl exec -n workspace <pocket-id-pod> -c pocket-id -- \
  /app/pocket-id one-time-access-token <user>
```

## Warum nicht automatisiert?

Pocket ID (2.x) hasht API-Keys vor dem Speichern (`api_keys.key` varchar(255),
Unique-Constraint) — ein Klartext-Seed per SQL oder Secret wird von der API
nicht akzeptiert (HTTP 401, gemessen 2026-08-04). Der `pocket-id-client-seed`
Job terminiert bei 401/403 mit einer handlungsleitenden Meldung, die auf diese
Datei verweist, statt still in BackoffLimitExceeded zu laufen (T002676).
