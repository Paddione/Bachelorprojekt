# Proposal: devmesh-grand-consolidation

## Why

Das devmesh-Programm (T900115, ADR-008) ist zu zwei Dritteln auf `main`:
SP-1 Tailnet ist gemergt (#5563, 12/12 Guards GREEN), SP-4 Onboarding ist
gemergt und archiviert (#5578/#5580, Guards GREEN), die RBAC-Voraussetzung
T900110 ist gemergt (#5537, alle Security-Guards GREEN). Sechs Planning-Tickets
sind noch offen, drei davon (T900116, T900119, T900110) brauchen keine
Implementierung mehr, sondern nur Verifikation. Drei Restarbeiten sind echt
offen: Longhorn-Storage (T900181), git-crypt per GPG (T900113) und
k3d-Rückbau (T900120). Vier weitere Planning-Tickets (T900099, T900091,
T900079, T900085) sind stale und werden geschlossen, nicht geplant.

Statt vier Einzel-Changes gibt es einen konsolidierten Change mit drei
disjunkten Partials — eine Branch, eine Review, keine Doppelplanung.

## What

- **P1 — Longhorn 1.11.2 (T900181):** idempotente Preconditions je Knoten
  (open-iscsi, nfs-common, cryptsetup, Kernel-Module), `hddthin`-Auflösung +
  `sda`/`sdb`-Vorbereitung auf gpu-metal, Installation 1.11.2 auf ctx
  `devmesh` (ersetzt `k3d/dev-cluster/longhorn-install.sh` v1.7.2/`devc`),
  Default-StorageClass-Flip, Disk-Registrierung, Anti-Stub-Guard.
- **P2 — git-crypt per GPG (T900113):** `gnupg + pinentry-tty` zurück ins
  dev-shell-Image, einmalige `add-gpg-user`-Zeremonie (patrick/gekko),
  `git-crypt unlock` ohne Keyfile. Entblockt, weil T900110 GREEN ist.
- **P3 — SP-5 k3d-Rückbau (T900120, zuletzt):** migrate → acceptance →
  `k3d-teardown.sh` → FACTORY_CTX/Taskfile.sdlc/Guards/CLAUDE.md auf devmesh.
- **P0 — Verifikation (keine Files):** T900116-, T900119- und
  T900110-Guards bleiben GREEN; kein Re-Spec bestehender Requirements.

Nicht enthalten: Backup-Ziel (S3/NFS), Monitoring-Integration, Migration
bestehender local-path-PVs (explizite Nicht-Ziele aus T900181).

_Ticket: T900115 · Partials: T900181, T900113, T900120 · verifiziert: T900116, T900119, T900110 · geschlossen als stale: T900099, T900091, T900079, T900085_
