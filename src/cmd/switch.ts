import { BaseCommand, CommandContext } from '../handle-cmd';
import { execSync } from 'child_process';

export class SwitchCommand extends BaseCommand {
  getUsage(): string {
    return '/switch [-c] [branch_name]';
  }

  getDescription(): string {
    return 'ブランチを切り替えます（スレッド内のみ）。-cオプションで新しいブランチを作成';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager, args } = context;

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
      await message.reply(`❌ このスレッドにはworktreeが作成されていません。\n\n` +
        `通常のメッセージを送信するとworktreeが自動作成されます。`);
      return;
    }

    try {
      let createBranch = false;
      let branchName = '';
      
      // 引数をパース
      let argIndex = 0;
      if (args.length > 0 && args[0] === '-c') {
        createBranch = true;
        argIndex = 1;
      }
      
      if (args.length > argIndex) {
        branchName = args[argIndex];
      }

      const worktreePath = worktreeManager.getWorktreePath(channelId, threadId);
      const repositoryPath = worktreeManager.getRepositoryPath(repositoryName);

      if (createBranch) {
        if (!branchName) {
          await message.reply(`❌ 新しいブランチ名を指定してください。\n\n` +
            `使用法: \`/switch -c <new_branch_name>\``);
          return;
        }

        // ブランチ名の検証
        if (!/^[a-zA-Z0-9_/-]+$/.test(branchName)) {
          await message.reply('❌ ブランチ名は英数字、アンダースコア、ハイフン、スラッシュのみ使用できます。');
          return;
        }

        // ブランチが既に存在するかチェック
        try {
          execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
            cwd: repositoryPath,
            stdio: 'pipe'
          });
          await message.reply(`❌ ブランチ \`${branchName}\` は既に存在しています。`);
          return;
        } catch (error) {
          // ブランチが存在しない場合（期待される動作）
        }

        await message.reply(`🔄 新しいブランチ \`${branchName}\` を作成して切り替えています...`);

        // 新しいブランチを作成して切り替え
        execSync(`git checkout -b ${branchName}`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });

        console.log(`✅ Created and switched to new branch: ${branchName} in ${worktreePath}`);
        await message.reply(`✅ **ブランチ作成・切り替え完了**\n` +
          `新しいブランチ: \`${branchName}\`\n\n` +
          `💡 このworktreeで作業を開始できます。`);

      } else {
        if (!branchName) {
          await message.reply(`❌ 切り替え先のブランチ名を指定してください。\n\n` +
            `使用法: \`/switch <branch_name>\`\n` +
            `新しいブランチを作成する場合: \`/switch -c <new_branch_name>\``);
          return;
        }

        // ブランチが存在するかチェック
        try {
          execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
            cwd: repositoryPath,
            stdio: 'pipe'
          });
        } catch (error) {
          await message.reply(`❌ ブランチ \`${branchName}\` が存在しません。\n\n` +
            `新しいブランチを作成する場合: \`/switch -c ${branchName}\``);
          return;
        }

        await message.reply(`🔄 ブランチ \`${branchName}\` に切り替えています...`);

        // 既存ブランチに切り替え
        execSync(`git checkout ${branchName}`, {
          cwd: worktreePath,
          stdio: 'pipe'
        });

        console.log(`✅ Switched to branch: ${branchName} in ${worktreePath}`);
        await message.reply(`✅ **ブランチ切り替え完了**\n` +
          `現在のブランチ: \`${branchName}\``);
      }

    } catch (error) {
      console.error(`❌ Error switching branch: ${error}`);
      await message.reply(`❌ ブランチの切り替えに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}