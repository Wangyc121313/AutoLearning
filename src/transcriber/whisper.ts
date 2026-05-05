import OpenAI from 'openai';
import fs from 'node:fs';
import type { Transcriber } from './index';

export class WhisperTranscriber implements Transcriber {
  private client: OpenAI;

  constructor(private config: { apiKey: string; model: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async transcribe(audioPath: string): Promise<string> {
    const file = fs.createReadStream(audioPath);
    const result = await this.client.audio.transcriptions.create({
      model: this.config.model,
      file,
    });
    return result.text;
  }
}
