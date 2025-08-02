import { Client, GatewayIntentBits, Message } from 'discord.js';
import { ClaudeSDKWrapper } from './claude-sdk-wrapper';
import { MessageHandler } from './handle-message';
import * as dotenv from 'dotenv';

dotenv.config();

class DiscordClaudeBot {
  private client: Client;
  private claude: ClaudeSDKWrapper;
  private botUserId?: string;
  private threadSessionMap: Map<string, string> = new Map();
  private baseWorkingDir: string;
  private messageHandler: MessageHandler;

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
    this.baseWorkingDir = process.env.CLAUDE_WORK_DIR || '/workspace';
    this.claude = new ClaudeSDKWrapper();
    
    // MessageHandlerを初期化（botUserIdは後で設定）
    this.messageHandler = new MessageHandler(
      this.claude,
      this.botUserId,
      this.threadSessionMap,
      this.baseWorkingDir
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      this.botUserId = this.client.user?.id;
      // MessageHandlerのbotUserIdを更新
      this.messageHandler = new MessageHandler(
        this.claude,
        this.botUserId,
        this.threadSessionMap,
        this.baseWorkingDir
      );
      console.log(`✅ Bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      // ギルド以外のメッセージを無視
      if (!message.inGuild) return;

      await this.messageHandler.handleMessage(message as Message<true>);
    });
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
