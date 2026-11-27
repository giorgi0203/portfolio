import type { InspectionBlock } from './inspection-types';

/** A caret or generated span belongs to the innermost element that contains the entire range. */
export function owningPreviewBlock(
  range: { start: number; end: number },
  blocks: readonly InspectionBlock[],
): InspectionBlock | null {
  let owner: InspectionBlock | null = null;
  for (const block of blocks) {
    if (range.start < block.start || range.start >= block.end || range.end > block.end) continue;
    if (!owner || block.end - block.start < owner.end - owner.start) owner = block;
  }
  return owner;
}
