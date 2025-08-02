import { BaseCommand, CommandContext } from './base';

export class ListReposCommand extends BaseCommand {
  getUsage(): string {
    return '/list-repos';
  }

  getDescription(): string {
    return 'クローン済みのリポジトリ一覧を表示します';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager } = context;

    try {
      const repositories = worktreeManager.getAvailableRepositories();

      if (repositories.length === 0) {
        await message.reply('📋 **リポジトリ一覧**\n\nクローン済みのリポジトリはありません。\n\n' +
          '💡 `/clone <repository_url> [directory]` でリポジトリをクローンできます。');
        return;
      }

      const repoList = repositories
        .map(repo => `• \`${repo}\``)
        .join('\n');

      await message.reply(`📋 **リポジトリ一覧** (${repositories.length}件)\n\n${repoList}\n\n` +
        `💡 **使い方**: \`repo_<リポジトリ名>\` チャンネルでスレッドを作成してコーディングを開始できます。`);

    } catch (error) {
      console.error(`❌ Error listing repositories: ${error}`);
      await message.reply(`❌ リポジトリ一覧の取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}