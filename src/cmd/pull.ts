import { BaseCommand, CommandContext } from './base';
import { execSync } from 'child_process';

export class PullCommand extends BaseCommand {
  getUsage(): string {
    return '/pull';
  }

  getDescription(): string {
    return 'チャンネルに対応するリポジトリの最新のベースブランチをpullします';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager } = context;

    try {
      const channel = message.channel;
      let channelName: string;

      // チャンネル名を取得
      if (channel.isThread()) {
        channelName = channel.parent?.name || channel.name;
      } else {
        channelName = channel.name;
      }

      // repo_チャンネル以外は対象外
      if (!channelName.startsWith('repo_')) {
        await message.reply('❌ このコマンドは `repo_` で始まるチャンネルでのみ使用できます。');
        return;
      }

      // リポジトリ名を抽出
      const repositoryName = channelName.substring(5);

      // リポジトリの存在確認
      if (!worktreeManager.isRepositoryExists(repositoryName)) {
        await message.reply(`❌ リポジトリが見つかりません: \`${repositoryName}\`\n\n` +
          `💡 \`/clone\` コマンドでリポジトリをクローンしてください。`);
        return;
      }

      const repositoryPath = worktreeManager.getRepositoryPath(repositoryName);

      console.log(`🔄 Executing git pull in: ${repositoryPath}`);

      // 実行中メッセージを送信
      const statusMsg = await message.reply('🔄 **Git Pull 実行中...**\n⏳ 処理を開始しています...');

      // ベースブランチを特定（main または master）
      let baseBranch: string;
      try {
        const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD', { 
          cwd: repositoryPath, 
          encoding: 'utf8' 
        }).trim().replace('refs/remotes/origin/', '');
        baseBranch = defaultBranch;
      } catch {
        // デフォルトブランチが取得できない場合はmainを試す
        try {
          execSync('git rev-parse --verify origin/main', { 
            cwd: repositoryPath, 
            stdio: 'pipe' 
          });
          baseBranch = 'main';
        } catch {
          try {
            execSync('git rev-parse --verify origin/master', { 
              cwd: repositoryPath, 
              stdio: 'pipe' 
            });
            baseBranch = 'master';
          } catch {
            await statusMsg.edit('❌ ベースブランチ（main/master）が見つかりません。');
            return;
          }
        }
      }

      // 現在のブランチを確認
      const currentBranch = execSync('git branch --show-current', { 
        cwd: repositoryPath, 
        encoding: 'utf8' 
      }).trim();

      let statusMessage = `🔄 **Git Pull 実行中...**\n`;
      statusMessage += `📁 リポジトリ: \`${repositoryName}\`\n`;
      statusMessage += `🌿 ベースブランチ: \`${baseBranch}\`\n`;
      statusMessage += `📍 現在のブランチ: \`${currentBranch}\`\n\n`;

      await statusMsg.edit(statusMessage + '⏳ リモートから最新の情報を取得しています...');

      // git fetch
      execSync('git fetch origin', { 
        cwd: repositoryPath, 
        encoding: 'utf8' 
      });

      await statusMsg.edit(statusMessage + '⏳ ベースブランチをpullしています...');

      // ベースブランチに切り替えてpull
      if (currentBranch !== baseBranch) {
        execSync(`git checkout ${baseBranch}`, { cwd: repositoryPath });
      }
      
      const pullOutput = execSync(`git pull origin ${baseBranch}`, { 
        cwd: repositoryPath, 
        encoding: 'utf8' 
      });

      // 元のブランチに戻る（もし違うブランチにいた場合）
      if (currentBranch !== baseBranch && currentBranch) {
        execSync(`git checkout ${currentBranch}`, { cwd: repositoryPath });
      }

      let resultMessage = `✅ **Git Pull 完了！**\n\n`;
      resultMessage += `📁 リポジトリ: \`${repositoryName}\`\n`;
      resultMessage += `🌿 ベースブランチ: \`${baseBranch}\`\n`;
      resultMessage += `📍 復帰ブランチ: \`${currentBranch}\`\n\n`;
      
      if (pullOutput.includes('Already up to date')) {
        resultMessage += '📋 **結果**: すでに最新の状態でした。';
      } else {
        resultMessage += `📋 **Pull結果**:\n\`\`\`\n${pullOutput.trim()}\`\`\``;
      }

      await statusMsg.edit(resultMessage);
      console.log(`✅ Git pull completed successfully in: ${repositoryPath}`);

    } catch (error) {
      console.error('Error executing git pull:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await message.reply(`❌ **Git pullの実行中にエラーが発生しました:**\n\`\`\`\n${errorMessage}\n\`\`\``);
    }
  }
}