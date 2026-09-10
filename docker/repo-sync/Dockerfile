# docker/repo-sync/Dockerfile — Checkout-Sidecar des dev-pod [T900107]
#
# Einziger Schreiber des dev-pod-repo-PVC. Haelt /workspace/repo per
# `git fetch && git reset --hard origin/<ref>` auf Stand.
#
# git liegt im Image, nicht im Startkommando — dieselbe Regel wie fuer
# mcp-node: keine Paketinstallation zur Laufzeit.
FROM alpine:3.21

RUN apk add --no-cache git ca-certificates openssh-client

COPY sync.sh /opt/repo-sync/sync.sh
RUN chmod +x /opt/repo-sync/sync.sh \
 && adduser -D -u 1000 sync

USER sync
WORKDIR /workspace

CMD ["/bin/sh", "/opt/repo-sync/sync.sh"]
