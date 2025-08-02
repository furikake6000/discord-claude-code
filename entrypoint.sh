#!/bin/bash

# Setup workspace directories
mkdir -p "/workspace/repos"
mkdir -p "/workspace/trees"

# Setup git authentication with GitHub CLI
gh auth setup-git

# Execute the original command
exec "$@"
