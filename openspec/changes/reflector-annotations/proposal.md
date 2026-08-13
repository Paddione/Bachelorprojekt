# Proposal: reflector-annotations

## Why

`prod/wildcard-certificate.yaml` trägt in `spec.secretTemplate.annotations` vier
`reflector.v1.emberstack.eu`-Annotationen, die das TLS-Secret automatisch nach
`coturn`, `workspace-office` und `website` spiegeln sollen. Auf dem fleet-Cluster
läuft jedoch kein Reflector-Controller (`kubectl get pods -A | grep -i reflector`
liefert nichts, verifiziert am 2026-08-13). Die Annotationen sind wirkungslos —
die Kopien entstehen real durch den `tls-sync` CronJob (`prod/reflector.yaml`,
monatlich via K8s-API, verifiziert live in den Namespaces `workspace`,
`workspace-korczewski` und `workspace-staging`).

Der Schaden ist nicht funktional (alle vier Secrets laufen synchron ab), sondern
die Irreführung: Die Konfiguration liest sich wie eine funktionierende Automatik.
Bei T002869 führte genau das zu einer falschen Designentscheidung, die erst nach
Prüfung des laufenden Clusters korrigiert werden konnte. Zusätzlich schreibt
cert-manager die Annotationen via `secretTemplate` als tote Metadaten auf das
generierte Secret (live verifiziert an `workspace/workspace-wildcard-tls`).

## What

- `secretTemplate`-Block (nur die vier Reflector-Annotationen) aus
  `prod/wildcard-certificate.yaml` entfernen
- Gleiche Entfernung in der Staging-Kopie `prod-fleet/staging/wildcard-certificate.yaml`
- Kurz-Kommentar im Manifest, dass die Kopien vom `tls-sync` CronJob gepflegt werden
- Stale Reflector-Kommentar in `k3d/coturn-stack/coturn-cert.yaml` korrigieren
- Guard-Test `tests/spec/fleet-operations/reflector-annotations.bats`:
  keine `reflector.v1.emberstack.eu`-Vorkommen in `prod/`, `prod-fleet/`, `k3d/`;
  Positiv-Anker auf `tls-sync` CronJob als realem Sync-Mechanismus
- Delta-Spec `openspec/changes/reflector-annotations/specs/fleet-operations.md`

Nicht in Scope: Reflector installieren (verworfen — siehe design.md), Umbennen von
`prod/reflector.yaml` (Legacy-Name, Inhalt ist der reale CronJob).

_Ticket: T002880_
