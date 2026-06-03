import fs from 'node:fs';
import { getFetcher } from './fetcher/index';
import { getGenerator } from './generator/index';
import { parseContent } from './parser/index';
import { writeNote } from './output/index';
import { sanitize } from './output/sanitize';
import { LocalWhisperTranscriber } from './transcriber/local-whisper';
import { optimizeTranscript } from './optimizer/index';
import type { Config } from './config';
import type { NoteOutput } from './types';

export async function runPipeline(
  url: string,
  type: 'text' | 'video' | 'auto',
  config: Config,
  options?: { providerOverride?: string; cookiesFromBrowser?: string },
): Promise<NoteOutput> {
  // Create local whisper transcriber for video fallback
  const transcriberInstance = new LocalWhisperTranscriber({
    modelSize: config.localWhisper?.modelSize ?? 'base',
    pythonPath: config.localWhisper?.pythonPath,
  });

  // 1. Fetch
  const fetcher = getFetcher(
    url, type,
    { transcriber: 'whisper', cookiesFromBrowser: options?.cookiesFromBrowser },
    transcriberInstance,
  );
  console.error(`Fetching ${url} with ${fetcher.constructor.name}...`);
  const raw = await fetcher.fetch(url);

  // 2. Parse
  const resolvedType: 'text' | 'video' =
    type === 'auto'
      ? fetcher.constructor.name === 'VideoFetcher'
        ? 'video'
        : 'text'
      : type;

  // 2.1 Optimize raw content before parsing
  if (true) {
    const provider = options?.providerOverride ?? config.provider.default;
    const providerConfig = config.providers[provider];
    if (providerConfig?.apiKey || providerConfig?.baseUrl) {
      console.error('Optimizing transcript...');
      try {
        raw.rawText = await optimizeTranscript(raw.rawText, providerConfig);
      } catch (err) {
        console.error('Transcript optimization failed, using raw text:', (err as Error).message);
      }
    }
  }

  const content = parseContent(raw, url, resolvedType);

  // 3. Generate
  const provider = options?.providerOverride ?? config.provider.default;
  console.error(`Generating notes with ${provider}...`);
  const generator = getGenerator(provider, config.providers);
  const markdown = sanitize(await generator.generate(content));

  // 4. Output
  const outDir = config.output.directory;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);

  console.error(`Note written to ${result.filePath}`);
  return result;
}
