# Notifications — bewusster Opt-out (devmesh)

- Kein `Provider`/`Alert` in diesem Verzeichnis (Stand 2026-11-07).
- Begruendung: devmesh hat kein `github-token` im Bootstrap
  (`bootstrap/` enthaelt nur `ghcr-auth` + `dotfiles-https-auth`);
  ein `Provider type: github` wuerde ohne Secret nie Ready.
  Ein generischer Webhook ohne Ziel waere Schein-Sicherheit.
- Abdeckung: `OCIRepository/devmesh-manifests` pollt alle 5m,
  alle 7 Kustomizations `interval: 10m + retryInterval: 2m`;
  `task flux:stalled` erkennt haengende Reconciles (T002207).
- Review: bei Einfuehrung eines Notification-Ziels (z.B. ntfy/Alertmanager)
  hier `notification.toolkit.fluxcd.io/v1` (nicht `v1beta3`) verwenden —
  `v1beta3` ist in fleet/notifications.yaml noch Altlast, dort aber
  DECOMMISSIONED-freeze (keine Aenderung ohne Nachfolge-Ziel).
