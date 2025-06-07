# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot that provides a thin wrapper around Claude Code functionality, allowing users to interact with Claude Code through Discord mentions and natural language.

## Architecture

- **Technology Stack**: Node.js + TypeScript + discord.js
- **Core Pattern**: Thin wrapper around `claude` CLI command
- **Interface**: Discord mentions with natural language prompts
- **Execution**: Direct subprocess execution of `claude` command

## Key Commands

```bash
# Development
npm install          # Install dependencies
npm run dev         # Run in development mode with ts-node
npm run build       # Compile TypeScript to JavaScript
npm start           # Run compiled JavaScript

# Linting
npm run lint        # Run ESLint on TypeScript files
```

## Core Components

### ClaudeWrapper (`src/claude-wrapper.ts`)
- Executes `claude` CLI commands via child processes
- Handles stdout/stderr capture and error management
- Configurable working directory for operations

### DiscordClaudeBot (`src/bot.ts`)
- Main bot class handling Discord integration
- Processes mentions and extracts prompts
- Splits long responses to fit Discord message limits
- Provides typing indicators and error handling

## Usage Pattern

Users interact with the bot by mentioning it in Discord:
```
@bot create a README file for this project
@bot fix the TypeScript errors in src/bot.ts
@bot search for Next.js 14 new features
```

## Environment Configuration

Required environment variables:
- `DISCORD_TOKEN`: Discord bot token
- `CLAUDE_WORK_DIR`: Optional working directory (defaults to /home/furikake/claude_code/git)

## Message Handling

- Bot responds only to messages that mention it
- Extracts natural language prompts by removing mention tags
- Passes prompts directly to Claude Code
- Handles long responses by splitting into multiple Discord messages (2000 char limit)

## Error Handling

- Captures and displays Claude Code stderr output
- Graceful handling of command execution failures
- User-friendly error messages in Discord