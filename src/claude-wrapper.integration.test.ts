import { ClaudeWrapper } from './claude-wrapper';

describe('ClaudeWrapper Integration Test', () => {
  let claudeWrapper: ClaudeWrapper;

  beforeEach(() => {
    claudeWrapper = new ClaudeWrapper();
  });

  describe('executeCommand with real claude CLI', () => {
    it('should execute simple claude command and return result', async () => {
      const result = await claudeWrapper.executeCommand('2 + 2');
      
      expect(result.exitCode).toBe(0);
      expect(result.output).toBeTruthy();
      expect(result.output.toLowerCase()).toContain('4');
      expect(result.error).toBeUndefined();
    }, 30000); // 30 second timeout for real command execution
  });
});