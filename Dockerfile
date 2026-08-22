FROM node:20-slim

# Install git, Java JDK, Python, Maven, and basic deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    default-jdk-headless \
    maven \
    python3 \
    python3-pip \
    python3-venv \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && pip install --break-system-packages pygbag \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json .npmrc ./

# Install dependencies (skip optional playwright in Docker by default)
RUN npm ci --omit=optional || npm install --omit=optional

# Copy the rest of the app
COPY . .

# Create workspace and logs dirs
RUN mkdir -p workspace logs

# Default port
ENV PORT=3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/api/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "server/index.js", "--no-mcp"]
