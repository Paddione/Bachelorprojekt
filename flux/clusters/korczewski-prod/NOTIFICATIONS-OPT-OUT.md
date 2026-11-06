# Notifications — bewusster Opt-out (korczewski-prod)

- Kein `Provider`/`Alert` in diesem Verzeichnis (Stand 2026-11-07).
- Begruendung: Enklave-Prinzip — das Artefakt ist oeffentlich pullbar
  (`oci-source.yaml` ohne `secretRef`, Design D8), Notification-Secrets
  (GitHub-Token, Webhook-HMAC) gehoeren nicht in dieses Envelope.
  Cluster-seitig greift `spec.networkPolicy: true` + `multitenant: true`.
- Abdeckung: `OCIRepository/korczewski-prod-manifests` pollt alle 5m,
  Kind-Kustomizations `interval: 10m + retryInterval: 2m`;
  Abschlusspruefung siehe `bootstrap/README.md` Punkt 8.
- Bei Bedarf: `notification.toolkit.fluxcd.io/v1` verwenden (nicht `v1beta3`).
  `fleet/notifications.yaml` bleibt wegen DECOMMISSIONED-freeze unveraendert.
