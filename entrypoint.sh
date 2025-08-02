#!/bin/bash

# Setup workspace directories
mkdir "/workspace/repos"
mkdir "/workspace/trees"

# Setup git authentication with GitHub CLI
gh auth setup-git

# Execute the original command
exec "$@"
