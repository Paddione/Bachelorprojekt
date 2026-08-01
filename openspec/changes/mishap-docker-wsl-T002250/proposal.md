# Proposal: mishap-docker-wsl-T002250

## Why

WSL Docker environment has two major friction points for agent and automated workflow tasks:
1. `docker pull` commands from WSL fail when Docker Desktop's credential helper integration is broken, resulting in `/usr/bin/docker-credential-desktop.exe: Invalid argument`. Removing `credsStore` from `~/.docker/config.json` prevents this.
2. Containers running under WSL (e.g., self-hosted Renovate, factory sandbox runs) experience DNS timeouts and resolution flakiness, causing random `ENOTFOUND` errors. Specifying `--dns 1.1.1.1` ensures a reliable DNS resolver inside containers.

## What

1. **Auto-correct broken Docker Desktop credsStore in WSL**: Add a self-healing check in `scripts/setup.sh`. If it runs in WSL and finds `credsStore` configured in `~/.docker/config.json` as `desktop.exe` or `desktop`, it will automatically remove it.
2. **Stable DNS for Renovate container**: Add `--dns 1.1.1.1` to the self-hosted Renovate container run inside `.github/workflows/renovate.yml`.
3. **Stable DNS for Sandbox container**: Update `scripts/factory/sandbox-run.sh` to add `--dns 1.1.1.1` when executing container workloads under WSL.

_Ticket: T002250_
