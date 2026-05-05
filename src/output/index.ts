import fs from 'node:fs';
import path from 'node:path';
import type { NoteOutput } from '../types';

const DATE_RE = /\{date\}/g;
const TITLE_RE = /\{title\}/g;

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

export function writeNote(
  markdown: string,
  title: string,
  directory: string,
  filenameTemplate: string,
): NoteOutput {
  if (!fs.existsSync(directory)) {
    throw new Error(`Output directory does not exist: ${directory}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(title) || 'untitled';

  let filename = filenameTemplate
    .replace(TITLE_RE, safeTitle)
    .replace(DATE_RE, date);

  if (!filename.endsWith('.md')) {
    filename += '.md';
  }

  const filePath = path.join(directory, filename);
  fs.writeFileSync(filePath, markdown, 'utf-8');

  return { markdown, filePath };
}
