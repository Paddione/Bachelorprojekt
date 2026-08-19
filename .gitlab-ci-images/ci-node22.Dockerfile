# ci-node22 — Prebuilt image for GitLab CI jobs using node:22
# Profiles: bats-unit, factory-openspec, commit-lint
#
# Replaces per-job apt-get + curl setup (~75s → ~2s image pull).
# Source: .gitlab-ci.yml toolchain analysis (T012411).
#
# Rebuild trigger: bump YQ_VERSION or TASK_VERSION in this file,
# or when node:22 base image updates.

FROM node:22-slim

ARG YQ_VERSION=4.53.3
ARG TASK_VERSION=latest

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      git bash python3 python3-yaml gettext-base \
      jq ca-certificates curl >/dev/null && \
    # yq: mikefarah v4 (NICHT das apt-Paket)
    curl --fail -sSL "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" \
      -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq && \
    # task: taskfile.dev
    curl --fail -sSL https://taskfile.dev/install.sh | sh -s -- -b /usr/local/bin && \
    # Cleanup
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN yq --version && task --version
