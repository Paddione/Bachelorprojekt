# Node Setup Checklist — bare-metal Ubuntu host (PK-Desktop)

First view of the nodectl dashboard section. Check items off as they are done;
`nodectl.lua` renders `- [ ]` as ☐ and `- [x]` as ✔ automatically.

## Workstation (this machine)

- [x] Neovim 0.12.5 installed (`/usr/local/bin/nvim`)
- [x] `kubectl` + `k9s` installed
- [x] Install `lazygit` (0.65.1, `/usr/local/bin` — 2026-09-16)
- [x] Install `tailscale` CLI (1.102.4, apt repo `pkgs.tailscale.com` — 2026-09-16)
- [x] `tailscale up` (joined as `pk-desktop-1`, 100.76.165.106 — 2026-09-16)
- [ ] `task devmesh:tailnet:check` fully green — 3/4 direct, `gpu-cluster-3` still offline (same as cluster state)
- [x] Wire nodectl layer into live config (see `dotfiles/nvim/README.md`, step 4–5)
- [ ] Add `gpu-cluster-3` SSH alias to `~/.ssh/config` (no entry exists yet)

## devmesh cluster

- [ ] Bring `gpu-cluster-3` (10.10.10.4, Ubuntu 26.04) back online — PHYSICAL action needed (see diagnosis below)
  - Diagnosis 2026-09-16: joined 04:34, last kubelet heartbeat 05:50, `Unknown` 05:53; ARP FAILED from 2 vantage points, port 22 no-route. SSD was prepped with Ubuntu 24.04 SERVER (no auto-suspend); node reports 26.04 → died in the 24.04→26.04 upgrade reboot window. No BMC/WoL MAC on record → remote wake impossible.
  - Physical steps: power on, watch console (GRUB? kernel panic?); if upgrade broke boot, boot previous kernel via GRUB → `apt -f install`, finish upgrade.
  - Post-recovery: `ssh gpu-cluster-3` (alias pre-staged 2026-09-16, user `patrick`), `systemctl status k3s-agent`, `tailscale up --hostname=gpu-cluster-3`, record NIC MAC in `devmesh/inventory.yaml` for future WoL, verify `task devmesh:status` + snapshots.
- [ ] Re-join `gpu-cluster-3` as k3s agent (`task devmesh:install HOST=gpu-cluster-3`)
- [ ] Join `ws-ubuntu-1` as devmesh agent (spec: `openspec/specs/local-dev-mesh.md`)
- [ ] `task devmesh:status` green (nodes Ready, etcd snapshot < 12h)
- [ ] `task devmesh:acceptance` passes, then `task devmesh:k3d:teardown`
