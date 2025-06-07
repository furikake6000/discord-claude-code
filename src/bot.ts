import { Client, GatewayIntentBits, Message, TextBasedChannel } from 'discord.js';
import { ClaudeWrapper } from './claude-wrapper';
import * as dotenv from 'dotenv';

dotenv.config();

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
        GatewayIntentBits.DirectMessages,
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
    console.log(`📨 Message received: "${message.content}" from ${message.author.tag}`);
    
    // Ignore bot messages
    if (message.author.bot) {
      console.log(`🤖 Ignoring bot message from ${message.author.tag}`);
      return;
    }

    // Check if bot is mentioned
    if (!this.isBotMentioned(message)) {
      console.log(`🚫 Bot not mentioned in message: "${message.content}"`);
      return;
    }
    
    console.log(`✅ Bot mentioned! Processing message from ${message.author.tag}`);

    // Extract command from message (remove mention)
    const prompt = this.extractPrompt(message);
    if (!prompt.trim()) {
      await message.reply('何かお手伝いできることはありますか？');
      return;
    }

    // Show typing indicator
    if ('sendTyping' in message.channel) {
      await message.channel.sendTyping();
    }

    try {
      console.log(`📝 Executing: ${prompt}`);
      
      // Post the prompt that will be sent to Claude Code
      const isInThread = message.channel.isThread();
      let responseChannel = message.channel;
      
      if (!isInThread && 'startThread' in message) {
        // Start a thread if not already in one
        const thread = await message.startThread({
          name: `Claude Code: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`,
        });
        responseChannel = thread;
      }

      const result = await this.claude.executeCommand(prompt);
      
      console.log(`✅ Command executed successfully: ${result.output || 'No output'}`);

      if (result.error) {
        await this.sendLongMessageToChannel(responseChannel, `❌ エラーが発生しました:\n\`\`\`\n${result.error}\n\`\`\``);
      } else if (result.output) {
        await this.sendLongMessageToChannel(responseChannel, result.output);
      } else {
        if ('send' in responseChannel) {
          await responseChannel.send('✅ コマンドが実行されましたが、出力はありませんでした。');
        }
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
      } else if ('send' in message.channel) {
        await message.channel.send(chunks[i]);
      }
    }
  }

  private async sendLongMessageToChannel(channel: TextBasedChannel, content: string): Promise<void> {
    if (!('send' in channel)) {
      return;
    }

    const maxLength = 2000;
    
    if (content.length <= maxLength) {
      await channel.send(content);
      return;
    }

    // Split long messages
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
