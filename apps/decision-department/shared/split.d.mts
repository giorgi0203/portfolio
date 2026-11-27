export interface SplitItem {
  id: string;
  quantity: number;
  unitMinor: number;
}
export interface Claim {
  itemId: string;
  participantId: string;
  weight: number;
}
export interface PersonTotal {
  id: string;
  itemsMinor: number;
  feeMinor: number;
  totalMinor: number;
}
export interface SplitTotals {
  subtotalMinor: number;
  feeMinor: number;
  totalMinor: number;
  unassignedMinor: number;
  people: PersonTotal[];
}
export function calculateSplit(
  items: SplitItem[],
  participants: { id: string }[],
  claims: Claim[],
  feeMinor: number,
): SplitTotals;
