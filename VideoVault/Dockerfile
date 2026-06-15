# Development Dockerfile with hot reload support
FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Install dependencies for native modules and tools
# Add curl for healthchecks and tooling for native modules
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  python3 \
  build-essential \
  ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./

# Install dependencies (upgrade npm to avoid 404 tarball issues)
# Ensure devDependencies are installed by not setting NODE_ENV=production
RUN npm install -g npm@11 && NODE_ENV=development npm install --legacy-peer-deps

# Create directories that will be mounted as volumes
RUN mkdir -p client server docs /app/shared/videovault

# Copy initial source code (will be overridden by volume mounts in development)
COPY client/ ./client/
COPY server/ ./server/
COPY scripts/ ./scripts/

# Expose port for development server
EXPOSE 5000

# Development command with hot reload
CMD ["npm", "run", "dev"]
