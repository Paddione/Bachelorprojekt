# docker/factory-runner/Dockerfile — Laufzeitumgebung für den fleet-nativen
# Factory-Dispatcher [T016422, T2.3 option b].
#
# Der Pod hält den Repo-Clone unter /workspace und wird vom Tick-CronJob per
# `kubectl exec ... bash scripts/factory/wakeup.sh` benutzt (wakeup.sh bleibt
# NICHT geändert). Deshalb muss hier drin alles liegen, was wakeup.sh und der
# Dispatcher-Tick brauchen: git + git-crypt (Repo-Unlock), gh (PR-Flow), jq,
# go-task (Core Commands), node + @anthropic-ai/claude-code (Dispatcher-Tick),
# bash.
#
# Build & Push läuft über .github/workflows/build-factory-runner.yml; gepinnt
# wird im Manifest laut Kommentar-Strategie in k3d/dev-stack/factory-runner.yaml
# (Tag bis zum ersten CI-Build, Digest hart vor dem Cutover).
FROM node:22-bookworm-slim

# gh ist NICHT in Debian bookworm main — bewusst als gepinntes Release-Binary
# (gleiche Installationsform wie go-task), nicht als fremdes apt-Repo.
ARG GH_VERSION=2.63.2
ARG KUBECTL_VERSION=1.32.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      git \
      git-crypt \
      jq \
      curl \
      postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && curl -sL "https://github.com/go-task/task/releases/latest/download/task_linux_amd64.tar.gz" \
      | tar -xz -C /usr/local/bin task \
 && curl -sL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
      | tar -xz -C /tmp \
 && mv "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
 && rm -rf "/tmp/gh_${GH_VERSION}_linux_amd64" \
 && curl -sLO "https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && chmod +x kubectl \
 && mv kubectl /usr/local/bin/ \
 && npm install -g --silent @anthropic-ai/claude-code

# Non-root UID 1000 — passt zu fsGroup 1000 der factory-runner-workdir-PVC
# (k3d/dev-stack/factory-runner.yaml) und zum restricted Pod-Security-Standard.
# Das node-Basisimage bringt UID 1000 bereits als User 'node' mit (ein zweiter
# useradd auf dieselbe UID wuerde mit Exit 4 scheitern) — wir benennen ihn nur.
RUN usermod -l runner -d /home/runner -m node && groupmod -n runner node
USER runner
WORKDIR /workspace
