export interface CatRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface CatPerch {
  x: number;
  y: number;
  left: number;
  right: number;
  surface: 'portrait' | 'card' | 'note' | 'dock';
}
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** The cat's feet sit on the surface, with its entire drawing below the sticky header. */
export function cardPerch(
  rect: CatRect,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  headerBottom: number,
  pointerX: number,
): CatPerch | null {
  const y = rect.top - height + 2;
  const left = Math.max(12, rect.left + 10),
    right = Math.min(viewportWidth - width - 12, rect.right - width - 10);
  if (
    rect.width < width + 20 ||
    right < left ||
    y < headerBottom + 12 ||
    rect.top > viewportHeight - 32
  )
    return null;
  return {
    x: clamp(pointerX - width / 2, left, right),
    y,
    left,
    right,
    surface: 'card',
  };
}
