import { Client, GatewayIntentBits, Message } from 'discord.js';
import { ClaudeWrapper } from './claude-wrapper';

class DiscordClaudeBot {
  private client: Client;
  private claude: ClaudeWrapper;
  private botUserId?: string;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ]
    });

    this.claude = new ClaudeWrapper(
      process.env.CLAUDE_WORK_DIR || '/home/furikake/claude_code/git'
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      this.botUserId = this.client.user?.id;
      console.log(`✅ Bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      await this.handleMessage(message);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if bot is mentioned
    if (!this.isBotMentioned(message)) return;

    // Extract command from message (remove mention)
    const prompt = this.extractPrompt(message);
    if (!prompt.trim()) {
      await message.reply('何かお手伝いできることはありますか？');
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    try {
      console.log(`📝 Executing: ${prompt}`);
      const result = await this.claude.executeCommand(prompt);

      if (result.error) {
        await this.sendLongMessage(message, `❌ エラーが発生しました:\n\`\`\`\n${result.error}\n\`\`\``);
      } else if (result.output) {
        await this.sendLongMessage(message, result.output);
      } else {
        await message.reply('✅ コマンドが実行されましたが、出力はありませんでした。');
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
    
    // Remove bot mention
    if (this.botUserId) {
      content = content.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();
    }
    
    return content;
  }

  private async sendLongMessage(message: Message, content: string): Promise<void> {
    const maxLength = 2000;
    
    if (content.length <= maxLength) {
      await message.reply(content);
      return;
    }

    // Split long messages
    const chunks = this.splitMessage(content, maxLength);
    
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await message.reply(chunks[i]);
      } else {
        await message.channel.send(chunks[i]);
      }
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
        
        // If single line is too long, split it
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

// Start bot
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