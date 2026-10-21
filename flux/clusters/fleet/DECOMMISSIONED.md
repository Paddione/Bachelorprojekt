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
