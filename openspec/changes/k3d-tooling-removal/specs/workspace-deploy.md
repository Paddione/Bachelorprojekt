## REMOVED Requirements

### Requirement: Dev-Cluster-Autostart-Unit startet Cluster, erstellt ihn nie neu

**Reason:** Das Requirement beschreibt `scripts/dev-cluster-autostart.sh`, das eine Unit mit
`k3d cluster start` installiert. Der k3d-Cluster ist abgebaut (T900120, T900145), Skript und Unit
entfallen mit T900310.

**Migration:** Keine. devmesh-Knoten starten k3s als systemd-Dienst selbst (ADR-008).
