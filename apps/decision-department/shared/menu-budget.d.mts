export const MAX_MONEY_MINOR: 1000000;
export interface MenuItem {
  id: string;
  name: string;
  priceMinor: number;
}
export interface CombinationItem extends MenuItem {
  quantity: number;
}
export interface MenuCombination {
  items: CombinationItem[];
  totalMinor: number;
  remainingMinor: number;
  key: string;
}
export interface CombinationResult {
  combinations: MenuCombination[];
  minimumMinor?: number;
  reason?: 'empty' | 'unaffordable';
}
export function parseMoney(value: string): number | null;
export function generateCombinations(
  items: readonly MenuItem[],
  budgetMinor: number,
  people: number,
  options?: { random?: () => number; limit?: number },
): CombinationResult;
