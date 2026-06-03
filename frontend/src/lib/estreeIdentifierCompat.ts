/**
 * Drop-in replacement for estree-util-is-identifier-name without `\p{…}` property
 * escapes (Safari < 16.4 throws "invalid group specifier name" at parse time).
 *
 * Markdown/HTML tag names are ASCII; this is sufficient for react-markdown output.
 */

type Options = { jsx?: boolean | null };

const asciiNameRe = /^[$_a-zA-Z][$\w]*$/;
const asciiNameJsxRe = /^[$_a-zA-Z][$\w-]*$/;

export function start(code: number | undefined): boolean {
  if (!code) return false;
  const char = String.fromCodePoint(code);
  return /[$_a-zA-Z]/.test(char);
}

export function cont(code: number | undefined, options?: Options | null): boolean {
  if (!code) return false;
  const char = String.fromCodePoint(code);
  if (options?.jsx && (char === '-' || char === '$')) return true;
  return /[$\w]/.test(char) || char === '\u200c' || char === '\u200d';
}

export function name(identifier: string, options?: Options | null): boolean {
  const re = options?.jsx ? asciiNameJsxRe : asciiNameRe;
  return re.test(identifier);
}
