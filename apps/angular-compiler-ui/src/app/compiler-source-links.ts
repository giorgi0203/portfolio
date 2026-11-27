import { decode } from '@jridgewell/sourcemap-codec';
import type { TemplateSourceMap } from 'shared-types';
import type { SourceMatch } from './compiler-explanations';

interface Position { line: number; column: number; offset: number; }

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function offset(starts: number[], length: number, line: number, column: number): number | null {
  const start = starts[line];
  if (start === undefined || column < 0) return null;
  const value = start + column;
  const lineEnd = starts[line + 1] === undefined ? length : starts[line + 1] - 1;
  return value <= lineEnd ? value : null;
}

/** Keep exact segment boundaries. Nearest-position lookups can assign unmapped Angular helpers to an adjacent binding. */
export function compilerSourceLinks(code: string, source: string, map?: TemplateSourceMap) {
  if (!map || typeof map.mappings !== 'string' || map.mappings.length > 1024 * 1024 ||
      !Number.isSafeInteger(map.sourceIndex) || map.sourceIndex < 0) return null;
  const generatedLines = lineStarts(code), originalLines = lineStarts(source);
  const positions = new Map<number, (Position | null)[]>();
  const decoded = decode(map.mappings);
  for (let line = 0; line < decoded.length && line < generatedLines.length; line++) {
    for (const segment of decoded[line]) {
      const generated = offset(generatedLines, code.length, line, segment[0]);
      if (generated === null) continue;
      let original: Position | null = null;
      if (segment.length !== 1 && segment[1] === map.sourceIndex) {
        const sourceLine = segment[2], column = segment[3];
        const sourceOffset = offset(originalLines, source.length, sourceLine, column);
        if (sourceOffset !== null) original = { line: sourceLine + 1, column: column + 1, offset: sourceOffset };
      }
      const entries = positions.get(generated);
      if (entries) entries.push(original);
      else positions.set(generated, [original]);
    }
  }
  return (receiverStart: number, end: number, indexInChain: number): SourceMatch | null => {
    // Chained calls share a receiver. Angular/TypeScript emit their nested start spans outermost first.
    const starts = positions.get(receiverStart);
    const start = starts && starts[starts.length - 1 - indexInChain];
    const finish = positions.get(end)?.[0];
    if (!start || !finish || start.offset >= finish.offset) return null;
    return {
      startLine: start.line, startColumn: start.column, start: start.offset,
      endLine: finish.line, endColumn: finish.column, end: finish.offset,
      reason: 'Angular’s source map links this emitted call to this range in your component.',
      approximate: false,
    };
  };
}
