# Fleet Dev-Brett OIDC (T901678)

Der reviewbare Draft ist **nicht mergebereit**. Die beiden Manifest-SecretRefs werden erst mit vollständigem Fleet-Ciphertext freigegeben. `dev-oidc-secrets.yaml` und seine Kustomization-Resource fehlen absichtlich bis zur genehmigten Provisionierung. Dev-Bench 0/60 bleibt Gap-Daten; kein Benchmark wird durch diesen Ablauf gestartet.

## Freigabeeffekt

Der Operator muss ausdrücklich die **Neuanlage genau zweier Clients im zentralen Fleet Pocket ID** genehmigen:

| ID / Name | Callback | PKCE |
|---|---|---|
| `brett-dev` | `https://brett.dev.mentolder.de/auth/callback` | aus (Brett nutzt Client-Secret) |
| `workspace-dev` | `https://dev.mentolder.de/oauth2/callback` | an (oauth2-proxy S256) |

Vor der Freigabe ausschließlich `--check`. Keine Timeout-Freigabe. Kein Provider-PUT, DELETE oder Secret-POST auf bereits vorhandene Clients. Keine Produktionsclients ändern, kein Cluster-apply, keine dauerhafte API-Key-Kopie nach workspace-dev. Der Helper liest den API-Key aus Fleet `workspace/workspace-secrets` direkt in Python-Speicher. Weder CLI-Argumente noch Fehlerausgaben enthalten Credentials.

## Vorprüfung und genehmigtes Anwenden

Im Ticket-Worktree ausführen:

```bash
python3 scripts/dev-brett-oidc-provision.py --check
# Erst nach ausdrücklicher Operator-Freigabe:
python3 scripts/dev-brett-oidc-provision.py --apply
# Prüfung und idempotente Wiederholung benutzen dieselbe private Receipt:
python3 scripts/dev-brett-oidc-provision.py --check
python3 scripts/dev-brett-oidc-provision.py --apply
```

Der Provider-Host und beide Callback-Hosts kommen aus `environments/dev-cluster.yaml`. Falls die öffentliche API nicht erreichbar ist, ist ausschließlich ein bewusster lokaler Portforward zulässig (`--provider-url http://127.0.0.1:PORT`); normale HTTPS-Zertifikatsprüfung bleibt aktiv, HTTP-Redirects werden abgelehnt. Die Receipt bindet Geheimnisse an den verwendeten Provider-Origin; Recovery muss denselben Origin verwenden.

Vor dem ersten CREATE werden alle vorhandenen Clients samt Secret überprüft, das vorhandene `environments/.secrets/dev.yaml/BRETT_OIDC_SECRET` gelesen und das live Fleet Sealed-Secrets-Cert abgefragt. Der Sessionwert wird als `BRETT_SESSION_SECRET` wiederverwendet. Kein zufälliger Ersatzwert.

`~/.local/state/dev-brett-auth/receipt.json` ist die private Secret-SSOT (Verzeichnis 0700, Datei 0600, atomare fsync-Schreibvorgänge, exklusiver Lock). Sie liegt außerhalb Git und muss sicher gesichert werden. Der Helper schreibt den Pending-Zustand **vor** jeder Mutation und bestätigt ID/Secret unmittelbar nach deren Antwort. Bestehende Clients ohne bekannte Receipt-Secrets bleiben gesperrt; keine Rotation als Reparatur. Die Receipt niemals in Ticket, PR oder Logs kopieren. Ein anderer Operator braucht eine sichere Übertragung derselben Receipt; der Runtime-Secret allein ersetzt diesen Provenienznachweis nicht.

## Recovery bei verlorener Antwort

Bei `create_pending`, `created` oder `secret_pending` stoppt jede Wiederholung mit `operator_recovery_required`. Kein automatischer POST-Retry: nach Verbindungsabbruch kann der Provider die Operation bereits durchgeführt haben. `created` ist ebenfalls gesperrt, weil nicht belegt ist, ob der nachfolgende Secret-Aufruf gestartet wurde. Erfolgreich bestätigte erste Client-Secrets bleiben bei einem Fehler des zweiten Clients erhalten.

Bei Lost-Response / fehlendem Secret muss der Operator den Zustand separat untersuchen und eine eventuelle Rotation oder Löschung ausdrücklich genehmigen. Der Helper implementiert diese gefährlichen Recovery-Mutationen absichtlich nicht. Receipt aufbewahren; Pending-Zustand nicht manuell auf complete setzen, kein Dummy-Secret. Bei komplett persistierten Secrets ist ein fehlgeschlagenes Sealing durch erneutes `--apply` wiederholbar, ohne weitere Clientanlage oder Secretrotation.

## Providervertrag und Nachweis

Fleet verwendet Pocket ID v2.14.0. Die frühere `/secret`-Route wurde durch **`POST /api/oidc/clients/{id}/secrets`** ersetzt. Die [tagged Create-DTO](https://github.com/pocket-id/pocket-id/blob/v2.14.0/backend/internal/dto/oidc_dto.go) erlaubt explizite Client-IDs; [CreateClient](https://github.com/pocket-id/pocket-id/blob/v2.14.0/backend/internal/service/oidc_service.go) persistiert `input.ID`. Damit sind Slug-ID und Name bewusst identisch, keine zufällig angenommene UUID.

Der Secret-Nachweis sendet einen absichtlich ungültigen Authorization Code mit Client-Secret an den Tokenendpoint. Nur HTTP 400 mit `invalid_grant` gilt als bestätigt; `invalid_client`, andere Fehler oder Erfolg stoppen. [Pocket-ID tokenHandler](https://github.com/pocket-id/pocket-id/blob/v2.14.0/backend/internal/oidc/token_handler.go) delegiert an Fosite. [Die exakt eingebundene Fork v1.3.0](https://github.com/pocket-id/fosite/blob/v1.3.0/access_request_handler.go) authentifiziert vor der Grant-Verarbeitung; [der Authorization-Code-Handler](https://github.com/pocket-id/fosite/blob/v1.3.0/handler/oauth2/flow_authorize_code_token.go) kann Clientauth nicht überspringen. Der ungültige Code kann keine Session erzeugen. Der Helper lehnt Fleet-Images außerhalb v2.14.0 fail-closed ab. Nach Provider-Upgrade diesen Vertrag erneut prüfen und den Versionsguard aktualisieren, bevor der Helper verwendet wird.

## Ciphertext und GitOps vor Merge

Sealing verwendet ausschließlich das live Fleet-Cert (`sealed-secrets/sealed-secrets`) mit `--scope strict` für namespace `workspace-dev`, name `dev-oidc-secrets`. `task env:seal ENV=dev` ist ungeeignet: dev zeigt auf devmesh. Erfolgreiches `--apply` schreibt ausschließlich Ciphertext nach `k3d/dev-stack/dev-oidc-secrets.yaml`; Klartext verbleibt in der privaten Receipt.

Der Orchestrator prüft die drei verschlüsselten Schlüssel `POCKET_ID_BRETT_DEV_SECRET`, `DEV_WORKSPACE_OIDC_SECRET`, `BRETT_SESSION_SECRET`, ergänzt erst dann `dev-oidc-secrets.yaml` in `k3d/dev-stack/kustomization.yaml`, prüft Render/CI und merged. Ohne vollständigen Ciphertext bleibt der PR Draft. Flux-Reconciliation erst nach der genehmigten vollständigen Änderung; kein vollständiges workspace deploy.

Nach Deployment `/healthz` mit 200 und OIDC-Login über `/auth/login` prüfen. Vor dem Playwright-Setup den kubectl-Kontext bewusst auf Fleet prüfen (`kubectl config current-context`); der vorhandene OTAC-Helper nutzt impliziten Kontext. Die Dev-State-Datei muss separat sein:

```bash
BRETT_URL=https://brett.dev.mentolder.de \
BRETT_AUTH_STATE_PATH=tests/e2e/.auth/dev-brett.json \
npx playwright test --config=tests/e2e/playwright.config.ts --project=brett-mentolder-setup
```

Das Setup prüft das geladene Brett-Menü und `/auth/me` auf tatsächlich authentifizierten Admin vor storageState. Den späteren Dev-Test ebenfalls auf dieselbe Dev-State-Datei konfigurieren; keine Produktionsdatei überschreiben, Auth-Dateien nicht committen. T901677 und ein separater GPU-Kostenentscheid bleiben Voraussetzungen des Benchmarks.

Rollback heißt zunächst GitOps-Konfigurationsänderung zurücknehmen. Keine automatischen Provider-Deletes, Secretrotationen oder Receipt-Löschung; bestehende zentrale Clients bleiben bestehen, bis deren Entfernung separat genehmigt wird.
