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
- [x] Add `gpu-cluster-3` SSH alias to `~/.ssh/config` (pre-staged; verified 2026-09-17)

## devmesh cluster

- [ ] Commission `gpu-cluster-3` (10.10.10.4) — first real boot (PHYSICAL: power on the box)
  - State 2026-09-16: stale node object DELETED (`kubectl delete node gpu-cluster-3`; only a DaemonSet pod attached, auto-recreates). Test-boot identity was machineID `ac9c17…`, Ubuntu 26.04, worker-only — no etcd impact.
  - On power-on the box should self-register (same machine-id on SSD, k3s agent + cloud-init user `patrick` baked in). Then: `ssh gpu-cluster-3` (alias pre-staged), `tailscale up --hostname=gpu-cluster-3`, verify `task devmesh:status` + snapshots, record NIC MAC in `devmesh/inventory.yaml` for future WoL.
- [ ] Re-join `gpu-cluster-3` as k3s agent (`task devmesh:install HOST=gpu-cluster-3`)
- [ ] Join `ws-ubuntu-1` as devmesh agent (spec: local-dev-mesh-Spec)
- [ ] `task devmesh:status` green (nodes Ready, etcd snapshot < 12h)
- [ ] `task devmesh:acceptance` passes, then `task devmesh:k3d:teardown`
