import { BaseCommand, CommandContext } from './base';
import { execSync } from 'child_process';

export class ListBranchesCommand extends BaseCommand {
  getUsage(): string {
    return '/list-branches';
  }

  getDescription(): string {
    return 'チャンネルに対応するリポジトリのworktreeブランチ一覧を表示します';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager } = context;

    // チャンネル名からリポジトリ名を取得
    let channelName: string;
    const isInThread = message.channel.isThread();
    if (isInThread) {
      channelName = message.channel.parent?.name || message.channel.name;
    } else {
      channelName = message.channel.name;
    }
    console.log(`Channel name: ${channelName}`);
    if (!channelName || !channelName.startsWith('repo_')) {
      await message.reply('❌ このチャンネルはリポジトリに対応していません。\n\n' +
        '💡 `repo_<リポジトリ名>` チャンネルでスレッドを作成してから実行してください。');
      return;
    }

    const repositoryName = channelName.replace('repo_', '');

    // リポジトリの存在確認
    if (!worktreeManager.isRepositoryExists(repositoryName)) {
      await message.reply(`❌ リポジトリが見つかりません: \`${repositoryName}\`\n\n` +
        `💡 \`/clone\` コマンドでリポジトリをクローンしてください。`);
      return;
    }

    try {
      // チャンネルIDを取得
      const channelId = isInThread ? message.channel.parentId! : message.channel.id;
      
      // チャンネルの全worktreeを取得
      const channelWorktrees = worktreeManager.getChannelWorktrees(channelId);
      
      // 現在のスレッドのworktree情報を取得
      const currentThreadId = isInThread ? message.channel.id : '';

      // チャンネル内の各worktreeで使用中のブランチを取得
      const worktreeBranches: { [threadId: string]: string } = {};
      for (const worktree of channelWorktrees) {
        try {
          const branch = execSync('git branch --show-current', {
            cwd: worktree.worktreePath,
            encoding: 'utf8'
          }).trim();
          worktreeBranches[worktree.threadId] = branch;
        } catch (error) {
          console.warn(`⚠️ Could not get branch for worktree ${worktree.threadId}: ${error}`);
        }
      }

      // worktree状態の表示
      let statusMessage = '';
      if (channelWorktrees.length > 0) {
        statusMessage = `\n\n🌳 **Worktree状態** (${channelWorktrees.length}個のスレッド):\n`;
        statusMessage += channelWorktrees
          .map(w => {
            const branch = worktreeBranches[w.threadId] || '不明';
            const isCurrent = w.threadId === currentThreadId;
            const indicator = isCurrent ? ' ← **現在**' : '';
            return `  • スレッド \`${w.threadId}\`: \`${branch}\`${indicator}`;
          })
          .join('\n');
      } else if (isInThread) {
        statusMessage = `\n\n💡 **Worktree未作成**: このスレッドでコーディングを開始するとworktreeが作成されます`;
      } else {
        statusMessage = `\n\n💡 **Worktree未作成**: このチャンネルでスレッドを作成してコーディングを開始するとworktreeが作成されます`;
      }

      await message.reply(statusMessage);

    } catch (error) {
      console.error(`❌ Error listing branches: ${error}`);
      await message.reply(`❌ ブランチ一覧の取得中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
