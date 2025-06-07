import { spawn } from 'child_process';

export interface ClaudeResult {
  output: string;
  error?: string;
  exitCode: number;
  sessionId?: string;
}

export class ClaudeWrapper {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  async executeCommand(prompt: string, sessionId?: string): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const args = ['--output-format', 'json', '-p', prompt];
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

  setWorkingDirectory(dir: string): void {
    this.workingDir = dir;
  }

  getWorkingDirectory(): string {
    return this.workingDir;
  }
}
