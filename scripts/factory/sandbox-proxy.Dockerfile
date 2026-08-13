# scripts/factory/sandbox-proxy.Dockerfile — Squid-Egress-Proxy der Factory-Sandbox.
# T003871: einziger externer Pfad der sandboxed Factory-Agenten. Die Sandbox-Netze
# sind `--internal` (default-deny); dieser Container haengt zusaetzlich am
# Default-Bridge und filtert HTTP/HTTPS-CONNECT per dstdomain-ACL, die
# sandbox-run.sh zur Laufzeit aus `egress_allowlist()` generiert und per
# Bind-Mount nach /etc/squid/squid.conf einhaengt (single source of truth).
FROM alpine:3.20

RUN apk add --no-cache squid && \
    mkdir -p /var/cache/squid && \
    squid -z

# cache.log je Container-Start leeren — sandbox-run.sh wartet auf die
# "Accepting HTTP"-Zeile als Listener-Readiness (sonst matcht der Grep die
# alte Zeile des Vorlaufs und der Wait ist wirkungslos).
CMD ["sh", "-c", ": > /var/log/squid/cache.log; exec squid -N -f /etc/squid/squid.conf"]
