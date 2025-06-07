import { spawn } from 'child_process';

export interface ClaudeResult {
  output: string;
  error?: string;
  exitCode: number;
}

export class ClaudeWrapper {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  async executeCommand(prompt: string): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const claude = spawn('claude', [prompt], {
        cwd: this.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
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
        resolve({
          output: output.trim(),
          error: error.trim() || undefined,
          exitCode: code || 0
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