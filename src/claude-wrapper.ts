import { spawn } from 'child_process';

export interface ClaudeResult {
  output: string;
  error?: string;
  exitCode: number;
  sessionId?: string;
}

export interface StreamCallback {
  onUpdate?: (content: string) => Promise<void>;
  onThinking?: (text: string) => Promise<void>;
  onAssistantMessage?: (text: string) => Promise<void>;
  onToolUse?: (toolName: string, details: any) => Promise<void>;
}

export class ClaudeWrapper {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  async executeCommand(prompt: string, sessionId?: string): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const args = ['--output-format', 'json', '-p', prompt];
      
      // 権限設定（環境変数で制御可能）
      const skipPermissions = process.env.CLAUDE_SKIP_PERMISSIONS === 'true';
      const allowedTools = process.env.CLAUDE_ALLOWED_TOOLS;
      
      if (skipPermissions) {
        args.unshift('--dangerously-skip-permissions');
      } else if (allowedTools) {
        args.unshift('--allowedTools', allowedTools);
      }
      
      if (sessionId) {
        args.push('--resume', sessionId);
      }

      const claude = spawn('claude', args, {
        cwd: this.workingDir,
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      let output = '';
      let error = '';

      claude.stdout.on('data', (data) => {
        output += data.toString();
      });

      claude.stderr.on('data', (data) => {
        error += data.toString();
      });

      claude.on('close', (code) => {
        let parsedOutput = '';
        let extractedSessionId: string | undefined;

        try {
          // Try to parse JSON output
          const jsonOutput = JSON.parse(output);
          parsedOutput = jsonOutput.result;
          extractedSessionId = jsonOutput.session_id;
        } catch {
          // Fallback to raw output if JSON parsing fails
          parsedOutput = output;
        }

        resolve({
          output: parsedOutput.trim(),
          error: error.trim() || undefined,
          exitCode: code || 0,
          sessionId: extractedSessionId
        });
      });

      claude.on('error', (err) => {
        resolve({
          output: '',
          error: err.message,
          exitCode: 1
        });
      });
    });
  }

  async executeCommandWithStreaming(prompt: string, sessionId?: string, callbacks?: StreamCallback): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const args = ['--output-format', 'stream-json', '--verbose', '-p', prompt];
      
      // 権限設定（環境変数で制御可能）
      const skipPermissions = process.env.CLAUDE_SKIP_PERMISSIONS === 'true';
      const allowedTools = process.env.CLAUDE_ALLOWED_TOOLS;
      
      if (skipPermissions) {
        args.unshift('--dangerously-skip-permissions');
      } else if (allowedTools) {
        args.unshift('--allowedTools', allowedTools);
      }
      
      if (sessionId) {
        args.push('--resume', sessionId);
      }

      const claude = spawn('claude', args, {
        cwd: this.workingDir,
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      let streamBuffer = '';
      let error = '';
      let finalResult = '';
      let extractedSessionId: string | undefined;

      claude.stdout.on('data', async (data) => {
        streamBuffer += data.toString();
        const lines = streamBuffer.split('\n');
        
        // Process complete JSON lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          try {
            const json = JSON.parse(line);
            await this.processStreamEvent(json, callbacks);
            
            // Extract final result and session ID
            if (json.type === 'result') {
              finalResult = json.result || '';
              extractedSessionId = json.session_id;
            }
          } catch (err) {
            console.warn('Failed to parse JSON line:', line);
          }
        }
        
        // Keep the last incomplete line in buffer
        streamBuffer = lines[lines.length - 1];
      });

      claude.stderr.on('data', (data) => {
        error += data.toString();
      });

      claude.on('close', (code) => {
        resolve({
          output: finalResult.trim(),
          error: error.trim() || undefined,
          exitCode: code || 0,
          sessionId: extractedSessionId
        });
      });

      claude.on('error', (err) => {
        resolve({
          output: '',
          error: err.message,
          exitCode: 1
        });
      });
    });
  }

  private async processStreamEvent(event: any, callbacks?: StreamCallback): Promise<void> {
    if (!callbacks) return;
    
    switch (event.type) {
      case 'assistant':
        if (event.message?.content) {
          for (const content of event.message.content) {
            if (content.type === 'text' && callbacks.onAssistantMessage) {
              await callbacks.onAssistantMessage(content.text);
            } else if (content.type === 'tool_use' && callbacks.onToolUse) {
              await callbacks.onToolUse(content.name, content.input || {});
            }
          }
        }
        break;
        
      case 'thinking':
        if (event.content && callbacks.onThinking) {
          await callbacks.onThinking(event.content);
        }
        break;
        
      case 'tool_result':
        if (event.content && callbacks.onToolUse) {
          await callbacks.onToolUse('result', { 
            result: event.content,
            toolCallId: event.tool_call_id 
          });
        }
        break;
    }
  }

  setWorkingDirectory(dir: string): void {
    this.workingDir = dir;
  }

  getWorkingDirectory(): string {
    return this.workingDir;
  }
}
