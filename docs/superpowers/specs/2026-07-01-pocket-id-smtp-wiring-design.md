---
ticket_id: T001396
plan_ref: null
status: active
date: 2026-07-01
---

# Pocket-ID SMTP-Wiring — Design Spec

## Problem

Pocket-ID (`ghcr.io/pocket-id/pocket-id:v2.9.0`) ist die einzige Identity-Provider-Instanz
seit dem Keycloak-Decommission (Welle 3). Magic-Link-E-Mail ist Pocket-IDs einziger
Auth-Fallback ohne Passkey. Zwei Wiring-Lücken verhindern, dass das in Prod funktioniert:

1. **`SMTP_USER` unsubstituiert in Prod.** `k3d/pocket-id.yaml` setzt den Container-Env
   `SMTP_USER` als literalen envsubst-Platzhalter (`value: "${SMTP_USER}"`). Der Dev-Deploy-Pfad
   (`Taskfile.yml:2511`, Task `workspace:deploy` ENV=dev) listet `$SMTP_USER` korrekt in seiner
   `envsubst`-Variablenliste. Die beiden Prod-Deploy-Pfade — `workspace:deploy` (ENV≠dev,
   `Taskfile.yml:2585`) und `workspace:partial-deploy` (`Taskfile.yml:2719`) — tun das nicht.
   Ergebnis: der Pocket-ID-Pod in Prod (beide Brands) bekommt den literalen String
   `"${SMTP_USER}"` als SMTP-Username injiziert, SMTP-Auth schlägt fehl.

2. **Kein TLS-Modus verdrahtet.** Pocket-ID erwartet `SMTP_TLS=none|starttls|tls`
   (Default `none`, kein Boolean). Das Repo-Schema (`environments/schema.yaml`) kennt nur
   `SMTP_SECURE` (bool), das für Website/Nextcloud (Nodemailer-Semantik) ausreicht, aber
   Pocket-IDs Dreiwert-Enum nicht direkt abbildet. Ohne explizites `SMTP_TLS` versucht
   Pocket-ID Klartext-SMTP gegen `smtp.mailbox.org:587` (beide Brands nutzen denselben
   Provider) — der Server verlangt STARTTLS und lehnt unverschlüsselte Verbindungen ab.

Beide Brands (mentolder, korczewski) sind identisch betroffen — beide laufen auf dem
`fleet`-Cluster mit `smtp.mailbox.org:587` als SMTP-Relay.

## Ziel

Pocket-ID kann in **beiden** Prod-Umgebungen (mentolder, korczewski) sowie in Dev
zuverlässig SMTP für Magic-Link-Mails nutzen — mit den bereits vorhandenen,
zentral verwalteten SMTP-Credentials aus `workspace-secrets` (`environments/.secrets/<env>.yaml`
→ `env:seal` → SealedSecret), ohne neue Secret-Quelle einzuführen.

## Entscheidungen (aus Brainstorming, User-bestätigt)

1. **Fix-Pfad statt Feature-Pfad.** Der fehlende `$SMTP_USER`-Envsubst in Prod ist ein
   nachweisbarer Regressions-Bug (Pocket-ID-SMTP-Auth ist in Prod aktuell kaputt), keine
   reine Erweiterung. Läuft unter Bug-Ticket T001396 gemäß Bug-Triage-Konvention
   (CFR-Gate G-DORA03) — kein stiller `fix()`-Commit ohne Ticket.

2. **`POCKET_ID_SMTP_TLS` wird im Taskfile automatisch abgeleitet**, nicht als neues
   Pflichtfeld in `environments/*.yaml` eingeführt. Muster identisch zu
   `MAIL_FROM_LOCAL`/`MAIL_FROM_DOMAIN`, die bereits aus `SMTP_FROM` abgeleitet werden
   (siehe `environments/schema.yaml:109-121` und `Taskfile.yml` `export MAIL_FROM_LOCAL=...`).
   Herleitungsregel:
   ```
   SMTP_SECURE == "true"  → POCKET_ID_SMTP_TLS=tls
   SMTP_PORT   == "587"   → POCKET_ID_SMTP_TLS=starttls
   sonst                  → POCKET_ID_SMTP_TLS=none
   ```
   Deckt alle bekannten Fälle korrekt ab: Dev (Mailpit, Port 1025, `SMTP_SECURE=false`) →
   `none`; Prod beide Brands (`smtp.mailbox.org:587`, `SMTP_SECURE=false`) → `starttls`;
   Staging (gleiche Mailbox.org-Konvention) → `starttls`. Kein Env-File muss angefasst
   werden, kein neues Schema-Pflichtfeld, kein Risiko für zukünftige Envs, die das Feld
   vergessen.

## Scope

**Geändert:**
- `k3d/pocket-id.yaml` — neuer Container-Env `SMTP_TLS` (literal envsubst, analog
  `SMTP_HOST`/`SMTP_PORT`), Wert `${POCKET_ID_SMTP_TLS}`.
- `Taskfile.yml`, Task `workspace:deploy`, dev-Zweig (~Zeile 2490-2511): Herleitung von
  `POCKET_ID_SMTP_TLS` exportieren, `$POCKET_ID_SMTP_TLS` in die dortige envsubst-Liste
  aufnehmen.
- `Taskfile.yml`, Task `workspace:deploy`, prod-Zweig (~Zeile 2584-2638): `$SMTP_USER`
  UND `$POCKET_ID_SMTP_TLS` in `ENVSUBST_VARS` aufnehmen, Herleitung exportieren.
- `Taskfile.yml`, Task `workspace:partial-deploy` (~Zeile 2718-2750): identische Ergänzung
  — dieser Pfad muss den Prod-Contract von `workspace:deploy` exakt spiegeln (bestehender
  Kommentar: "Mirror workspace:deploy's prod envsubst contract EXACTLY").
- `tests/spec/` — neuer oder erweiterter BATS-Test, der die kaputte Prod-Substitution
  reproduziert (rot vor dem Fix: gerendertes Manifest enthält `"${SMTP_USER}"` statt
  echtem Wert; grün danach) UND die `POCKET_ID_SMTP_TLS`-Herleitung für die drei bekannten
  Fälle (Mailpit/dev, mailbox.org/prod, mailbox.org/staging) verifiziert.

**Explizit außerhalb des Scopes:**
- `SMTP_SKIP_CERT_VERIFY` und `SMTP_PASSWORD_FILE` (weitere von Pocket-ID unterstützte,
  aber hier nicht benötigte SMTP-Env-Vars — mailbox.org hat ein valides Zertifikat, und
  das Repo nutzt durchgängig `secretKeyRef` statt Docker-Secrets-Style File-Mounts für
  Passwörter; keine Inkonsistenz einführen).
- Keine neue Secret-Quelle — `SMTP_PASSWORD` wird bereits korrekt über
  `workspace-secrets`/`secretKeyRef` an Pocket-ID durchgereicht (kein Bug dort).
- Keine Änderung an `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`-Wiring für Pocket-ID — diese sind
  bereits korrekt verdrahtet (envsubst-Liste enthält sie in allen drei Pfaden).

## Verifikation

- Failing Test zuerst (rot), reproduziert das kaputte Prod-Rendering.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check` grün.
- Manuelle Verifikation nach Deploy (optional, außerhalb der PR): Magic-Link-Login auf
  `auth.mentolder.de` und `auth.korczewski.de` auslösen, Mailversand in Mailbox.org-Logs
  bzw. per Test-Empfänger bestätigen.
