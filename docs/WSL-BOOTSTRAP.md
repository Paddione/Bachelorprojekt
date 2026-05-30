# WSL Bootstrapping Gotchas

When bootstrapping a new WSL workstation for the Workspace MVP development, keep these common issues and solutions in mind:

### 1. `task` CLI Command Collision (taskwarrior vs go-task)
* **Problem**: Running `apt install task` on Ubuntu 24.04 (and other newer distros) installs **taskwarrior**, not the Go-based task runner (`go-task`).
* **Fix**: Do not use `apt install task`. Instead, install go-task via snap:
  ```bash
  snap install task --classic
  ```
  Or follow the official installation instructions for `go-task` (e.g. using their official Debian repository or shell script).

### 2. Docker Desktop WSL Integration
* **Problem**: When creating a new WSL distribution, Docker Desktop's WSL integration is not auto-enabled. This blocks all Docker, build, and `k3d` operations.
* **Fix**: Open Docker Desktop, go to **Settings** > **Resources** > **WSL Integration**, and toggle the switch to enable it for your newly created distribution. Click **Apply & Restart**.

### 3. SSH Private Key Permissions
* **Problem**: SSH private keys copied or mounted from Windows (e.g., from `/mnt/c/...`) often arrive in the WSL environment with permissive file permissions (mode `644`), causing SSH to refuse using the key.
* **Fix**: Restrict the permissions of your private keys to `600`:
  ```bash
  chmod 600 ~/.ssh/id_ed25519
  ```

### 4. PostgreSQL Client Missing for Dev DB Refresh
* **Problem**: `task dev-mentolder:db:refresh` / `task dev-korczewski:db:refresh` calls `scripts/dev-db-refresh.sh`, which shells out to `pg_restore`/`psql` on the host. On a fresh Ubuntu, only `postgresql-client-common` (the `pg_wrapper` shim) is present, so every invocation fails with `You must install at least one postgresql-client-<version> package`. **Note:** `dev-korczewski:db:refresh` targets the fleet cluster (the old standalone korczewski context is DEAD — T000340).
* **Fix**: Install a versioned client that is ≥ the server version. Prod runs PostgreSQL 16, so:
  ```bash
  sudo apt-get install -y postgresql-client-16
  ```
  Verify with `psql --version` (expect `16.x`), then re-run the refresh task.
