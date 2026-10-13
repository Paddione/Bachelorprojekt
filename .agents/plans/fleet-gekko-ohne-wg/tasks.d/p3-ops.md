# p3 — Betrieb: Backup, Clusterwechsel, Migration, Cutover

Rolle: impl. Abhaengigkeiten: p1, p2. Alle Schritte sind Operator-/
Cluster-Aktionen; das Runbook ist das Repo-Artefakt und die Evidenz.

## Task 2 — Inventar und Backup-Gate G1

- Step: Runbook `docs/runbooks/fleet-gekko-relaunch.md` mit Checklisten fuer G1 bis G4 anlegen.
- Step: etcd-Snapshot des alten Clusters ziehen; DB-Dumps (shared-db, Nextcloud, Pocket ID, Vaultwarden, Videovault, Brain) und alle Prod-Volumes sichern; die 3 local-path-PVCs auf gekko-hetzner-3/4 vorher separat sichern.
- Step: Restore-Probe mindestens fuer shared-db und ein Volume durchfuehren und im Runbook protokollieren.
- Acceptance: Gate G1 — Operator bestaetigt verifizierte Backups per Ticket-Kommentar auf T016529. Ohne G1 kein Task 4.

## Task 4 — gekko aus altem fleet loesen

- Step: gekko-hetzner-2/3/4 drainen, Pods ziehen auf die pk-Server um; danach Nodes aus dem alten Cluster loeschen, k3s-Agent deinstallieren, wg-fleet auf diesen Nodes abbauen.
- Acceptance: Alter Cluster betreibt Prod allein auf den pk-Servern; gekko-Nodes sind leer und ohne k3s.

## Task 5b — Neuen Cluster aufsetzen und Plattform ausrollen

- Step: Mit den Vorlagen aus p1: k3s server mit cluster-init auf gekko-hetzner-2 installieren, gekko-hetzner-3/4 als Server joinen (embedded etcd), Kubeconfig-Kontext fleet-new anlegen.
- Step: Sealed-Secrets-Controller mit dem vorhandenen fleet-Key ausrollen, cert-manager mit ipv64-Webhook, Flux nur fuer Prod-Kustomizations, Traefik, Monitoring aus p2.
- Acceptance: 3 Server etcd-gesund; `kubectl --context fleet-new get nodes` zeigt alle gekko-Nodes Ready mit privaten Node-IPs; Zertifikate werden ausgestellt; Namespace-Liste enthaelt nur Prod plus Plattform.

## Task 7 — Daten migrieren

- Step: DB-Dumps aus Task 2 einspielen, Volumes per rsync ueber Tailscale oder Restore kopieren.
- Step: Nicht-Prod-Namespaces (staging, dev, korczewski, website-staging, website-korczewski) nach devmesh ueberfuehren.
- Acceptance: Prod-Dienste auf dem neuen Cluster mit echten Daten intern erreichbar; kein Nicht-Prod-Namespace auf dem neuen fleet.

## Task 8 — Abnahme vor dem Umschalten (Gate G2)

- Step: Per resolve-/hosts-Eintrag gegen die gekko-IPs testen: Website, Nextcloud, Pocket ID, Vaultwarden, Zertifikatsgueltigkeit.
- Acceptance: Gate G2 — Operator bestaetigt die Abnahme per Ticket-Kommentar. DNS-TTL vorher senken.

## Task 9 — DNS-Cutover (Gate G3)

- Step: Erst nach ausdrucklicher Operator-Freigabe (Gate G3) die vier A-Records bei ipv64 auf die gekko-IPs umschalten.
- Acceptance: Prod-Domains loesen auf die gekko-IPs auf; Dienste extern gruen; alter Cluster bleibt als Rueckfall bis p4 bereit.
