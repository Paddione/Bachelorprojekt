FROM joseluisq/static-web-server:2.36-alpine
# joseluisq/static-web-server uses user 1000 by default in the alpine tag
# and expects files in /public (or whatever SERVER_ROOT is set to)
COPY k3d/docs-content-built /public
ENV SERVER_ROOT=/public
ENV SERVER_PORT=8787
ENV SERVER_CACHE_CONTROL_HEADERS=false
