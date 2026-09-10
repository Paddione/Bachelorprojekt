# docker/dev-shell/Dockerfile — SSH-erreichbarer Dev-Container des dev-pod [T900108]
# Alles zur Bauzeit (Requirement "Container images carry their dependencies").
FROM node:22-bookworm-slim

ARG KUBECTL_VERSION=v1.36.1
ARG CLAUDE_CODE_VERSION=2.1.267

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-server git git-crypt bash curl ca-certificates jq less vim-tiny tmux \
      netcat-openbsd postgresql-client gnupg \
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && sh -c "$(curl -fsSL https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && npm install -g --no-audit --no-fund pnpm "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && rm -rf /var/lib/apt/lists/*

# Zwei Login-Namen auf uid 1000: sshd ohne root prueft getuid()==pw_uid, nicht den Namen.
# Shadow '*' statt '!': '!' wertet sshd als gesperrtes Konto.
RUN groupmod -n dev node \
 && usermod -l patrick -d /home/dev -m -s /bin/bash node \
 && usermod -p '*' patrick \
 && echo 'gekko:x:1000:1000:gekko:/home/dev:/bin/bash' >> /etc/passwd \
 && echo 'gekko:*:19000:0:99999:7:::' >> /etc/shadow \
 && install -d -o 1000 -g 1000 -m 0700 /var/lib/dev-shell/authorized_keys \
 && install -d -o 1000 -g 1000 -m 0755 /run/sshd \
 && rm -f /etc/ssh/ssh_host_*

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /opt/dev-shell/entrypoint.sh
RUN chmod 0644 /etc/ssh/sshd_config && chmod 0755 /opt/dev-shell/entrypoint.sh

USER 1000
WORKDIR /home/dev
CMD ["/bin/sh", "/opt/dev-shell/entrypoint.sh"]
