# Proposal: pocket-id-smtp-wiring

## Why

Pocket-ID ist seit dem Keycloak-Decommission (Welle 3) der alleinige Identity-Provider;
Magic-Link-E-Mail ist sein einziger Auth-Fallback ohne Passkey. Zwei Wiring-Lücken
verhindern, dass SMTP in Prod funktioniert:

1. `k3d/pocket-id.yaml` referenziert `SMTP_USER` als literalen envsubst-Platzhalter
   (`value: "${SMTP_USER}"`). Der Dev-Deploy-Pfad (`Taskfile.yml:2511`) envsubst't
   `$SMTP_USER` korrekt; die beiden Prod-Pfade `workspace:deploy` (Zeile 2585) und
   `workspace:partial-deploy` (Zeile 2719) listen `$SMTP_USER` NICHT in ihrer
   `ENVSUBST_VARS`. In Prod landet daher der literale String `"${SMTP_USER}"` als
   SMTP-Username im Pocket-ID-Pod — SMTP-Auth schlägt fehl (beide Brands).
2. Pocket-ID (v2.9.0) erwartet `SMTP_TLS=none|starttls|tls` (Default `none`), nicht das
   `SMTP_SECURE`-Bool, das Website/Nextcloud nutzen. Ohne `SMTP_TLS` versucht Pocket-ID
   Klartext-SMTP gegen `smtp.mailbox.org:587`, was der Provider ablehnt (STARTTLS-Pflicht).

Dies ist ein Regressions-Bug (T001396, Bug-Triage-Konvention CFR-Gate G-DORA03), keine
Erweiterung — die bestehenden SMTP-Credentials aus `workspace-secrets` sollen korrekt an
Pocket-ID durchgereicht werden, für beide Brands (mentolder, korczewski).

## What

- `$SMTP_USER` in beide Prod-`ENVSUBST_VARS`-Listen (`workspace:deploy`,
  `workspace:partial-deploy`) aufnehmen, damit Pocket-ID in Prod den echten SMTP-Username
  statt eines unsubstituierten Platzhalters bekommt.
- Neue Variable `POCKET_ID_SMTP_TLS` im Taskfile automatisch herleiten — analog zum
  bestehenden `MAIL_FROM_LOCAL`/`MAIL_FROM_DOMAIN`-Muster (aus `SMTP_FROM` abgeleitet):
  `SMTP_SECURE=true → tls`, `SMTP_PORT=587 → starttls`, sonst `none`. Kein neues
  Pflichtfeld in `environments/*.yaml`.
- `k3d/pocket-id.yaml`: neuen Container-Env `SMTP_TLS` verdrahten (literal envsubst,
  analog `SMTP_HOST`/`SMTP_PORT`), `POCKET_ID_SMTP_TLS` in alle drei betroffenen
  `envsubst`-Variablenlisten (dev, prod, partial-deploy) aufnehmen.
- Failing BATS-Test, der die kaputte Prod-Substitution reproduziert und die
  `POCKET_ID_SMTP_TLS`-Herleitung für die drei bekannten Fälle (Mailpit/dev,
  mailbox.org/prod, mailbox.org/staging) verifiziert.
- Explizit außerhalb des Scopes: `SMTP_SKIP_CERT_VERIFY`, `SMTP_PASSWORD_FILE` (nicht
  benötigt), keine neue Secret-Quelle (SMTP_PASSWORD ist bereits korrekt verdrahtet),
  keine Änderung an `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` (bereits korrekt).

_Ticket: T001396_
