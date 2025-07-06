jest.mock('@anthropic-ai/claude-code', () => ({
  query: jest.fn()
}));

import { ClaudeSDKWrapper } from './claude-sdk-wrapper';
import { query } from '@anthropic-ai/claude-code';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('ClaudeSDKWrapper', () => {
  let claudeSDKWrapper: ClaudeSDKWrapper;

  beforeEach(() => {
    claudeSDKWrapper = new ClaudeSDKWrapper('/test/dir');
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default working directory when none provided', () => {
      const wrapper = new ClaudeSDKWrapper();
      expect(wrapper.getWorkingDirectory()).toBe(process.cwd());
    });

    it('should use provided working directory', () => {
      const wrapper = new ClaudeSDKWrapper('/custom/dir');
      expect(wrapper.getWorkingDirectory()).toBe('/custom/dir');
    });
  });

  describe('executeCommandWithStreaming', () => {
    it('should handle streaming errors', async () => {
      const error = new Error('Streaming error');
      mockQuery.mockImplementation(async function* () {
        throw error;
      });

      const result = await claudeSDKWrapper.executeCommandWithStreaming('test prompt');

      expect(result).toEqual({
        output: '',
        error: 'Streaming error',
        exitCode: 1
      });
    });
  });

  describe('setWorkingDirectory', () => {
    it('should update working directory', () => {
      claudeSDKWrapper.setWorkingDirectory('/new/dir');
      expect(claudeSDKWrapper.getWorkingDirectory()).toBe('/new/dir');
    });
  });

  describe('getWorkingDirectory', () => {
    it('should return current working directory', () => {
      expect(claudeSDKWrapper.getWorkingDirectory()).toBe('/test/dir');
    });
  });
});
