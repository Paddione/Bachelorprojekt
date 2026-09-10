# docker/dev-shell/Dockerfile — SSH-erreichbarer Dev-Container des dev-pod [T900108]
# Alles zur Bauzeit (Requirement "Container images carry their dependencies").
FROM node:22-bookworm-slim

# Exakt gepinnte Werkzeugversionen; Binaerartefakte werden gegen die Pruefsummen
# ihres Releases geprueft (keine Installer-Skripte, kein Fremd-apt-Repo).
ARG KUBECTL_VERSION=v1.36.1
ARG CLAUDE_CODE_VERSION=2.1.267
ARG TASK_VERSION=3.53.1
ARG GH_VERSION=2.100.0
ARG PNPM_VERSION=12.3.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-server git git-crypt bash curl ca-certificates jq less vim-tiny tmux \
      netcat-openbsd postgresql-client \
 && rm -rf /var/lib/apt/lists/*

RUN set -eu; cd /tmp \
 && curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && curl -fsSLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256" \
 && echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c - \
 && install -m 0755 kubectl /usr/local/bin/kubectl \
 && curl -fsSLO "https://github.com/go-task/task/releases/download/v${TASK_VERSION}/task_linux_amd64.tar.gz" \
 && curl -fsSLO "https://github.com/go-task/task/releases/download/v${TASK_VERSION}/task_checksums.txt" \
 && grep ' task_linux_amd64.tar.gz$' task_checksums.txt | sha256sum -c - \
 && tar -xzf task_linux_amd64.tar.gz task \
 && install -m 0755 task /usr/local/bin/task \
 && curl -fsSLO "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
 && curl -fsSLO "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_checksums.txt" \
 && grep " gh_${GH_VERSION}_linux_amd64.tar.gz\$" "gh_${GH_VERSION}_checksums.txt" | sha256sum -c - \
 && tar -xzf "gh_${GH_VERSION}_linux_amd64.tar.gz" \
 && install -m 0755 "gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
 && cd / && rm -rf /tmp/* \
 && npm install -g --no-audit --no-fund "pnpm@${PNPM_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force

# Zwei Login-Namen auf uid 1000: sshd ohne root prueft getuid()==pw_uid, nicht den Namen.
# Shadow '*': sshd ohne root liest /etc/shadow nicht; '*' statt '!' haelt das Konto
# auch fuer root-basierte Werkzeuge "ohne Passwort", nicht "gesperrt".
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
