import { describe, it, expect, vi } from 'vitest';

const mockOutput = vi.hoisted(() => '**Detected Language:** en\n**Language Probability:** 0.98\n\n**[00:01 - 00:03]**\n\nHello world\n');
const mockExecFileSync = vi.hoisted(() => vi.fn().mockReturnValue(mockOutput));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

describe('LocalWhisperTranscriber', () => {
  it('calls Python script with correct args and returns output', async () => {
    const { LocalWhisperTranscriber } = await import('./local-whisper');
    const { execFileSync } = await import('node:child_process');

    const transcriber = new LocalWhisperTranscriber({ modelSize: 'base' });
    const result = await transcriber.transcribe('/tmp/test-audio.m4a');

    expect(execFileSync).toHaveBeenCalledWith(
      'python3',
      [expect.stringContaining('transcribe.py'), '/tmp/test-audio.m4a', 'base'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 600_000 }),
    );
    expect(result).toBe(mockOutput);
  });
});
