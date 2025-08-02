import { Message } from 'discord.js';
import { WorktreeManager } from './worktree-manager';
import { BaseCommand, CommandContext } from './cmd/base';
import { CloneCommand } from './cmd/clone';
import { SwitchCommand } from './cmd/switch';
import { QuitCommand } from './cmd/quit';
import { ListReposCommand } from './cmd/list-repos';
import { ListBranchesCommand } from './cmd/list-branches';

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
    this.commands.set('list-repos', new ListReposCommand());
    this.commands.set('list-branches', new ListBranchesCommand());
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

      // helpコマンドは特別扱い
      if (commandName === 'help') {
        await this.handleHelpCommand(message, args);
        return;
      }

      // コマンドの存在確認
      const command = this.commands.get(commandName);
      if (!command) {
        await message.reply(`❌ 不明なコマンドです: \`${commandName}\`\n\n` +
          `💡 \`/help\` で利用可能なコマンド一覧を確認できます。`);
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
    return Array.from(this.commands.keys()).concat(['help']);
  }

  getCommand(commandName: string): BaseCommand | undefined {
    return this.commands.get(commandName);
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

  private async handleHelpCommand(message: Message<true>, args: string[]): Promise<void> {
    try {
      // 特定のコマンドのヘルプが要求された場合
      if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        await this.showCommandHelp(message, commandName);
        return;
      }

      // 全コマンドの一覧を表示
      await this.showAllCommands(message);
    } catch (error) {
      console.error(`❌ Error showing help: ${error}`);
      await message.reply(`❌ ヘルプの表示中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async showCommandHelp(message: Message<true>, commandName: string): Promise<void> {
    // helpコマンド自身の場合
    if (commandName === 'help') {
      const helpMessage = `📖 **コマンドヘルプ**: \`help\`\n\n` +
        `**使用法**: \`/help [command]\`\n` +
        `**説明**: 利用可能なコマンドの一覧または特定のコマンドの詳細を表示します\n\n` +
        `**例**:\n` +
        `• \`/help\`\n` +
        `• \`/help clone\``;
      
      await message.reply(helpMessage);
      return;
    }

    const command = this.commands.get(commandName);
    if (!command) {
      await message.reply(`❌ 不明なコマンドです: \`${commandName}\`\n\n` +
        `💡 \`/help\` で利用可能なコマンド一覧を確認できます。`);
      return;
    }

    // 動的にコマンド情報を取得
    const usage = command.getUsage();
    const description = command.getDescription();

    let helpMessage = `📖 **コマンドヘルプ**: \`${commandName}\`\n\n` +
      `**使用法**: \`${usage}\`\n` +
      `**説明**: ${description}`;

    await message.reply(helpMessage);
  }

  private async showAllCommands(message: Message<true>): Promise<void> {
    const availableCommands = this.getAvailableCommands();

    let helpMessage = `📋 **利用可能なコマンド**\n\n`;

    // コマンド一覧を表示
    for (const commandName of availableCommands) {
      if (commandName === 'help') {
        helpMessage += `• \`/help [command]\` - 利用可能なコマンドの一覧または特定のコマンドの詳細を表示します\n`;
      } else {
        const command = this.commands.get(commandName);
        if (command) {
          const usage = command.getUsage();
          const description = command.getDescription();
          helpMessage += `• \`${usage}\` - ${description}\n`;
        }
      }
    }
    helpMessage += '\n';

    await message.reply(helpMessage);
  }
}
