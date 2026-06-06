#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './config';
import { runPipeline, runPipelineFromText } from './pipeline';
import { convertToPdf } from './output/convert';

const HISTORY_FILE = path.join(os.homedir(), '.autolearning', 'history.json');

function loadHistory(): Record<string, { date: string; file: string }> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveHistory(history: Record<string, unknown>) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

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
  .option('--cookies-from-browser <browser>', 'Browser cookies for sites that require login (e.g. firefox, chrome)')
  .option('--file <path>', 'Read content from a local file (.md, .txt, etc.)')
  .option('--stdin', 'Read content from standard input')
  .option('--title <title>', 'Title for the notes (used with --file or --stdin)')
  .option('--format <fmt>', 'Output format: md or pdf', 'md')
  .option('--force', 'Force re-processing even if URL was already processed')
  .action(async (url, options) => {
    try {
      const config = loadConfig(options.config);

      if (options.output) {
        config.output.directory = options.output;
      }

      const history = loadHistory();

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

        await handleOutput(result, options);
        return;
      }

      // --- URL input (default) ---
      if (!url) {
        throw new Error('Please provide a URL, or use --file or --stdin');
      }

      // History check
      const cleanUrl = url.trim();
      if (history[cleanUrl] && !options.force) {
        console.error(`Already processed on ${history[cleanUrl].date}: ${history[cleanUrl].file}`);
        console.error('Use --force to re-process.');
        return;
      }

      const result = await runPipeline(
        cleanUrl,
        options.type as 'text' | 'video' | 'auto',
        config,
        {
          providerOverride: options.provider,
          cookiesFromBrowser: options.cookiesFromBrowser,
        },
      );

      // Record in history
      history[cleanUrl] = { date: new Date().toISOString().slice(0, 10), file: result.filePath };
      saveHistory(history);

      await handleOutput(result, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

async function handleOutput(result: { markdown: string; filePath: string }, options: any) {
  const fmt = options.format === 'pdf' ? 'pdf' : 'md';

  if (fmt === 'pdf') {
    const pdfPath = result.filePath.replace(/\.md$/, '.pdf');
    console.error('Converting to PDF...');
    convertToPdf(result.filePath, pdfPath);
    console.log(`\nDone! Note saved to: ${pdfPath}`);
  } else {
    console.log(`\nDone! Note saved to: ${result.filePath}`);
  }
}

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
