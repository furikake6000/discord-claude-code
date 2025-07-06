import { query, type SDKMessage, type Options } from "@anthropic-ai/claude-code";

export interface ClaudeResult {
  output: string;
  error?: string;
  exitCode: number;
  sessionId?: string;
}

export interface StreamCallback {
  // eslint-disable-next-line no-unused-vars
  onUpdate?: (content: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onThinking?: (text: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onAssistantMessage?: (text: string) => Promise<void>;
  // eslint-disable-next-line no-unused-vars
  onToolUse?: (toolName: string, details: any) => Promise<void>;
}

export class ClaudeSDKWrapper {
  constructor() {
    // ステートレスなクラスに変更 - working dirは引数で受け取る
  }

  async executeCommandWithStreaming(prompt: string, sessionId?: string, callbacks?: StreamCallback, workingDir: string = process.cwd()): Promise<ClaudeResult> {
    try {

      const messages: SDKMessage[] = [];
      const abortController = new AbortController();

      const options: Options = {
        cwd: workingDir,
        maxTurns: 100
      };

      // Handle permissions using SDK options
      const skipPermissions = process.env.CLAUDE_SKIP_PERMISSIONS === 'true';
      const allowedTools = process.env.CLAUDE_ALLOWED_TOOLS;

      if (skipPermissions) {
        options.permissionMode = 'bypassPermissions';
      }

      if (allowedTools) {
        options.allowedTools = allowedTools.split(',').map(tool => tool.trim());
      }

      if (sessionId) {
        options.resume = sessionId;
      }


      let output = '';
      let error = '';
      let finalSessionId = sessionId;

      // Execute the query with streaming callbacks
      for await (const message of query({
        prompt,
        abortController,
        options
      })) {
        messages.push(message);

        // Process streaming events
        await this.processSDKMessage(message, callbacks);

        // Accumulate output
        if (message.type === 'assistant') {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                output += item.text + '\n';
              }
            }
          } else if (typeof content === 'string') {
            output += content + '\n';
          }
          finalSessionId = message.session_id;
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            output += message.result;
          } else {
            error = `Error: ${message.subtype}`;
          }
          finalSessionId = message.session_id;
        }
      }


      return {
        output: output.trim(),
        error: error.trim() || undefined,
        exitCode: error ? 1 : 0,
        sessionId: finalSessionId
      };

    } catch (err) {
      
      return {
        output: '',
        error: err instanceof Error ? err.message : 'Unknown error occurred',
        exitCode: 1
      };
    }
  }

  private async processSDKMessage(message: SDKMessage, callbacks?: StreamCallback): Promise<void> {
    if (!callbacks) return;

    switch (message.type) {
      case 'assistant':
        if (callbacks.onAssistantMessage) {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text') {
                await callbacks.onAssistantMessage(item.text);
              } else if (item.type === 'tool_use' && callbacks.onToolUse) {
                await callbacks.onToolUse(item.name, item.input || {});
              }
            }
          } else if (typeof content === 'string') {
            await callbacks.onAssistantMessage(content);
          }
        }
        break;

      case 'result':
        if (message.subtype === 'success' && callbacks.onUpdate) {
          await callbacks.onUpdate(message.result);
        }
        break;

      case 'system':
        if (callbacks.onUpdate) {
          await callbacks.onUpdate(`System initialized: ${message.model}`);
        }
        break;

      case 'user':
        // User message processing if needed
        if (callbacks.onUpdate) {
          await callbacks.onUpdate('User message processed');
        }
        break;

      default:
        // Handle other message types if needed
        if (callbacks.onUpdate) {
          await callbacks.onUpdate(JSON.stringify(message));
        }
        break;
    }
  }

}
