import { finiteValue, resourceOrigin } from './diagnostics';

export interface FragmentInfo {
  track: string;
  sequence: number | 'initSegment';
  part: number | null;
  level: number;
  start: number;
  duration: number;
  url: string;
  rendition: string;
}

export type RequestState = 'Loading' | 'Loaded' | 'Failed' | 'Timed out' | 'Aborted';
export interface SegmentRequest extends Omit<FragmentInfo, 'url'> {
  origin: string;
  state: RequestState;
  httpStatus: number | null;
  downloadMs: number | null;
  completedAtMs: number | null;
}
interface SegmentEvidence {
  request: SegmentRequest;
  when: 'At wait' | 'During wait';
  stateThen: RequestState;
  nearPosition: boolean;
}
export type WaitEnd = 'Playing' | 'Paused' | 'Seek started' | 'Ended' | 'Stopped' | 'Playback failed';
export interface BufferWait {
  id: number;
  atMs: number;
  position: number;
  bufferSeconds: number;
  rendition: string;
  kind: 'Startup' | 'Rebuffer' | 'Seeking';
  native: boolean;
  durationMs: number | null;
  endedBy: WaitEnd | null;
  segments: SegmentEvidence[];
}

// Timestamp offsets and fractions of a frame can place the playhead just before the next segment.
function nearPlayhead(request: SegmentRequest, position: number) {
  return request.sequence !== 'initSegment' && Number.isFinite(request.start) && request.duration > 0 &&
    request.start <= position + 0.15 && position < request.start + request.duration;
}

export class StreamDoctor {
  readonly waits: BufferWait[] = [];
  readonly buffer: {atMs: number; seconds: number}[] = [];
  private readonly recent: SegmentRequest[] = [];
  private readonly requests = new WeakMap<object, SegmentRequest>();
  private pending: BufferWait | null = null;
  private nextId = 1;
  private hasPlayed = false;
  private readonly epoch = performance.now();

  sample(seconds: number, now: number) {
    const atMs = Math.max(0, now - this.epoch);
    if (this.buffer.length && atMs - this.buffer[this.buffer.length - 1].atMs < 950) return;
    this.buffer.push({atMs, seconds});
    if (this.buffer.length > 60) this.buffer.shift();
  }

  requested(key: object, info: FragmentInfo) {
    if (info.track !== 'main' && info.track !== 'audio') return;
    const {url, ...fields} = info;
    const request: SegmentRequest = {
      ...fields, origin: resourceOrigin(url), state:'Loading', httpStatus:null, downloadMs:null, completedAtMs:null,
    };
    this.requests.set(key, request);
    this.recent.unshift(request);
    if (this.recent.length > 32) this.recent.pop();
    if (this.pending && nearPlayhead(request, this.pending.position)) {
      const segments = this.pending.segments;
      // Preserve evidence at onset and the most recent relevant attempt during a long wait.
      if (segments.length >= 4) segments.pop();
      segments.push({request, when:'During wait', stateThen:'Loading', nearPosition:true});
    }
  }

  finished(key: object, state: Exclude<RequestState, 'Loading'>, durationMs?: number, status?: number, now = performance.now()) {
    const request = this.requests.get(key);
    if (!request || request.state !== 'Loading') return;
    request.state = state;
    request.completedAtMs = Math.max(0, now-this.epoch);
    request.downloadMs = finiteValue(durationMs);
    request.httpStatus = status && Number.isInteger(status) && status >=100 && status <=599 ? status : null;
  }

  waiting(position: number, bufferSeconds: number, rendition: string, native: boolean, seeking: boolean, now: number) {
    if (this.pending) return;
    const atMs = Math.max(0, now-this.epoch);
    const seen = new Set<string>();
    const near = this.recent.filter(request=>{
      if (!nearPlayhead(request,position)) return false;
      const key = [request.track,request.level,request.sequence,request.part,request.start].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Look first for an unfinished or failed relevant transfer, then a completed one.
    const candidates = [...near.filter(r=>r.state!=='Loaded'), ...near.filter(r=>r.state==='Loaded')];
    if (!candidates.length) candidates.push(...this.recent.filter(r=>r.state==='Loading'));
    this.pending = {
      id:this.nextId++, atMs, position, bufferSeconds, rendition,
      kind:seeking?'Seeking':this.hasPlayed?'Rebuffer':'Startup', native, durationMs:null, endedBy:null,
      segments:candidates.slice(0,2).map(request=>({
        request, when:'At wait', stateThen:request.state, nearPosition:nearPlayhead(request,position),
      })),
    };
    this.waits.unshift(this.pending);
    if (this.waits.length > 24) this.waits.pop();
  }

  finishWait(endedBy: WaitEnd, now: number) {
    if (endedBy === 'Playing') this.hasPlayed = true;
    if (!this.pending) return;
    this.pending.endedBy=endedBy;
    this.pending.durationMs=Math.max(0,now-this.epoch-this.pending.atMs);
    this.pending=null;
  }
}

export function explainWait(wait: BufferWait): string {
  if (wait.kind==='Seeking') return 'Playback was seeking a new position when the browser signaled a wait.';
  const pending = wait.segments.find(s=>s.nearPosition && s.stateThen==='Loading' && s.when==='At wait');
  const end = wait.durationMs === null ? Infinity : wait.atMs + wait.durationMs;
  const failed = wait.segments.find(s=>s.nearPosition && (s.request.state==='Failed' || s.request.state==='Timed out')
    && s.request.completedAtMs !== null && s.request.completedAtMs >= wait.atMs - 2000 && s.request.completedAtMs <= end);
  if (wait.bufferSeconds <= .25 && failed) return 'Very little playable video remained near this position, and a matching segment request failed or timed out.';
  if (wait.bufferSeconds <= .25 && pending) return 'The playable buffer was nearly empty while a segment near this position was still loading.';
  if (wait.bufferSeconds <= .25) return 'The browser had very little playable video ahead when it reported the wait.';
  return 'The browser reported a wait with buffered video ahead. These observations do not identify a specific cause.';
}
