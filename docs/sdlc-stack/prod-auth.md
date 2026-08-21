# Prod-Passkeys im lokalen SDLC-Stack

Ziel: sich an der Console auf `http://web.localhost` mit dem Passkey anmelden,
der in der Produktion (`auth.mentolder.de`) registriert ist.

## Warum ein Passkey nicht einfach lokal funktioniert

Ein Passkey ist eine WebAuthn-Credential und an die **RP-ID** gebunden — die
Domain, auf der er registriert wurde. Der private Schlüssel verlässt den
Authenticator nie, und die RP-ID geht in die Signatur ein.

Daraus folgen zwei Dinge, die oft zuerst versucht werden und beide nicht gehen
können:

- **Passkey in die lokale Pocket ID kopieren.** Es gibt nichts zu kopieren; der
  private Teil ist nicht exportierbar.
- **Die Pocket-ID-Datenbank aus Prod ziehen.** Die Credential-Zeilen wären da,
  aber die RP-ID lautet `auth.mentolder.de`. Auf `auth.localhost` bietet der
  Browser den Schlüssel gar nicht erst zur Auswahl an.

Der einzige gangbare Weg ist deshalb: **der Authorize-Schritt findet auf der
Prod-Domain statt**, und Pocket ID leitet danach nach `http://web.localhost`
zurück. Die Console tauscht den Code ebenfalls gegen die Prod-Instanz ein.

```
Browser ──1── http://web.localhost/api/auth/login
        ──2── https://auth.mentolder.de/authorize   ← hier greift der Passkey
        ──3── http://web.localhost/api/auth/callback?code=…
Console ──4── POST https://auth.mentolder.de/api/oidc/token
```

## Umschalten

```bash
task sdlc:sdlc:auth:prod     # Login läuft über auth.mentolder.de
task sdlc:sdlc:auth:status   # zeigt den aktuellen Modus
task sdlc:sdlc:auth:local    # zurück auf die mitgelieferte Pocket ID
```

Alternativ beim Deploy direkt: `SDLC_AUTH=prod task sdlc:sdlc:deploy`, danach einmal
`task sdlc:sdlc:auth:prod` für Client und Secret.

**Login-Host ist `web.localhost`, nicht `sdlc.localhost`.** Nur `web.localhost`
ist als `redirect_uri` registriert; Pocket ID vergleicht exakt. Beide Hosts
zeigen auf dieselbe Console.

## Was `task sdlc:sdlc:auth:prod` anfasst

In der **Prod-Pocket-ID**: legt genau einen zusätzlichen OIDC-Client
`website-local` an, mit `http://web.localhost/api/auth/callback` als einziger
Callback-URL, und erzeugt dessen Secret.

**Lokal**: setzt `POCKET_ID_FRONTEND_URL`, `POCKET_ID_URL` und
`POCKET_ID_CLIENT_ID` in der ConfigMap `sdlc-console-config`, schreibt das
Secret in `workspace-secrets` und `website-secrets`, startet die Console neu.

Der Prod-`website`-Client bleibt unangetastet. Das ist der Grund für den
eigenen Client statt einer zusätzlichen Callback-URL am bestehenden: ein
Fehlgriff hier kann niemanden aus `web.mentolder.de` aussperren, und der
Entwickler-Client lässt sich jederzeit ersatzlos löschen.

## Sicherheitslage

Die Callback-URL zeigt auf den Loopback. Ein abgefangener Authorization Code
wäre nur einlösbar, wenn der Angreifer zusätzlich das Client-Secret hat — der
Client ist confidential (`isPublic: false`). Der Angriff setzt außerdem einen
Listener auf `web.localhost:80` des Opfers voraus.

Der Client hat Zugriff auf dieselben Scopes wie jeder andere Pocket-ID-Client:
er authentifiziert nur, er autorisiert nichts zusätzlich. Wer ihn nicht mehr
braucht, löscht ihn in der Pocket-ID-Admin-UI.

## Nach jedem `task sdlc:sdlc:deploy` erneut aufrufen

`sdlc:deploy` appliziert `k3d/secrets.yaml` und setzt
`POCKET_ID_WEBSITE_SECRET` auf den festen Dev-Wert zurück. Danach kennt die
Prod-Pocket-ID ein anderes Secret als die Console, und der Token-Exchange
scheitert mit `invalid_client`. Ein erneutes `task sdlc:sdlc:auth:prod` rotiert das
Secret des Entwickler-Clients und schreibt es wieder in beide K8s-Secrets.

Das ist dieselbe Mechanik, gegen die im lokalen Modus `task sdlc:sdlc:oidc:sync`
läuft.

## Voraussetzung: Console-Image kennt `POCKET_ID_CLIENT_ID`

Die Variable wird erst ab dem Image ausgewertet, das nach dem Merge dieser
Änderung gebaut wird (`.github/workflows/build-sdlc-console.yml`). Ein älteres
Image sendet weiterhin `client_id=website`, und die Prod-Pocket-ID weist den
Authorize-Request mit unbekannter `redirect_uri` ab.

Nach dem Merge:

```bash
task sdlc:sdlc:refresh   # zieht die frische :latest
```

Vorher überbrückt ein lokal gebautes Image:

```bash
docker build -f components/website/Dockerfile --build-arg BUILD_TARGET=sdlc \
  -t ghcr.io/paddione/website-sdlc:prodauth-local .
k3d image import ghcr.io/paddione/website-sdlc:prodauth-local -c mentolder-dev
kubectl --context k3d-mentolder-dev -n workspace set image \
  deploy/sdlc-console sdlc-console=ghcr.io/paddione/website-sdlc:prodauth-local
kubectl --context k3d-mentolder-dev -n workspace patch deploy/sdlc-console \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"sdlc-console","imagePullPolicy":"IfNotPresent"}]}}}}'
```

`imagePullPolicy` muss dabei mit, sonst versucht der Kubelet den lokalen Tag
aus der Registry zu ziehen. `task sdlc:sdlc:deploy` stellt beides zurück.

## Voraussetzung: entsperrtes git-crypt

Der Prod-Admin-API-Key kommt aus `environments/.secrets/mentolder.yaml`. Bei
verschlossenem git-crypt ist die Datei Binärmüll; das Skript bricht mit einem
Hinweis ab, statt in ein unerklärliches `401` zu laufen.

## Fehlerbilder

| Symptom | Ursache |
|---|---|
| `auth_error=exchange_failed` nach der Passkey-Eingabe | Client-Secret-Drift, meist nach einem `sdlc:deploy`. `task sdlc:sdlc:auth:prod` erneut ausführen. |
| Pocket ID zeigt „invalid redirect_uri" | Login lief über `sdlc.localhost`. Über `http://web.localhost` einsteigen. |
| Login-Seite fragt nach Passwort statt Passkey | Der Authorize-Schritt lief gegen `auth.localhost` — Modus prüfen mit `task sdlc:sdlc:auth:status`. |
| Console startet nicht, Log nennt `POCKET_ID_WEBSITE_SECRET` | Secret leer; `task sdlc:sdlc:auth:prod` bzw. `task sdlc:sdlc:auth:local` setzt es. |

## Bekannte Nebenbaustelle

Der Prod-Job `pocket-id-client-seed` ist seit dem 2026-08-08 fehlgeschlagen: der
Flux-Renderer (`scripts/flux-render-artifact.sh`) sammelt alle `${VAR}` aus dem
Manifest ein und ersetzt auch `${SCHEME}`/`${SUFFIX}` — die im Job aber erst
zur **Laufzeit** in der Container-Shell entstehen sollen. Im gerenderten
Manifest steht deshalb `://web./api/auth/callback`.

Für diesen Ablauf hier ist das folgenlos (der Entwickler-Client wird über die
Admin-API gepflegt, nicht über den Job), aber es heißt: **Client-Änderungen in
Prod sind derzeit nicht deklarativ.** Die Behebung wäre, die Laufzeit-Variablen
im Job als `$${SCHEME}`/`$${SUFFIX}` zu schreiben — das ist die Konvention, die
`flux-render-artifact.sh` für genau diesen Fall vorsieht (T002306).
