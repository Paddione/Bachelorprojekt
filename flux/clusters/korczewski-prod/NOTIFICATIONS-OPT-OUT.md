# Notifications — bewusster Opt-out (korczewski-prod, Nachfolger von fleet)

- Nachfolge-Status (2026-11-07): `korczewski-prod` ist der benannte Nachfolger
  der korczewski-Workloads aus dem dekommissionierten `fleet/`-Cluster
  (siehe `flux/clusters/fleet/DECOMMISSIONED.md`). Das kanonische
  Least-Privilege-RBAC (`tenant-rbac.yaml`) und das eigene Artefakt
  (`korczewski-prod-manifests`) leben hier; `fleet-manifests` darf fuer
  korczewski-Workloads nicht mehr referenziert werden.

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
