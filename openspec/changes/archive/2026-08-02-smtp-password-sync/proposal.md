# Proposal: smtp-password-sync

## Why

Der `SMTP_PASSWORD` in `workspace-secrets` (ns `workspace`) hat sich vom `SMTP_PASSWORD` in
`alertmanager-smtp` (ns `monitoring`) gelöst. Beide SealedSecrets werden über
`scripts/env-seal.sh` + `scripts/lib/seal-extra-namespaces.sh` aus derselben
Plaintext-Quelle (`environments/.secrets/<env>.yaml`) erzeugt — das Schema
(`environments/schema.yaml:713-725`) deklariert `SMTP_PASSWORD` mit
`extra_namespaces` für beide Secrets. Die Drift entstand vermutlich durch ein
partielles Re-Seal, bei dem nur einer der beiden Targets aktualisiert wurde.

**Auswirkung:** Alertmanager kann im Prod-Cluster (mentolder) keine
E-Mail-Benachrichtigungen verschicken, weil das `alertmanager-smtp`-Secret ein
anderes Passwort enthält als das Workspace-Secret, das die tatsächlichen
SMTP-Credentials bereitstellt. Dev-Cluster sind nicht betroffen (hier wird der
dev-Placeholder `alertmanager-smtp-secret.yaml` direkt deployed, nicht über
SealedSecrets).

**Source of Truth:** `environments/.secrets/mentolder.yaml` (bzw.
`environments/.secrets/fleet-mentolder.yaml`) — dort steht der korrekte
Plaintext-Wert. Das `env:seal`-Script muss beide Targets neu verschlüsseln.

## What

1. Re-Seal von `environments/sealed-secrets/mentolder.yaml` und
   `environments/sealed-secrets/fleet-mentolder.yaml` über
   `task env:seal ENV=mentolder` bzw. `task env:seal ENV=fleet-mentolder`, sodass
   `workspace-secrets` und `alertmanager-smtp` den identischen
   `SMTP_PASSWORD`-Wert enthalten.

2. Keine Schema-Änderung erforderlich — das Schema ist korrekt, die
   `extra_namespaces`-Deklaration funktioniert wie vorgesehen.

3. Keine Code-Änderung erforderlich — der Bug ist ein einmaliger Vorgang,
   kein systematischer Fehler im Seal-Skript.

**Non-Goals:**
- Änderung an `environments/schema.yaml` (nicht nötig)
- Änderung an `scripts/env-seal.sh` oder `scripts/lib/seal-extra-namespaces.sh`
- Automatisierte Paritäts-Prüfung zwischen `workspace-secrets` und
  `extra_namespaces`-Targets (könnte ein separates Ticket werden)

_Ticket: T001802_
