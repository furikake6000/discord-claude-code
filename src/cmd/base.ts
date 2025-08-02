import { Message } from 'discord.js';
import { WorktreeManager } from '../worktree-manager';

export interface CommandContext {
  message: Message<true>;
  worktreeManager: WorktreeManager;
  baseWorkingDir: string;
  args: string[];
  commandName: string;
}

export abstract class BaseCommand {
  abstract execute(context: CommandContext): Promise<void>;
  abstract getUsage(): string;
  abstract getDescription(): string;
}
