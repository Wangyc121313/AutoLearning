import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Transcriber } from './index';

export class AlibabaTranscriber implements Transcriber {
  constructor(
    private config: {
      accessKeyId: string;
      accessKeySecret: string;
      appKey: string;
    },
  ) {}

  async transcribe(audioPath: string): Promise<string> {
    const token = await this.getToken();
    const audio = fs.readFileSync(audioPath);
    const base64Audio = audio.toString('base64');

    const response = await fetch(
      `https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr?appkey=${this.config.appKey}`,
      {
        method: 'POST',
        headers: {
          'X-NLS-Token': token,
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from(base64Audio, 'base64'),
      },
    );

    if (!response.ok) {
      throw new Error(`Alibaba Cloud ASR error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      Result?: { Sentences?: Array<{ Text?: string }> };
    };

    const sentences = data.Result?.Sentences ?? [];
    return sentences.map((s) => s.Text ?? '').join(' ');
  }

  private async getToken(): Promise<string> {
    const response = await fetch(
      `https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `acs ${this.config.accessKeyId}:${this.sign()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get Alibaba token: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { Token?: { Id?: string } };
    if (!data.Token?.Id) throw new Error('Invalid token response from Alibaba');
    return data.Token.Id;
  }

  private sign(): string {
    const hmac = crypto.createHmac('sha1', this.config.accessKeySecret);
    return hmac.update('').digest('base64');
  }
}
