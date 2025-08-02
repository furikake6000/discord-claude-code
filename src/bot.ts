import { Client, GatewayIntentBits, Message, StageChannel, TextBasedChannel, GuildTextBasedChannel } from 'discord.js';
import { ClaudeSDKWrapper, StreamCallback } from './claude-sdk-wrapper';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

class DiscordClaudeBot {
  private client: Client;
  private claude: ClaudeSDKWrapper;
  private botUserId?: string;
  private threadSessionMap: Map<string, string> = new Map();
  private baseWorkingDir: string;
  
  // スレッド履歴フォールバック用の設定
  private static readonly MAX_HISTORY_MESSAGES = 20;
  private static readonly MAX_HISTORY_CHARS = 4000;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ]
    });

    // 環境変数またはデフォルトからベース作業ディレクトリを初期化
    this.baseWorkingDir = process.env.CLAUDE_WORK_DIR || path.join(process.cwd(), 'working_dir');
    this.claude = new ClaudeSDKWrapper();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      this.botUserId = this.client.user?.id;
      console.log(`✅ Bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      // ギルド以外のメッセージを無視
      if (!message.inGuild) return;

      await this.handleMessage(message as Message<true>);
    });
  }

  private async handleMessage(message: Message<true>): Promise<void> {
    console.log(`📨 Message received: "${message.content}" from ${message.author.tag}`);
    
    let channel = message.channel;
    // ステージチャンネルとフォーラムスレッドはスレッド対応していない
    if (channel instanceof StageChannel) {
      console.log(`🚫 This channel type is not supported. Ignoring message from ${message.author.tag}`)
      return;
    }

    // ボットメッセージを無視
    if (message.author.bot) {
      console.log(`🤖 Ignoring bot message from ${message.author.tag}`);
      return;
    }

    // ボットがメンションされているか確認（またはスレッド内にいるか）
    const isInThread = channel.isThread();
    if (!isInThread && !this.isBotMentioned(message)) {
      console.log(`🚫 Bot not mentioned in message: "${message.content}"`);
      return;
    }
    
    console.log(`✅ ${isInThread ? 'In thread' : 'Bot mentioned'}! Processing message from ${message.author.tag}`);

    // メッセージからコマンドを抽出（メンションがあれば削除）
    const prompt = this.extractPrompt(message);
    if (!prompt.trim()) {
      await message.reply('何かお手伝いできることはありますか？');
      return;
    }

    // タイピングインジケーターを表示
    await channel.sendTyping();

    try {
      console.log(`📝 Executing: ${prompt}`);
      
      if (!isInThread) {
        // まだスレッド内にいない場合はスレッドを開始
        const thread = await message.startThread({
          name: `Claude Code: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`,
        });
        channel = thread;
      }

      // チャンネル名に基づいてワークスペースを決定し、検証
      const workspacePath = this.getWorkspaceForChannel(channel);
      const isWorkspaceValid = await this.validateWorkspace(workspacePath);
      
      if (!isWorkspaceValid) {
        await message.reply(`❌ ワークスペースディレクトリが見つかりません: \`${workspacePath}\`\n\n` +
          `💡 **ヒント**: チャンネル名が \`dev_\` で始まる場合、対応するプロジェクトディレクトリが必要です。\n` +
          `例: \`dev_sample_repo\` → \`${this.baseWorkingDir}/sample_repo/\``);
        return;
      }
      
      // 作業ディレクトリはexecuteCommandWithStreamingに直接渡される
      console.log(`🔄 Using workspace: ${workspacePath}`);

      // スレッド内にいて既存のセッションがあるかチェック
      const threadId = isInThread ? channel.id : null;
      const existingSessionId = threadId ? this.threadSessionMap.get(threadId) : undefined;
      
      let finalPrompt = prompt;
      
      // スレッド内にいるがセッションIDがない場合、スレッド履歴を含める
      if (isInThread && !existingSessionId) {
        const threadHistory = await this.getThreadHistory(channel, message.id);
        if (threadHistory) {
          finalPrompt = `以下は過去の会話履歴です：\n\n${threadHistory}\n\n---\n\n${prompt}`;
          console.log(`📚 Added thread history to prompt (${threadHistory.length} chars)`);
        }
      }
      
      // ストリーミングコールバック設定
      //let thinkingMessage: Message | null = null;
      let toolsMessage: Message | null = null;
      //let assistantMessage: Message | null = null;
      //let lastThinkingContent = '';
      let lastAssistantContent = '';
      let toolsHistory: string[] = [];
      
      const callbacks: StreamCallback = {
        onThinking: async (content: string) => {
          await this.sendToChannel(channel, `💭 **思考過程:**\n\`\`\`\n${content}\`\`\``);
        },
        onAssistantMessage: async (text: string) => {
          if (text === lastAssistantContent) {
            // Claude Codeのストリーミングでは、同じ内容が繰り返されることがあるため、重複を避ける
            return;
          }
          lastAssistantContent = text;
          await this.sendToChannel(channel, text);
        },
        onToolUse: async (toolName: string, details: any) => {
          if (toolName === 'result') {
            // ツール結果の場合は詳細に表示しない
            return;
          }
          
          let toolDetail = `🔧 ${toolName}`;
          if (details.file_path) {
            toolDetail += ` → "${details.file_path}"`;
          } else if (details.path) {
            toolDetail += ` → "${details.path}"`;
          } else if (details.pattern) {
            toolDetail += ` → 検索: "${details.pattern}"`;
          } else if (details.command) {
            toolDetail += ` → "${details.command}"`;
          }
          
          // ツール履歴に追加（最新3件のみ保持）
          toolsHistory.push(toolDetail);
          if (toolsHistory.length > 3) {
            toolsHistory = toolsHistory.slice(-3);
          }
          
          const toolsText = `🔧 **ツール実行履歴:**\n\`\`\`\n${toolsHistory.join("\n")}\`\`\``;
          
          if (toolsMessage) {
            try {
              await toolsMessage.edit(toolsText);
            } catch (error) {
              console.warn('Failed to edit tools message:', error);
              toolsMessage = await channel.send(toolsText);
            }
          } else {
            toolsMessage = await channel.send(toolsText);
          }
        }
      };
      
      const result = await this.claude.executeCommandWithStreaming(finalPrompt, existingSessionId, callbacks, workspacePath);
      
      // このスレッドで将来使用するためにセッションIDを保存
      if (result.sessionId) {
        if (threadId) {
          this.threadSessionMap.set(threadId, result.sessionId);
        } else if (channel.isThread()) {
          // 新しいスレッドが作成された
          this.threadSessionMap.set(channel.id, result.sessionId);
        }
      }
      
      console.log(`✅ Command executed successfully: ${result.output || 'No output'}`);

      // 最終状態を更新
      if (result.error) {
        await this.sendToChannel(channel, `❌ **エラーが発生しました:**\n\`\`\`\n${result.error}\n\`\`\``);
      } else if (lastAssistantContent) {
        // ストリーミングで回答がある場合は、完了マークを追加
        await this.sendToChannel(channel, `✅ **回答完了**`);
      } else if (result.output) {
        // ストリーミング回答がなく、結果出力がある場合
        await this.sendToChannel(channel, `📝 **回答:**\n${result.output}\n\n✅ **完了**`);
      } else {
        await this.sendToChannel(channel, '✅ **処理完了** - 出力はありませんでした。');
      }
    } catch (error) {
      console.error('Error executing Claude command:', error);
      await message.reply('❌ Claude Codeの実行中にエラーが発生しました。');
    }
  }

  private isBotMentioned(message: Message): boolean {
    if (!this.botUserId) return false;
    return message.mentions.users.has(this.botUserId);
  }

  private extractPrompt(message: Message): string {
    let content = message.content;
    
    // ボットメンションを削除
    if (this.botUserId) {
      content = content.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();
    }
    
    return content;
  }

  private async sendToChannel(channel: GuildTextBasedChannel, content: string): Promise<void> {
    const maxLength = 2000;
    
    if (content.length <= maxLength) {
      await channel.send(content);
      return;
    }

    // 長いメッセージを分割
    const chunks = this.splitMessage(content, maxLength);
    
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    const lines = text.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // 単一行が長すぎる場合は分割
        if (line.length > maxLength) {
          chunks.push(...this.splitLongLine(line, maxLength));
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private splitLongLine(line: string, maxLength: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
    return chunks;
  }

  private async getThreadHistory(channel: TextBasedChannel, currentMessageId?: string): Promise<string> {
    if (!channel.isThread()) {
      return '';
    }

    try {
      const messages = await channel.messages.fetch({ 
        limit: DiscordClaudeBot.MAX_HISTORY_MESSAGES 
      });
      
      // 作成時間で並べ替え（古い順）
      const sortedMessages = Array.from(messages.values())
        .filter(msg => msg.id !== currentMessageId) // 現在のメッセージを除外
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let historyText = '';
      let totalChars = 0;

      for (const msg of sortedMessages) {
        // 空のメッセージまたはメンションのみのメッセージをスキップ
        if (!msg.content || msg.content.trim() === '') continue;
        
        // 作成者とコンテンツでメッセージをフォーマット
        const formattedMessage = `${msg.author.tag}: ${msg.content}\n`;
        
        // このメッセージを追加すると文字制限を超えるかチェック
        if (totalChars + formattedMessage.length > DiscordClaudeBot.MAX_HISTORY_CHARS) {
          break;
        }
        
        historyText += formattedMessage;
        totalChars += formattedMessage.length;
      }

      return historyText.trim();
    } catch (error) {
      console.error('Error fetching thread history:', error);
      return '';
    }
  }

  private getWorkspaceForChannel(channel: GuildTextBasedChannel): string {
    // スレッド内の場合、親チャンネル名を取得
    let channelName: string;
    if (channel.isThread()) {
      channelName = channel.parent?.name || channel.name;
      console.log(`📍 Thread detected. Using parent channel: ${channelName}`);
    } else {
      channelName = channel.name;
    }
    
    // チャンネル名が 'dev_' で始まるかチェック
    if (channelName.startsWith('dev_')) {
      // チャンネル名からプロジェクト名を抽出（'dev_' プレフィックスを削除）
      const projectName = channelName.substring(4);
      const projectWorkspace = path.join(this.baseWorkingDir, projectName);
      
      console.log(`🔄 Channel '${channelName}' detected as development channel. Project: ${projectName}`);
      console.log(`📁 Workspace: ${projectWorkspace}`);
      
      return projectWorkspace;
    }
    
    // 開発用以外のチャンネルの場合、ベース作業ディレクトリを使用
    console.log(`📁 Using base workspace: ${this.baseWorkingDir}`);
    return this.baseWorkingDir;
  }

  private async validateWorkspace(workspacePath: string): Promise<boolean> {
    try {
      // ワークスペースディレクトリが存在するかチェック
      if (!fs.existsSync(workspacePath)) {
        console.log(`⚠️  Workspace directory does not exist: ${workspacePath}`);
        return false;
      }
      
      // ディレクトリかどうかチェック
      const stats = fs.statSync(workspacePath);
      if (!stats.isDirectory()) {
        console.log(`⚠️  Workspace path is not a directory: ${workspacePath}`);
        return false;
      }
      
      console.log(`✅ Workspace validated: ${workspacePath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error validating workspace ${workspacePath}:`, error);
      return false;
    }
  }

  async start(): Promise<void> {
    const token = process.env.DISCORD_TOKEN;
    if (!token) {
      throw new Error('DISCORD_TOKEN environment variable is required');
    }

    await this.client.login(token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }
}

// ボット開始
async function main() {
  const bot = new DiscordClaudeBot();
  
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    await bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { DiscordClaudeBot };
