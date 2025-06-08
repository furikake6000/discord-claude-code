import { Client, GatewayIntentBits, Message, StageChannel, TextBasedChannel, GuildTextBasedChannel } from 'discord.js';
import { ClaudeWrapper } from './claude-wrapper';
import * as dotenv from 'dotenv';

dotenv.config();

class DiscordClaudeBot {
  private client: Client;
  private claude: ClaudeWrapper;
  private botUserId?: string;
  private threadSessionMap: Map<string, string> = new Map();
  
  // Configuration for thread history fallback
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

    this.claude = new ClaudeWrapper(process.env.CLAUDE_WORK_DIR || process.cwd());

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      this.botUserId = this.client.user?.id;
      console.log(`✅ Bot ready as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', async (message: Message) => {
      // Ignore non-guild messages
      if (!message.inGuild) return;

      await this.handleMessage(message as Message<true>);
    });
  }

  private async handleMessage(message: Message<true>): Promise<void> {
    console.log(`📨 Message received: "${message.content}" from ${message.author.tag}`);
    
    let channel = message.channel;
    // Stage channels and forum threads are not supported for threads
    if (channel instanceof StageChannel) {
      console.log(`🚫 This channel type is not supported. Ignoring message from ${message.author.tag}`)
      return;
    }

    // Ignore bot messages
    if (message.author.bot) {
      console.log(`🤖 Ignoring bot message from ${message.author.tag}`);
      return;
    }

    // Check if bot is mentioned (or if we're in a thread)
    const isInThread = channel.isThread();
    if (!isInThread && !this.isBotMentioned(message)) {
      console.log(`🚫 Bot not mentioned in message: "${message.content}"`);
      return;
    }
    
    console.log(`✅ ${isInThread ? 'In thread' : 'Bot mentioned'}! Processing message from ${message.author.tag}`);

    // Extract command from message (remove mention if present)
    const prompt = this.extractPrompt(message);
    if (!prompt.trim()) {
      await message.reply('何かお手伝いできることはありますか？');
      return;
    }

    // Show typing indicator
    await channel.sendTyping();

    try {
      console.log(`📝 Executing: ${prompt}`);
      
      if (!isInThread) {
        // Start a thread if not already in one
        const thread = await message.startThread({
          name: `Claude Code: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`,
        });
        channel = thread;
      }

      // Check if we're in a thread and have an existing session
      const threadId = isInThread ? channel.id : null;
      const existingSessionId = threadId ? this.threadSessionMap.get(threadId) : undefined;
      
      let finalPrompt = prompt;
      
      // If we're in a thread but don't have a session ID, include thread history
      if (isInThread && !existingSessionId) {
        const threadHistory = await this.getThreadHistory(channel, message.id);
        if (threadHistory) {
          finalPrompt = `以下は過去の会話履歴です：\n\n${threadHistory}\n\n---\n\n${prompt}`;
          console.log(`📚 Added thread history to prompt (${threadHistory.length} chars)`);
        }
      }
      
      const result = await this.claude.executeCommand(finalPrompt, existingSessionId);
      
      // Store session ID for future use in this thread
      if (result.sessionId) {
        if (threadId) {
          this.threadSessionMap.set(threadId, result.sessionId);
        } else if (channel.isThread()) {
          // New thread was created
          this.threadSessionMap.set(channel.id, result.sessionId);
        }
      }
      
      console.log(`✅ Command executed successfully: ${result.output || 'No output'}`);

      if (result.error) {
        await this.sendToChannel(channel, `❌ エラーが発生しました:\n\`\`\`\n${result.error}\n\`\`\``);
      } else if (result.output) {
        await this.sendToChannel(channel, result.output);
      } else {
        await this.sendToChannel(channel, '✅ コマンドが実行されましたが、出力はありませんでした。');
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

  private async sendToChannel(channel: GuildTextBasedChannel, content: string): Promise<void> {
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

  private async getThreadHistory(channel: TextBasedChannel, currentMessageId?: string): Promise<string> {
    if (!channel.isThread()) {
      return '';
    }

    try {
      const messages = await channel.messages.fetch({ 
        limit: DiscordClaudeBot.MAX_HISTORY_MESSAGES 
      });
      
      // Sort messages by creation time (oldest first)
      const sortedMessages = Array.from(messages.values())
        .filter(msg => msg.id !== currentMessageId) // Exclude current message
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      let historyText = '';
      let totalChars = 0;

      for (const msg of sortedMessages) {
        // Skip empty messages or messages with only mentions
        if (!msg.content || msg.content.trim() === '') continue;
        
        // Format message with author and content
        const formattedMessage = `${msg.author.tag}: ${msg.content}\n`;
        
        // Check if adding this message would exceed character limit
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
