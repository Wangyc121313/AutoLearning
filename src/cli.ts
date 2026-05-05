#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config';
import { runPipeline } from './pipeline';

const program = new Command();

program
  .name('autolearn')
  .description('Generate structured Markdown study notes from URLs')
  .argument('<url>', 'URL of the resource to learn from')
  .option('-p, --provider <name>', 'AI provider: claude, openai, or ollama')
  .option('-o, --output <dir>', 'Output directory for notes')
  .option('-t, --type <type>', 'Resource type: text, video, or auto', 'auto')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(async (url, options) => {
    try {
      const config = loadConfig(options.config);

      if (options.output) {
        config.output.directory = options.output;
      }

      const result = await runPipeline(
        url,
        options.type as 'text' | 'video' | 'auto',
        config,
        options.provider,
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

program.parse();
