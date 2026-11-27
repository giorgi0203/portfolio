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
  origin?: 'preview' | 'workspace';
  /** One-based position among the currently rendered instances of this source block. */
  instanceIndex?: number;
  instanceCount?: number;
  /** Last browser-observed change to this particular instance during this run. */
  lastDomChange?: InspectionChange;
  reason?: string;
}
export interface InspectionChange {
  name: string;
  before: string;
  after: string;
}
export interface InspectionActivity {
  id: number;
  kind: 'event' | 'render';
  phase: string;
  at: number;
  blockId: string | null;
  eventName: string;
  handler: string;
  changes: InspectionChange[];
}
