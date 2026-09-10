# docker/mcp-node/Dockerfile — Node-MCP-Server-Bundle des dev-pod [T900107]
#
# Enthaelt llm-proxy, ticket-mcp, brain-mcp, task-runner, codebase-memory,
# github und postgres unter einem Supervisor.
#
# KEINE Paketinstallation zur Laufzeit. Der abgeloeste llm-proxy-Container lief
# `apk add bash curl postgresql-client` beim Start und stand deshalb auf 0/1,
# sobald das Alpine-CDN nicht erreichbar war; der Monolith installierte
# supergateway und das github-Binary bei jedem Neustart nach. Jede Zeile hier
# ist Bauzeit — die Erreichbarkeit eines Paket-Mirrors ist danach fuer den Start
# des Pods bedeutungslos.
FROM node:22-alpine

# Versionen gepinnt: dieselben Pins, die der Monolith zur Laufzeit zog
# (supergateway@3.4.3, @modelcontextprotocol/server-postgres@0.6.2) plus die
# Registry-Pins aus docs/agent-guide/registry/mcp.yaml.
ARG SUPERGATEWAY_VERSION=3.4.3
ARG MCP_SERVER_POSTGRES_VERSION=0.6.2
ARG CODEBASE_MEMORY_VERSION=0.10.8
ARG GITHUB_MCP_VERSION=1.0.3

RUN apk add --no-cache \
      bash \
      ca-certificates \
      curl \
      git \
      jq \
      postgresql16-client \
 && npm install -g --no-audit --no-fund \
      "supergateway@${SUPERGATEWAY_VERSION}" \
      "@modelcontextprotocol/server-postgres@${MCP_SERVER_POSTGRES_VERSION}" \
      "codebase-memory-mcp@${CODEBASE_MEMORY_VERSION}" \
 && curl -sSL -o /tmp/github-mcp-server.tar.gz \
      "https://github.com/github/github-mcp-server/releases/download/v${GITHUB_MCP_VERSION}/github-mcp-server_Linux_x86_64.tar.gz" \
 && tar -xzf /tmp/github-mcp-server.tar.gz -C /usr/local/bin github-mcp-server \
 && chmod +x /usr/local/bin/github-mcp-server \
 && rm -f /tmp/github-mcp-server.tar.gz

COPY supervisor.sh reap-postgres-children.sh /opt/mcp-node/
RUN chmod +x /opt/mcp-node/supervisor.sh /opt/mcp-node/reap-postgres-children.sh

# UID 1000 ist im node-Basisimage als 'node' vorhanden und passt zur fsGroup
# des dev-pod-repo-PVC. Der Checkout wird read-only gemountet; alles, was
# geschrieben werden muss, liegt unter /tmp.
USER node
WORKDIR /workspace

CMD ["/bin/sh", "/opt/mcp-node/supervisor.sh"]
