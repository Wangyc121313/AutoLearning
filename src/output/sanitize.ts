/** Strips common LLM artifacts: polite closings, preambles, meta-commentary. */
export function sanitize(text: string): string {
  let result = text.trim();

  // Strip trailing polite closings (Chinese)
  result = result.replace(
    /\n{1,2}(?:希望对你[^\n]{0,80}|如有需要[^\n]{0,80}|如需[^\n]{0,80}|欢迎反馈[^\n]{0,80}|请告诉[^\n]{0,80}|以上[^\n]{0,40}内容[^\n]{0,40})$/g,
    '',
  );

  // Strip trailing polite closings (English)
  result = result.replace(
    /\n{1,2}(?:let me know[^\n]{0,200}|feel free to[^\n]{0,200}|happy to[^\n]{0,200}|please let me know[^\n]{0,200}|don't hesitate[^\n]{0,200}|hope this helps[^\n]{0,200}|thanks for reading[^\n]{0,200})$/gi,
    '',
  );

  // Strip leading preambles
  result = result.replace(
    /^(?:Here is (?:a |the )?(?:summary|note|transcript)[^\n]{0,200}\n{1,2}|以下是[^\n]{0,200}\n{1,2})/i,
    '',
  );

  // Remove trailing lines that are pure meta
  const lines = result.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const lower = last.toLowerCase();
    if (
      lower === '---' ||
      /^(let me know|feel free|happy to|hope this|thanks for|please let|don't hesitate)/i.test(lower) ||
      /^(希望|如有|如需|欢迎|请告诉|以上)/.test(lower)
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n').trim();
}
