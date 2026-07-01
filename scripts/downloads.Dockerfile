FROM joseluisq/static-web-server:2.36-alpine
# static-web-server runs as uid 1000 and serves SERVER_ROOT (/public).
# No org.opencontainers.image.source LABEL: avoids auto-linking this image to
# the public source repo, which can make GHCR inherit the repo's (public)
# visibility instead of the package's own private default. The enforced backstop
# is the "Verify downloads-content package is private" step in
# .github/workflows/build-rustdesk-installer.yml (REQ-RUSTDESK-CLIENT-003).
COPY rustdesk-workspace-installer.exe /public/rustdesk-workspace-installer.exe
# T001431: without a custom index.html, static-web-server falls back to its
# own built-in placeholder page ("Static Web Server ... View on GitHub") at
# the root path instead of starting the download.
COPY downloads-index.html /public/index.html
ENV SERVER_ROOT=/public
ENV SERVER_PORT=8787
ENV SERVER_CACHE_CONTROL_HEADERS=false
