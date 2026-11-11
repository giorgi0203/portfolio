/** Bounded, serializable messages from the opaque preview. All offsets refer to the original TS editor source. */
export interface InspectionBinding {
  kind: 'text' | 'property' | 'event' | 'two-way';
  name: string;
  expression: string;
}
export interface InspectionBlock {
  id: string;
  component: string;
  tag: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  source: string;
  bindings: InspectionBinding[];
  controls: string[];
}
export interface InspectionSelection {
  blockId: string | null;
  component: string;
  tag: string;
  text: string;
  attributes: Array<{name: string; value: string}>;
  values: Record<string, string>;
  locals: Record<string, string>;
  pinned: boolean;
  reason?: string;
}
export interface InspectionActivity {
  id: number;
  kind: 'event' | 'render';
  phase: string;
  at: number;
  blockId: string | null;
  eventName: string;
  handler: string;
  changes: Array<{name:string; before:string; after:string}>;
}
