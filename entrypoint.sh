#!/bin/bash

# Setup workspace directories
mkdir -p "/workspace/repos"
mkdir -p "/workspace/trees"

# Setup git authentication with GitHub CLI
gh auth setup-git

# Setup git configuration
git config --global user.name "${GIT_USER_NAME:-"Discord Claude Code Bot"}"
git config --global user.email "${GIT_USER_EMAIL:-"discord-claude-code-bot@example.com"}"

# Execute the original command
exec "$@"
