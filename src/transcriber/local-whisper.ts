import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Transcriber } from './index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'transcribe.py');

export class LocalWhisperTranscriber implements Transcriber {
  constructor(private config: { modelSize: string }) {}

  async transcribe(audioPath: string): Promise<string> {
    return execFileSync('python3', [SCRIPT_PATH, audioPath, this.config.modelSize], {
      encoding: 'utf-8',
      timeout: 600_000, // 10 minutes max
    });
  }
}
