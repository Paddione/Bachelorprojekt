# ci-ubuntu — Prebuilt image for GitLab CI jobs using ubuntu:24.04
# Profiles: manifests (kubectl), gitleaks (gitleaks + trivy)
#
# Both jobs share ubuntu:24.04 + curl + bash + ca-certificates + jq.
# kubectl, gitleaks and trivy are added for the specific profiles.
# Since manifests and gitleaks need different binaries, this image
# includes ALL of them — the overhead is minimal (~15MB).

FROM ubuntu:24.04

ARG KUBECTL_VERSION=v1.31.0
ARG GITLEAKS_VERSION=8.18.2
ARG TRIVY_VERSION=0.74.0

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      curl bash ca-certificates git jq \
      python3 python3-yaml gettext-base >/dev/null && \
    # kubectl
    curl --fail -sSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
      -o /usr/local/bin/kubectl && \
    chmod +x /usr/local/bin/kubectl && \
    # gitleaks
    curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
      | tar -xz -C /usr/local/bin gitleaks && \
    chmod +x /usr/local/bin/gitleaks && \
    # trivy
    curl -sSfL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      | tar -xz -C /usr/local/bin trivy && \
    chmod +x /usr/local/bin/trivy && \
    # Cleanup
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN kubectl version --client && gitleaks version && trivy --version
