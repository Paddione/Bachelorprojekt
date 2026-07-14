FROM node:22-bookworm

# Install go-task
RUN apt-get update && apt-get install -y curl && \
    sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Playwright dependencies (and playwright package to install system dependencies)
RUN npm install -g playwright && npx playwright install-deps

WORKDIR /work
