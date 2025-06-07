import { ClaudeWrapper, ClaudeResult } from './claude-wrapper';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');

describe('ClaudeWrapper', () => {
  let claudeWrapper: ClaudeWrapper;
  let mockSpawn: jest.MockedFunction<typeof spawn>;

  beforeEach(() => {
    claudeWrapper = new ClaudeWrapper('/test/dir');
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default working directory when none provided', () => {
      const wrapper = new ClaudeWrapper();
      expect(wrapper.getWorkingDirectory()).toBe(process.cwd());
    });

    it('should use provided working directory', () => {
      const wrapper = new ClaudeWrapper('/custom/dir');
      expect(wrapper.getWorkingDirectory()).toBe('/custom/dir');
    });
  });

  describe('executeCommand', () => {
    it('should execute claude command with correct parameters', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      mockProcess.emit('close', 0);

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith('claude', ['-p', 'test prompt'], {
        cwd: '/test/dir',
        stdio: ['inherit', 'pipe', 'pipe'],
        env: process.env
      });
    });

    it('should return successful result with output', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      mockProcess.stdout.emit('data', 'Hello ');
      mockProcess.stdout.emit('data', 'World\n');
      mockProcess.emit('close', 0);

      const result: ClaudeResult = await promise;

      expect(result).toEqual({
        output: 'Hello World',
        error: undefined,
        exitCode: 0
      });
    });

    it('should return result with error when stderr has data', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      mockProcess.stdout.emit('data', 'Some output');
      mockProcess.stderr.emit('data', 'Error occurred\n');
      mockProcess.emit('close', 1);

      const result: ClaudeResult = await promise;

      expect(result).toEqual({
        output: 'Some output',
        error: 'Error occurred',
        exitCode: 1
      });
    });

    it('should handle spawn error', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      const error = new Error('Command not found');
      mockProcess.emit('error', error);

      const result: ClaudeResult = await promise;

      expect(result).toEqual({
        output: '',
        error: 'Command not found',
        exitCode: 1
      });
    });

    it('should trim whitespace from output and error', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      mockProcess.stdout.emit('data', '  output with spaces  \n');
      mockProcess.stderr.emit('data', '  error with spaces  \n');
      mockProcess.emit('close', 0);

      const result: ClaudeResult = await promise;

      expect(result.output).toBe('output with spaces');
      expect(result.error).toBe('error with spaces');
    });

    it('should set error to undefined when stderr is empty', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = claudeWrapper.executeCommand('test prompt');
      
      mockProcess.stdout.emit('data', 'output');
      mockProcess.emit('close', 0);

      const result: ClaudeResult = await promise;

      expect(result.error).toBeUndefined();
    });
  });

  describe('setWorkingDirectory', () => {
    it('should update working directory', () => {
      claudeWrapper.setWorkingDirectory('/new/dir');
      expect(claudeWrapper.getWorkingDirectory()).toBe('/new/dir');
    });
  });

  describe('getWorkingDirectory', () => {
    it('should return current working directory', () => {
      expect(claudeWrapper.getWorkingDirectory()).toBe('/test/dir');
    });
  });
});

function createMockProcess() {
  const mockProcess = new EventEmitter() as any;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  return mockProcess;
}