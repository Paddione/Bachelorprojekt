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
# The upstream image ships two forkit binaries:
#   /usr/bin/coolforkit-caps — uses CAP_SYS_ADMIN directly to bind-mount
#                              /opt/cool/systemplate into each jail.
#                              Preferred when caps are available.
#   /usr/bin/coolforkit-ns   — creates a user namespace, maps uid 0,
#                              and bind-mounts from inside. Used as
#                              a fallback when caps aren't available.
#
# The upstream image pre-sets cap_chown,cap_fowner,cap_sys_chroot on
# coolforkit-caps but not cap_sys_admin, which means coolwsd routes
# every document session through coolforkit-ns. coolforkit-ns is a
# separate binary with no file caps, so once coolwsd fork+execs it,
# the non-root `cool` user's CapEff drops to 0 and the CLONE_NEWNS
# unshare fails with EPERM — exactly what surfaces the admin-console
# "Langsame Einrichtung des Kit-Jails" red warning.
#
# Fix: add CAP_SYS_ADMIN + CAP_MKNOD to coolforkit-caps so coolwsd
# picks the caps path, and also setcap coolwsd itself so its own
# startup bind-mount self-test passes (needed before coolwsd will
# mark bind-mounting as usable at all).
RUN setcap cap_chown,cap_fowner,cap_mknod,cap_sys_admin,cap_sys_chroot=ep \
        /usr/bin/coolforkit-caps \
    && setcap cap_sys_admin,cap_mknod,cap_setuid,cap_setgid=eip \
        /usr/bin/coolwsd \
    && getcap /usr/bin/coolforkit-caps /usr/bin/coolwsd

# Collabora's own entrypoint refuses to start as root, so we flip back
# to the image's original user (uid 1001, cool). File capabilities
# survive the uid switch on exec.
USER 1001
