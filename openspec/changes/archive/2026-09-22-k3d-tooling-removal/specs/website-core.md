## REMOVED Requirements

### Requirement: Dev-Cluster startet automatisch nach Host-Reboot (T000290)

**Reason:** Der lokale k3d-Cluster, den die systemd-Unit startete, ist abgebaut (T900120, T900145).
Das Installer-Skript `scripts/dev-cluster-autostart.sh` und der Task `cluster:autostart` entfallen
mit T900310. Der lokale Stack läuft auf devmesh (ADR-008).

**Migration:** Keine. devmesh ist ein k3s-Cluster, dessen Knoten k3s als systemd-Dienst selbst starten.
