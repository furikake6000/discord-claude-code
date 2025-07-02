FROM mcr.microsoft.com/devcontainers/typescript-node:20

USER root

# Claude Code feature setup
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI using the devcontainer feature
RUN cd /tmp \
    && git clone https://github.com/anthropics/devcontainer-features.git \
    && cd devcontainer-features \
    && ./src/claude-code/install.sh

# Install jq for JSON parsing
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

# Switch back to node user
USER node

# Set working directory
WORKDIR /workspace

# Copy package files
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY --chown=node:node . .

# Copy and make init script executable
COPY --chown=node:node scripts/init-claude-auth.sh /home/node/init-claude-auth.sh
RUN chmod +x /home/node/init-claude-auth.sh

# Expose port
EXPOSE 3000

# Default command
CMD ["npm", "run", "dev"]