# Fleet-Cluster — dekommissioniert (2026-10-22)

- Die Tailnet-Knoten `gekko-hetzner-2/3/4` (u. a. Kubernetes-API auf
  `100.104.153.88:6443`) sind dauerhaft offline; der Cluster kommt nicht zurueck.
- Prod ist davon unberuehrt und wird anderweitig serviert (`mentolder.de` → 308,
  `web.mentolder.de` → 200 mit gueltigem LE-Zertifikat, Stand 2026-10-22).
- Die Manifeste in `flux/clusters/fleet/` und `flux/clusters/fleet-gekko/` werden
  derzeit von keinem Sync gezogen. Offene Punkte, die einen lebenden Cluster
  voraussetzen, laufen ins Leere und werden bei Klaerung des Nachfolge-Ziels neu
  bewertet — konkret das Pending-Live-Verify aus PR #6790
  (`flux get sources git gekko-mentolder-prod -n flux-system` → `Verified`).
- Keine Aenderungen in diesen Verzeichnissen ohne geklaertes Nachfolge-Ziel.

## Nachfolge-Ziel (2026-11-07): korczewski-prod

- Nachfolger fuer die korczewski-Workloads (`flux-korczewski`,
  `flux-korczewski-auth`, `flux-korczewski-jobs`, `flux-website-korczewski`)
  ist `flux/clusters/korczewski-prod/` mit eigenem Artefakt
  `oci://ghcr.io/paddione/korczewski-prod-manifests` (immutable `v0.*`,
  cosign-verifiziert, kein `secretRef` per Design D8) und
  Least-Privilege-RBAC (`tenant-rbac.yaml`, keine `cluster-admin`-Bindung).
- `fleet-manifests` bleibt nur fuer den retired-fleet-Pfad und
  `fleet-gekko/` (gekko-mentolder, Mentolder-Kontext — Mentolder ist
  inzwischen eigenes Repo) bestehen, bis der Mentolder-Cutover das
  `fleet-manifests`-OCI obsolet macht. korczewski-Workloads duerfen NICHT
  mehr auf `fleet-manifests` verweisen.
- Mit geklaertem Nachfolge-Ziel sind in diesen Verzeichnissen wieder
  nicht-verhaltenswirksame Pflegezuege erlaubt (Beispiel: diese Datei,
  `notifications.yaml` `v1beta3` → `v1` am 2026-11-07 — No-Op auf einem
  Cluster, der von keinem Sync gezogen wird). Verhaltenswirksame
  Reaktivierungen (neue Sync-Pfade, RBAC-Aufweitungen) bleiben verboten;
  sie gehoeren nach `korczewski-prod/`.
