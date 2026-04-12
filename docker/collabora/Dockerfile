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
# coolwsd's forkit does:
#   unshare(CLONE_NEWUSER | CLONE_NEWNS)
#   echo "0 <uid> 1" > /proc/self/uid_map   # needs CAP_SETUID
#   echo "0 <gid> 1" > /proc/self/gid_map   # needs CAP_SETGID
#   mount --bind /opt/cool/systemplate …    # needs CAP_SYS_ADMIN
#   mknod(...) for jail device nodes        # needs CAP_MKNOD
# So all four caps have to be in the process's effective set at the
# moment coolwsd runs the forkit. File capabilities make them effective
# regardless of the calling uid, which is how we give the non-root
# `cool` user what it needs without triggering coolwsd's "don't run as
# root" guard.
RUN setcap cap_sys_admin,cap_mknod,cap_setuid,cap_setgid=eip /usr/bin/coolwsd \
    && getcap /usr/bin/coolwsd

# Collabora's own entrypoint refuses to start as root, so we flip back
# to the image's original user (uid 1001, cool). File capabilities
# survive the uid switch on exec.
USER 1001
