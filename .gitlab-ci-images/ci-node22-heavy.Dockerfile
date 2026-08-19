# ci-node22-heavy — Prebuilt image for factory-shard (T012411)
#
# Includes: node:22, go, kubectl, kustomize, parallel, bc, file, unzip,
# python3-pip, yq, task, corepack (pnpm). This is the heaviest profile.
#
# Rebuild trigger: bump any VERSION ARG.

FROM node:22-slim

ARG YQ_VERSION=4.53.3
ARG KUBECTL_VERSION=v1.31.0
ARG KUSTOMIZE_VERSION=5.5.0
ARG GO_VERSION=1.26.4

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      git bash python3 python3-yaml gettext-base \
      jq ca-certificates curl parallel bc file unzip \
      python3-pip >/dev/null && \
    # yq: mikefarah v4
    curl --fail -sSL "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" \
      -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq && \
    # kubectl
    curl --fail -sSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
      -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    # kustomize (eigenes Binary, nicht `kubectl kustomize`)
    curl --fail -sSL "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${KUSTOMIZE_VERSION}/kustomize_v${KUSTOMIZE_VERSION}_linux_amd64.tar.gz" \
      -o /tmp/kustomize.tgz && \
    tar -xzf /tmp/kustomize.tgz -C /usr/local/bin kustomize && \
    rm /tmp/kustomize.tgz && \
    # Go
    curl --fail -sSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" \
      -o /tmp/go.tgz && \
    tar -C /usr/local -xzf /tmp/go.tgz && \
    rm /tmp/go.tgz && \
    # task
    curl --fail -sSL https://taskfile.dev/install.sh | sh -s -- -b /usr/local/bin && \
    # Cleanup
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/go/bin:${PATH}"

RUN yq --version && kubectl version --client && kustomize version && \
    go version && task --version && parallel --version | head -1
