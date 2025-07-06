#!/bin/bash

# Setup git authentication with GitHub CLI
gh auth setup-git

# Execute the original command
exec "$@"