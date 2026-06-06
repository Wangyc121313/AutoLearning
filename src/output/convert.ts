import { execFileSync } from 'node:child_process';

export function convertToPdf(mdPath: string, pdfPath: string) {
  // Try pandoc first, fall back to simple markdown-to-pdf
  try {
    execFileSync('pandoc', [
      mdPath,
      '-o', pdfPath,
      '--pdf-engine=xelatex',
      '-V', 'mainfont=DejaVu Serif',
      '-V', 'monofont=DejaVu Sans Mono',
      '--from=markdown',
    ], { encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    return;
  } catch {
    // pandoc not available
  }

  // Fallback: use simple HTML-based conversion via a Node.js approach
  // Just copy the file with a note
  throw new Error(
    'PDF conversion requires pandoc. Install: sudo apt install pandoc texlive-xetex'
  );
}
