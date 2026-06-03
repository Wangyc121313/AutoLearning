#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { runPipeline, runPipelineFromText } from './pipeline';

const program = new Command();

program
  .name('autolearn')
  .description('Generate structured Markdown study notes from URLs or local files')
  .argument('[url]', 'URL of the resource to learn from (optional if using --file or --stdin)')
  .option('-p, --provider <name>', 'AI provider')
  .option('-o, --output <dir>', 'Output directory for notes')
  .option('-t, --type <type>', 'Resource type: text, video, or auto', 'auto')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--cookies-from-browser <browser>', 'Pass browser cookies to yt-dlp (e.g. firefox, chrome)')
  .option('--file <path>', 'Read content from a local file (.md, .txt, etc.)')
  .option('--stdin', 'Read content from standard input')
  .option('--title <title>', 'Title for the notes (used with --file or --stdin)')
  .action(async (url, options) => {
    try {
      const config = loadConfig(options.config);

      if (options.output) {
        config.output.directory = options.output;
      }

      // --- Text input (file / stdin) ---
      if (options.file || options.stdin) {
        let text: string;
        let title: string;
        let sourceLabel: string;

        if (options.stdin) {
          text = await readStdin();
          title = options.title ?? 'User Input';
          sourceLabel = 'stdin';
        } else {
          const filePath = path.resolve(options.file);
          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }
          text = fs.readFileSync(filePath, 'utf-8');
          title = options.title ?? path.basename(filePath, path.extname(filePath));
          sourceLabel = `file:${filePath}`;
        }

        if (!text.trim()) {
          throw new Error('Input is empty');
        }

        const result = await runPipelineFromText(text, title, sourceLabel, config, {
          providerOverride: options.provider,
        });

        console.log(`\nDone! Note saved to: ${result.filePath}`);
        return;
      }

      // --- URL input (default) ---
      if (!url) {
        throw new Error('Please provide a URL, or use --file or --stdin');
      }

      const result = await runPipeline(
        url,
        options.type as 'text' | 'video' | 'auto',
        config,
        {
          providerOverride: options.provider,
          cookiesFromBrowser: options.cookiesFromBrowser,
        },
      );

      console.log(`\nDone! Note saved to: ${result.filePath}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

program.parse();
