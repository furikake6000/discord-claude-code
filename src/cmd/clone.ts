import { BaseCommand, CommandContext } from './base';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class CloneCommand extends BaseCommand {
  getUsage(): string {
    return '/clone <repository_url> [directory]';
  }

  getDescription(): string {
    return 'リポジトリをworkspace/repos/にクローンします';
  }

  async execute(context: CommandContext): Promise<void> {
    const { message, worktreeManager, args } = context;

    if (args.length === 0) {
      await message.reply(`❌ リポジトリURLが指定されていません。\n\n` +
        `使用法: \`${this.getUsage()}\`\n` +
        `例: \`/clone https://github.com/user/repo.git my-repo\``);
      return;
    }

    const repositoryUrl = args[0];
    let directoryName = args[1];

    // ディレクトリ名が指定されていない場合、URLから推測
    if (!directoryName) {
      const urlParts = repositoryUrl.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      directoryName = lastPart.replace(/\.git$/, '');
      
      if (!directoryName) {
        await message.reply('❌ リポジトリ名を推測できませんでした。ディレクトリ名を明示的に指定してください。');
        return;
      }
    }

    // ディレクトリ名の検証
    if (!/^[a-zA-Z0-9_-]+$/.test(directoryName)) {
      await message.reply('❌ ディレクトリ名は英数字、アンダースコア、ハイフンのみ使用できます。');
      return;
    }

    const targetPath = worktreeManager.getRepositoryPath(directoryName);

    try {
      // 既存ディレクトリの確認
      if (fs.existsSync(targetPath)) {
        await message.reply(`❌ ディレクトリが既に存在します: \`${directoryName}\`\n\n` +
          `既存のリポジトリを確認するか、別の名前を指定してください。`);
        return;
      }

      await message.reply(`🔄 リポジトリをクローンしています: \`${repositoryUrl}\` → \`${directoryName}\``);

      // クローン実行
      console.log(`📦 Cloning repository: ${repositoryUrl} to ${targetPath}`);
      
      // 親ディレクトリを確認・作成
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      execSync(`git clone "${repositoryUrl}" "${directoryName}"`, {
        cwd: parentDir,
        stdio: 'pipe'
      });

      console.log(`✅ Repository cloned successfully: ${targetPath}`);
      
      await message.reply(`✅ **クローン完了**\n` +
        `リポジトリ: \`${repositoryUrl}\`\n` +
        `ディレクトリ: \`${directoryName}\`\n\n` +
        `💡 **次のステップ**: \`repo_${directoryName}\` チャンネルでスレッドを作成してコーディングを開始できます。`);

    } catch (error) {
      console.error(`❌ Error cloning repository: ${error}`);
      
      // 失敗時にディレクトリが作成されている場合は削除
      try {
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Could not cleanup failed clone directory: ${cleanupError}`);
      }

      let errorMessage = `❌ **リポジトリのクローンに失敗しました**\n`;
      
      if (error instanceof Error) {
        const errorText = error.message.toLowerCase();
        if (errorText.includes('not found') || errorText.includes('404')) {
          errorMessage += `リポジトリが見つかりません。URLを確認してください。`;
        } else if (errorText.includes('permission') || errorText.includes('authentication')) {
          errorMessage += `アクセス権限がありません。プライベートリポジトリの場合は認証が必要です。`;
        } else if (errorText.includes('network') || errorText.includes('connection')) {
          errorMessage += `ネットワークエラーが発生しました。接続を確認してください。`;
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
