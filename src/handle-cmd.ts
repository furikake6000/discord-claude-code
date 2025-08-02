import { Message } from 'discord.js';
import { WorktreeManager } from './worktree-manager';
import { BaseCommand, CommandContext } from './cmd/base';
import { CloneCommand } from './cmd/clone';
import { SwitchCommand } from './cmd/switch';
import { QuitCommand } from './cmd/quit';

export class CommandHandler {
  private worktreeManager: WorktreeManager;
  private baseWorkingDir: string;
  private commands: Map<string, BaseCommand> = new Map();

  constructor(worktreeManager: WorktreeManager, baseWorkingDir: string) {
    this.worktreeManager = worktreeManager;
    this.baseWorkingDir = baseWorkingDir;
    
    // コマンドを登録
    this.registerCommands();
  }

  private registerCommands(): void {
    this.commands.set('clone', new CloneCommand());
    this.commands.set('switch', new SwitchCommand());
    this.commands.set('quit', new QuitCommand());
  }

  async handleCommand(message: Message<true>): Promise<void> {
    try {
      const content = message.content.trim();
      
      // コマンドプレフィックスを削除
      if (!content.startsWith('/')) {
        await message.reply('❌ コマンドは `/` で始まる必要があります。');
        return;
      }

      // コマンドと引数をパース
      const parts = content.slice(1).split(/\s+/);
      const commandName = parts[0].toLowerCase();
      const args = parts.slice(1);

      console.log(`🔧 Processing command: ${commandName} with args: [${args.join(', ')}]`);

      // コマンドの存在確認
      const command = this.commands.get(commandName);
      if (!command) {
        await message.reply(`❌ 不明なコマンドです: \`${commandName}\`\n\n` +
          `利用可能なコマンド:\n` +
          `• \`/clone <repository_url> [directory]\` - リポジトリをクローン\n` +
          `• \`/switch [-c] [branch_name]\` - ブランチを切り替え（スレッド内のみ）\n` +
          `• \`/quit\` - 現在のworktreeを削除（スレッド内のみ）`);
        return;
      }

      // コマンドコンテキストを作成
      const context: CommandContext = {
        message,
        worktreeManager: this.worktreeManager,
        baseWorkingDir: this.baseWorkingDir,
        args,
        commandName
      };

      // コマンドを実行
      await command.execute(context);

    } catch (error) {
      console.error(`❌ Error executing command: ${error}`);
      await message.reply(`❌ コマンドの実行中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  getCommandHelp(commandName: string): string | null {
    const command = this.commands.get(commandName);
    if (!command) {
      return null;
    }
    
    return `**${commandName}**\n` +
           `使用法: ${command.getUsage()}\n` +
           `説明: ${command.getDescription()}`;
  }
}
