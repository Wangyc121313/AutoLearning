import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperTranscriber } from './whisper';

vi.mock('node:fs', () => ({
  default: {
    createReadStream: vi.fn(() => ({})),
  },
}));

describe('WhisperTranscriber', () => {
  it('sends audio to Whisper API and returns text', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ text: 'This is the transcript.' });
    const transcriber = new WhisperTranscriber({ apiKey: 'test-key', model: 'whisper-1' });
    (transcriber as any).client = { audio: { transcriptions: { create: mockCreate } } };

    const result = await transcriber.transcribe('/tmp/test-audio.mp3');
    expect(result).toBe('This is the transcript.');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
