# ═══════════════════════════════════════════════════════════════════
# Collabora Online with file-capabilities on coolwsd
# ═══════════════════════════════════════════════════════════════════
# Thin layer over the upstream `collabora/code` image that grants
# cap_sys_admin + cap_mknod to the coolwsd binary via setcap. Needed
# so the non-root `cool` user inside the container can exercise mount
# namespaces and bind-mount /opt/cool/systemplate into each document
# jail — Kubernetes pod-level `capabilities.add` only puts the caps in
# the bounding set for non-root processes; file capabilities make them
# effective regardless of the caller's uid.
#
# Build args:
#   UPSTREAM_TAG — Collabora CODE tag to base on (override at build time)
#
# Corresponding pod spec requirements:
#   - namespace PSA: privileged (so the caps are admissible)
#   - securityContext.capabilities.add: [SYS_ADMIN, MKNOD]
#   - no runAsUser override (coolwsd refuses to start as root)
ARG UPSTREAM_TAG=25.04.9.4.1
FROM collabora/code:${UPSTREAM_TAG}

USER root
RUN setcap cap_sys_admin,cap_mknod=eip /usr/bin/coolwsd \
    && getcap /usr/bin/coolwsd

# Collabora's own entrypoint refuses to start as root, so we flip back
# to the image's original user (uid 1001, cool). File capabilities
# survive the uid switch on exec.
USER 1001
