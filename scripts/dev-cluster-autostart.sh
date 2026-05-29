#!/usr/bin/env bash
# Install a systemd unit that starts the dev k3d cluster on host boot.
#
# Fixes T000290 (recurrence of T000013): the mentolder-dev k3d cluster did not
# come back after a k3s-1 host reboot, taking dev.mentolder.de offline and
# breaking the published 127.0.0.1:15432 db port that the nightly
# dev-db-refresh CronJob consumes — until someone manually ran
# `k3d cluster start mentolder-dev`.
#
# The container restart policy alone (unless-stopped) is insufficient: it does
# NOT restart containers that were already exited at reboot, nor undo an
# explicit `k3d cluster stop`. A boot-time oneshot covers both gaps.
#
# Idempotent. Run ON the dev node — it needs sudo + the local docker/k3d.
# Invoked by `task dev:cluster:autostart` (locally or over SSH).
#   CLUSTER_NAME=mentolder-dev bash scripts/dev-cluster-autostart.sh
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-mentolder-dev}"
K3D_BIN="$(command -v k3d || echo /usr/local/bin/k3d)"
UNIT="/etc/systemd/system/k3d-${CLUSTER_NAME}.service"

sudo tee "$UNIT" >/dev/null <<UNITFILE
[Unit]
Description=Start k3d ${CLUSTER_NAME} cluster on boot
Documentation=ticket:T000290
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=true
# Idempotent: no-op if the cluster is already running. Never \`create\` here —
# that would lose the load-bearing port mappings (18080/2222/15432). Only
# start/stop.
ExecStart=${K3D_BIN} cluster start ${CLUSTER_NAME}
ExecStop=${K3D_BIN} cluster stop ${CLUSTER_NAME}

[Install]
WantedBy=multi-user.target
UNITFILE

sudo systemctl daemon-reload
sudo systemctl enable --now "k3d-${CLUSTER_NAME}.service"
echo "✓ Installed and enabled k3d-${CLUSTER_NAME}.service"
sudo systemctl is-enabled "k3d-${CLUSTER_NAME}.service"
