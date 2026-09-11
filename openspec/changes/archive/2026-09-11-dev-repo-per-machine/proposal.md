# Proposal: dev-repo-per-machine

## Why

`work-vm-shared-dev` (T900104) sah eine Proxmox-VM mit einem geteilten Clone für patrick und
gekko vor. ADR-008 verwirft die VM: jede Person arbeitet auf ihrer eigenen physischen Maschine
in WSL. Es fehlt ein reproduzierbarer Weg, eine neue Maschine in einen arbeitsfähigen Zustand
zu bringen — Clone, Toolchain, Hooks, Identität, `gh`-Auth und git-crypt-Key. Heute passiert
das von Hand, und der Key-Transport ist nirgends festgelegt.

_Ticket: T900119_ · Programm: T900115 (ADR-008) · unabhängig von SP-1..SP-3 startbar

## What Changes

1. **Onboarding-Skript `scripts/devmesh/onboard-machine.sh`** (läuft in der WSL-Distro):
   prüft Vorbedingungen (WSL `networkingMode = mirrored`, `git`, `ssh`-Zugang zu GitHub),
   klont das Repo, ruft `scripts/install-dev-tools.sh` für den aufrufenden Benutzer, installiert
   Hooks (`scripts/check-hooks-path.sh`) und den `merge.ours`-Treiber, setzt git-Identität aus
   Parametern, prüft `gh auth status`, entsperrt git-crypt mit einer übergebenen Keydatei und
   verifiziert die Entschlüsselung. Optional (`--with-devmesh`) holt es den Context `devmesh`.
   Modus `--verify` prüft nur und ändert nichts.
2. **Maschinen:** PK-Desktop (bestehender Clone, nur `--verify`), PK-L-1 (gekko, GitHub
   `gekko32`, Rolle `write`), PK-Tablet — alle in WSL.
3. **Key-Verteilung (Runbook `docs/runbooks/git-crypt-key-distribution.md`):** Transport per
   Vaultwarden Send (einmalig, Ablauf 24 h), Ablage `~/.config/git-crypt/bachelorprojekt.key`
   mit Modus 600, Download-Kopie gelöscht. Register der Key-Halter in `devmesh/key-holders.yaml`
   (Maschine, Person, Datum). Widerruf bedeutet neuen Key plus Rotation aller Secrets.
4. **`install-dev-tools.sh`:** Standard wird der aufrufende Benutzer; der `DEV_USERS`-Mehrbenutzer-
   Pfad der VM entfällt.
5. **Rückbau `work-vm-shared-dev`:** Spec-Requirements REMOVED, `tests/spec/work-vm-shared-dev/`
   gelöscht. `scripts/provision-dev-vm.sh` und `prod/cloud-init-dev-vm.yaml` werden gelöscht,
   wenn `git grep -l -e provision-dev-vm -e cloud-init-dev-vm` außerhalb von
   `openspec/changes/archive` und `docs/superpowers/plans` nur noch die gelöschten Guards findet.

## Non-Goals

- Geteilter Clone oder gemeinsame Arbeitsverzeichnisse.
- Onboarding der Bare-Metal-Knoten (tragen keinen Clone).
- GPG-basiertes git-crypt (verworfen zugunsten des symmetrischen Keys).
- Windows-native Toolchain außerhalb von WSL (ADR-008 revidiert ADR-007 Teil C).

## Impact

- Specs: `dev-machine-onboarding` (neu, ADDED), `work-vm-shared-dev` (REMOVED)
- Dateien: `scripts/devmesh/onboard-machine.sh`, `scripts/install-dev-tools.sh`,
  `docs/runbooks/git-crypt-key-distribution.md`, `devmesh/key-holders.yaml`,
  `tests/spec/dev-machine-onboarding/`, Rückbau unter `tests/spec/work-vm-shared-dev/`
- Operator-Schritte: Key-Send an gekko, WSL-Installation auf PK-L-1 und PK-Tablet.
