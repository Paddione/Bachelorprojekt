# ghcr.io/paddione/factory-runner [T016433]
# Laufzeit für den Fleet-nativen Factory-Dispatcher (ADR-007): git, git-crypt,
# Node (task/dispatcher), GitHub-CLI und die Agent-CLIs. Build + Push:
#   docker build -f scripts/factory-runner.Dockerfile -t ghcr.io/paddione/factory-runner:latest .
#   docker push ghcr.io/paddione/factory-runner:latest
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git bash jq yq python3 nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# git-crypt aus den Paketen; claude/opencode CLIs via npm (Versionen bewusst
# floating — der Runner ist Best-Effort-Nachtarbeit, Eskalation läuft über
# Cloud-APIs).
RUN apt-get update && apt-get install -y --no-install-recommends git-crypt \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code @openencodelabs/opencode 2>/dev/null \
    || npm install -g @anthropic-ai/claude-code

# Non-root Betriebskonto (uid 1000), Repo-Workdir kommt per PVC.
RUN useradd -m -u 1000 runner
USER runner
WORKDIR /work/repo
CMD ["sleep", "infinity"]
