import { describe, it, expect, vi, afterEach } from 'vitest';
import { AlibabaTranscriber } from './alibaba';

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(() => Buffer.from('fake-audio-data')),
  },
}));

describe('AlibabaTranscriber', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends audio to Alibaba Cloud speech recognition and returns text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Result: { Sentences: [{ Text: 'Transcript from Alibaba.' }] } }),
    });

    const transcriber = new AlibabaTranscriber({
      accessKeyId: 'test-id',
      accessKeySecret: 'test-secret',
      appKey: 'test-app',
    });

    (transcriber as any).getToken = vi.fn().mockResolvedValue('mock-token');

    const result = await transcriber.transcribe('/tmp/audio.mp3');
    expect(result).toContain('Transcript from Alibaba');
  });
});
