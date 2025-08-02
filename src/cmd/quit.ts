import { BaseCommand, CommandContext } from '../handle-cmd';

export class QuitCommand extends BaseCommand {
  getUsage(): string {
    return '/quit';
  }

  getDescription(): string {
    return '現在のスレッドのworktreeを削除します（スレッド内のみ）';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager } = context;

    // スレッド内でのみ実行可能
    if (!message.channel.isThread()) {
      await message.reply(`❌ このコマンドはスレッド内でのみ実行できます。\n\n` +
        `リポジトリチャンネル（\`repo_\` で始まる）でスレッドを作成してから実行してください。`);
      return;
    }

    // チャンネル名からリポジトリ名を取得
    const channelName = message.channel.parent?.name || message.channel.name;
    if (!channelName.startsWith('repo_')) {
      await message.reply(`❌ このコマンドはリポジトリチャンネル（\`repo_\` で始まる）内でのみ実行できます。`);
      return;
    }

    const repositoryName = channelName.substring(5);
    const channelId = message.channel.parent?.id || message.channel.id;
    const threadId = message.channel.id;

    // リポジトリの存在確認
    if (!worktreeManager.isRepositoryExists(repositoryName)) {
      await message.reply(`❌ リポジトリが見つかりません: \`${repositoryName}\`\n\n` +
        `\`/clone\` コマンドでリポジトリをクローンしてください。`);
      return;
    }

    // worktreeの存在確認
    if (!worktreeManager.isWorktreeExists(channelId, threadId)) {
      await message.reply(`⚠️ このスレッドにはworktreeが存在しません。\n\n` +
        `既に削除されているか、まだ作成されていません。`);
      return;
    }

    try {
      const worktreePath = worktreeManager.getWorktreePath(channelId, threadId);
      
      await message.reply(`🔄 Worktreeを削除しています: \`${worktreePath}\`\n\n` +
        `⚠️ **注意**: この操作は元に戻せません。`);

      // worktreeを削除
      await worktreeManager.removeWorktree(repositoryName, channelId, threadId);

      console.log(`✅ Worktree removed for thread ${threadId} in channel ${channelId}`);
      
      await message.reply(`✅ **Worktree削除完了**\n` +
        `削除されたパス: \`${worktreePath}\`\n\n` +
        `💡 **次回**: 新しいメッセージを送信すると、新しいworktreeが自動作成されます。`);

    } catch (error) {
      console.error(`❌ Error removing worktree: ${error}`);
      
      let errorMessage = `❌ **Worktreeの削除に失敗しました**\n`;
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase();
        if (errorText.includes('not found') || errorText.includes('does not exist')) {
          errorMessage += `Worktreeが見つかりません。既に削除されている可能性があります。`;
        } else {
          errorMessage += `エラー: ${error.message}`;
        }
      } else {
        errorMessage += `不明なエラーが発生しました。`;
      }

      await message.reply(errorMessage);
    }
  }
}