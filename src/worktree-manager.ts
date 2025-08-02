import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface WorktreeInfo {
  channelId: string;
  threadId: string;
  repositoryName: string;
  worktreePath: string;
  repositoryPath: string;
}

export class WorktreeManager {
  private reposDir: string;
  private treesDir: string;

  constructor(baseWorkingDir: string) {
    this.reposDir = path.join(baseWorkingDir, 'repos');
    this.treesDir = path.join(baseWorkingDir, 'trees');
    
    // 必要なディレクトリを作成
    this.ensureDirectoriesExist();
  }

  private ensureDirectoriesExist(): void {
    try {
      if (!fs.existsSync(this.reposDir)) {
        fs.mkdirSync(this.reposDir, { recursive: true });
        console.log(`📁 Created repos directory: ${this.reposDir}`);
      }
      
      if (!fs.existsSync(this.treesDir)) {
        fs.mkdirSync(this.treesDir, { recursive: true });
        console.log(`📁 Created trees directory: ${this.treesDir}`);
      }
    } catch (error) {
      console.error('❌ Error creating workspace directories:', error);
      throw error;
    }
  }

  /**
   * リポジトリが存在するかチェック
   */
  isRepositoryExists(repositoryName: string): boolean {
    const repoPath = path.join(this.reposDir, repositoryName);
    return fs.existsSync(repoPath) && fs.statSync(repoPath).isDirectory();
  }

  /**
   * worktreeが存在するかチェック
   */
  isWorktreeExists(channelId: string, threadId: string): boolean {
    const worktreePath = this.getWorktreePath(channelId, threadId);
    return fs.existsSync(worktreePath) && fs.statSync(worktreePath).isDirectory();
  }

  /**
   * worktreeのパスを取得
   */
  getWorktreePath(channelId: string, threadId: string): string {
    return path.join(this.treesDir, channelId, threadId);
  }

  /**
   * リポジトリのパスを取得
   */
  getRepositoryPath(repositoryName: string): string {
    return path.join(this.reposDir, repositoryName);
  }

  /**
   * ブランチが存在するかチェック
   */
  private branchExists(repositoryPath: string, branchName: string): boolean {
    try {
      // ローカルブランチとリモートブランチの両方をチェック
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: repositoryPath,
        stdio: 'pipe'
      });
      return true;
    } catch {
      try {
        // リモートブランチをチェック
        execSync(`git show-ref --verify --quiet refs/remotes/origin/${branchName}`, {
          cwd: repositoryPath,
          stdio: 'pipe'
        });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * worktreeを作成
   */
  async createWorktree(repositoryName: string, channelId: string, threadId: string, branch: string = ''): Promise<WorktreeInfo> {
    // デフォルトではブランチ名はthreadIdと同じ
    if (!branch) {
      branch = threadId;
    }
    
    const repositoryPath = this.getRepositoryPath(repositoryName);
    const worktreePath = this.getWorktreePath(channelId, threadId);

    // リポジトリの存在確認
    if (!this.isRepositoryExists(repositoryName)) {
      throw new Error(`Repository ${repositoryName} does not exist in ${repositoryPath}`);
    }

    // 既にworktreeが存在する場合はそのまま使用
    if (this.isWorktreeExists(channelId, threadId)) {
      console.log(`✅ Worktree already exists, using existing: ${worktreePath}`);
      return {
        channelId,
        threadId,
        repositoryName,
        worktreePath,
        repositoryPath
      };
    }

    try {
      // worktreeディレクトリの親ディレクトリを作成
      const parentDir = path.dirname(worktreePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // ブランチの存在確認
      if (!this.branchExists(repositoryPath, branch)) {
        console.log(`🌿 Branch ${branch} does not exist, creating from main`);
        // ブランチが存在しない場合はmainから新しいブランチを作成してworktreeを作成
        execSync(`git worktree add "${worktreePath}" -b ${branch} main`, {
          cwd: repositoryPath,
          stdio: 'pipe'
        });
      } else {
        // ブランチが存在する場合は通常のworktree作成
        console.log(`🌳 Creating worktree: ${worktreePath} from ${repositoryPath}:${branch}`);
        execSync(`git worktree add "${worktreePath}" ${branch}`, {
          cwd: repositoryPath,
          stdio: 'pipe'
        });
      }

      console.log(`✅ Worktree created successfully: ${worktreePath}`);

      return {
        channelId,
        threadId,
        repositoryName,
        worktreePath,
        repositoryPath
      };
    } catch (error) {
      console.error(`❌ Error creating worktree: ${error}`);
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * worktreeを削除
   */
  async removeWorktree(repositoryName: string, channelId: string, threadId: string): Promise<void> {
    const worktreePath = this.getWorktreePath(channelId, threadId);
    const repositoryPath = this.getRepositoryPath(repositoryName);

    if (!this.isWorktreeExists(channelId, threadId)) {
      console.log(`⚠️ Worktree does not exist: ${worktreePath}`);
      return;
    }

    if (!this.isRepositoryExists(repositoryName)) {
      throw new Error(`Repository ${repositoryName} does not exist in ${repositoryPath}`);
    }

    try {
      // git worktree removeコマンドでworktreeを削除
      console.log(`🗑️ Removing worktree: ${worktreePath}`);
      execSync(`git worktree remove "${worktreePath}"`, {
        cwd: repositoryPath,
        stdio: 'pipe'
      });

      // 親ディレクトリが空の場合は削除
      const parentDir = path.dirname(worktreePath);
      try {
        if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
          fs.rmdirSync(parentDir);
        }
      } catch (error) {
        // 親ディレクトリの削除に失敗しても継続
        console.warn(`⚠️ Could not remove parent directory: ${parentDir}`);
      }

      console.log(`✅ Worktree removed successfully: ${worktreePath}`);
    } catch (error) {
      console.error(`❌ Error removing worktree: ${error}`);
      throw new Error(`Failed to remove worktree: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * worktree情報を取得
   */
  getWorktreeInfo(repositoryName: string, channelId: string, threadId: string): WorktreeInfo | null {
    if (!this.isWorktreeExists(channelId, threadId)) {
      return null;
    }

    return {
      channelId,
      threadId,
      repositoryName,
      worktreePath: this.getWorktreePath(channelId, threadId),
      repositoryPath: this.getRepositoryPath(repositoryName)
    };
  }

  /**
   * 利用可能なリポジトリ一覧を取得
   */
  getAvailableRepositories(): string[] {
    try {
      if (!fs.existsSync(this.reposDir)) {
        return [];
      }

      return fs.readdirSync(this.reposDir).filter(item => {
        const itemPath = path.join(this.reposDir, item);
        return fs.statSync(itemPath).isDirectory();
      });
    } catch (error) {
      console.error('❌ Error listing repositories:', error);
      return [];
    }
  }

  /**
   * worktreeでブランチを切り替え
   */
  async switchBranch(channelId: string, threadId: string, branch: string): Promise<void> {
    const worktreePath = this.getWorktreePath(channelId, threadId);

    if (!this.isWorktreeExists(channelId, threadId)) {
      throw new Error(`Worktree does not exist: ${worktreePath}`);
    }

    try {
      console.log(`🔄 Switching to branch ${branch} in worktree: ${worktreePath}`);
      execSync(`git checkout ${branch}`, {
        cwd: worktreePath,
        stdio: 'pipe'
      });
      console.log(`✅ Successfully switched to branch: ${branch}`);
    } catch (error) {
      console.error(`❌ Error switching branch: ${error}`);
      throw new Error(`Failed to switch to branch ${branch}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 指定したチャンネルの全worktreeを取得
   */
  getChannelWorktrees(channelId: string): WorktreeInfo[] {
    try {
      const channelDir = path.join(this.treesDir, channelId);
      
      // チャンネルディレクトリが存在しない場合は空配列を返す
      if (!fs.existsSync(channelDir)) {
        return [];
      }

      const worktrees: WorktreeInfo[] = [];
      const threadIds = fs.readdirSync(channelDir).filter(item => {
        const itemPath = path.join(channelDir, item);
        return fs.statSync(itemPath).isDirectory();
      });

      for (const threadId of threadIds) {
        const worktreePath = this.getWorktreePath(channelId, threadId);
        
        // worktreeが実際に存在し、有効であるかチェック
        if (fs.existsSync(worktreePath) && fs.statSync(worktreePath).isDirectory()) {
          // worktreeが属するリポジトリを特定
          const repositoryName = this.findRepositoryForWorktree(worktreePath);
          
          if (repositoryName) {
            worktrees.push({
              channelId,
              threadId,
              repositoryName,
              worktreePath,
              repositoryPath: this.getRepositoryPath(repositoryName)
            });
          }
        }
      }

      return worktrees;
    } catch (error) {
      console.error(`❌ Error getting channel worktrees for ${channelId}: ${error}`);
      return [];
    }
  }

  /**
   * worktreeパスからそれが属するリポジトリ名を特定
   */
  private findRepositoryForWorktree(worktreePath: string): string | null {
    try {
      // git worktree listを使用して、worktreeが属するリポジトリを特定
      const repositories = this.getAvailableRepositories();
      
      for (const repositoryName of repositories) {
        const repositoryPath = this.getRepositoryPath(repositoryName);
        
        try {
          // git worktree listでworktreeの一覧を取得
          const worktreeList = execSync('git worktree list --porcelain', {
            cwd: repositoryPath,
            encoding: 'utf8'
          });

          // worktreeListから該当するパスを検索
          const lines = worktreeList.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('worktree ') && line.includes(worktreePath)) {
              return repositoryName;
            }
          }
        } catch (error) {
          // このリポジトリでの検索でエラーが発生した場合は次のリポジトリへ
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Error finding repository for worktree ${worktreePath}: ${error}`);
      return null;
    }
  }
}
