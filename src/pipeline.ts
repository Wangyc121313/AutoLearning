import fs from 'node:fs';
import { getFetcher } from './fetcher/index';
import { getGenerator } from './generator/index';
import { parseContent } from './parser/index';
import { writeNote } from './output/index';
import type { Config } from './config';
import type { NoteOutput } from './types';

export async function runPipeline(
  url: string,
  type: 'text' | 'video' | 'auto',
  config: Config,
  providerOverride?: string,
): Promise<NoteOutput> {
  // 1. Fetch
  const fetcher = getFetcher(url, type);
  console.error(`Fetching ${url} with ${fetcher.constructor.name}...`);
  const raw = await fetcher.fetch(url);

  // 2. Parse
  const resolvedType: 'text' | 'video' =
    type === 'auto'
      ? fetcher.constructor.name === 'VideoFetcher'
        ? 'video'
        : 'text'
      : type;
  const content = parseContent(raw, url, resolvedType);

  // 3. Generate
  const provider = providerOverride ?? config.provider.default;
  console.error(`Generating notes with ${provider}...`);
  const generator = getGenerator(provider, config.providers);
  const markdown = await generator.generate(content);

  // 4. Output
  const outDir = config.output.directory;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);

  console.error(`Note written to ${result.filePath}`);
  return result;
}
