# ci-node24 — Prebuilt image for GitLab CI jobs using node:24
# Profiles: brett-typescript, vitest-website, lighthouse
#
# Rebuild trigger: bump pnpm version or when node:24 base image updates.

FROM node:24-slim

ARG PNPM_VERSION=10

RUN apt-get update -qq && \
    apt-get install -y -qq --no-install-recommends \
      git bash jq ca-certificates curl >/dev/null && \
    # corepack + pnpm
    corepack enable && \
    corepack prepare pnpm@${PNPM_VERSION} --activate && \
    # Cleanup
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN node --version && pnpm --version
