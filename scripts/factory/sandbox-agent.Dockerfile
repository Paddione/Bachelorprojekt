FROM node:22-bookworm
RUN apt-get update && apt-get install -y go-task curl git jq && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code opencode
WORKDIR /work
USER 1000:1000
