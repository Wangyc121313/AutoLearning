import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Transcriber } from './index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT_PATH = [
  path.resolve(__dirname, 'scripts', 'transcribe.py'),
  path.resolve(__dirname, '..', 'scripts', 'transcribe.py'),
  path.resolve(__dirname, '..', '..', 'scripts', 'transcribe.py'),
].find((p) => fs.existsSync(p)) ?? path.resolve(__dirname, '..', 'scripts', 'transcribe.py');

export class LocalWhisperTranscriber implements Transcriber {
  private pythonPath: string;

  constructor(private config: { modelSize: string; pythonPath?: string }) {
    this.pythonPath = config.pythonPath ?? 'python3';
  }

  async transcribe(audioPath: string): Promise<string> {
    return execFileSync(this.pythonPath, [SCRIPT_PATH, audioPath, this.config.modelSize], {
      encoding: 'utf-8',
      timeout: 1_800_000, // 30 minutes max
      maxBuffer: 50 * 1024 * 1024, // 50MB — enough for very long transcripts
      env: { ...process.env, HF_HUB_OFFLINE: '1' },
    });
  }
}
