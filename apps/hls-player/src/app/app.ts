import { Component, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Hls, { type LoaderStats } from 'hls.js';
import { finiteValue, parsePlaylist, readPlaylist, resourceOrigin, validateStreamUrl, type PlaylistSummary, type Rendition } from './diagnostics';

interface NetworkEntry { time: string; kind: string; result: string; origin: string; bytes: number | null; milliseconds: number | null; throughput: number | null; }
interface AudioTrack { index: number; label: string; }
@Component({ imports: [FormsModule], selector: 'app-root', templateUrl: './app.html', styleUrl: './app.css' })
export class App implements OnDestroy {
  @ViewChild('videoElement', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;
  videoUrl = '';
  sampleUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  private hls: Hls | null = null;
  private controller?: AbortController;
  private poll?: ReturnType<typeof setInterval>;
  private generation = 0;
  private active = false;
  isLoading = false;
  hasError = false;
  errorMessage = '';
  inspectionWarning = '';
  status = 'Ready to inspect';
  engine = 'Not started';
  playlist: PlaylistSummary | null = null;
  qualityLevels: Rendition[] = [];
  audioTracks: AudioTrack[] = [];
  selectedQuality = -1;
  selectedAudio = -1;
  currentLevel = -1;
  currentTime = 0;
  duration: number | null = null;
  bufferSeconds = 0;
  bufferedRanges = 'None';
  bandwidth: number | null = null;
  liveLatency: number | null = null;
  manifestTime: number | null = null;
  segmentTime: number | null = null;
  segmentBytes = 0;
  loadedSegments = 0;
  retryCount = 0;
  copyMessage = '';
  sourceOrigin = '';
  streamType = 'Unknown';
  targetDuration: number | null = null;
  mediaSegments: number | null = null;
  listedDuration: number | null = null;
  encrypted = false;
  entries: NetworkEntry[] = [];

  ngOnDestroy() { this.stop(); }
  async changeVideoUrl(input: string) {
    let url: URL;
    try { url = validateStreamUrl(input); }
    catch (error) { this.hasError = true; this.errorMessage = error instanceof Error ? error.message : 'Enter a valid HTTP or HTTPS playlist URL.'; return; }
    this.stop(false);
    const generation = this.generation;
    this.videoUrl = url.href; this.sourceOrigin = url.origin; this.active = true;
    this.resetDiagnostics(); this.isLoading = true; this.hasError = false; this.errorMessage = ''; this.status = 'Fetching playlist…';
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 12000);
    const start = performance.now();
    this.log('Inspection', 'Started', url.href);
    try {
      const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', cache: 'no-store', mode: 'cors' });
      const text = await readPlaylist(response, controller.signal);
      if (generation !== this.generation) return;
      this.playlist = parsePlaylist(text); this.qualityLevels = this.playlist.renditions;
      this.targetDuration = this.playlist.targetDuration; this.mediaSegments = this.playlist.kind === 'media' ? this.playlist.segmentCount : null;
      this.listedDuration = this.playlist.listedDuration; this.encrypted = this.playlist.encrypted;
      this.streamType = this.playlist.live === null ? 'Awaiting media playlist' : this.playlist.live ? 'Live' : 'VOD';
      this.manifestTime = Math.round(performance.now() - start);
      this.log('Inspection', this.playlist.kind === 'master' ? 'Master playlist' : 'Media playlist', url.href, new TextEncoder().encode(text).byteLength, this.manifestTime);
      this.initializePlayer(url.href);
      this.poll = setInterval(() => this.updateMedia(), 500);
    } catch (error) {
      if (generation !== this.generation) return;
      this.hasError = true; this.isLoading = false; this.status = 'Inspection failed';
      const message = error instanceof Error ? error.message : '';
      this.errorMessage = controller.signal.aborted ? 'The playlist did not respond within 12 seconds. Retry or try another stream.' : message.startsWith('HTTP ') || message.startsWith('The ') ? message : 'The browser could not read this stream. Check the URL, your connection, and whether the stream server permits cross-origin (CORS) access.';
      this.log('Inspection', controller.signal.aborted ? 'Timed out' : 'Failed', url.href);
      if (!Hls.isSupported() && this.videoElement.nativeElement.canPlayType('application/vnd.apple.mpegurl') && (error instanceof TypeError || controller.signal.aborted)) {
        this.inspectionWarning = 'Playlist inspection is unavailable, possibly because of server CORS rules. The native browser player can still try this stream; manifest and request diagnostics remain unavailable.';
        this.hasError = false; this.errorMessage = ''; this.initializePlayer(url.href);
        this.poll = setInterval(() => this.updateMedia(), 500);
      }
    } finally { clearTimeout(timer); }
  }
  private resetDiagnostics() {
    this.playlist = null; this.entries = []; this.qualityLevels = []; this.audioTracks = [];
    this.selectedQuality = -1; this.selectedAudio = -1; this.currentLevel = -1; this.currentTime = 0;
    this.duration = null; this.bufferSeconds = 0; this.bufferedRanges = 'None'; this.bandwidth = null; this.liveLatency = null;
    this.manifestTime = null; this.segmentTime = null; this.segmentBytes = 0; this.loadedSegments = 0; this.retryCount = 0;
    this.copyMessage = ''; this.inspectionWarning = ''; this.engine = 'Inspecting'; this.streamType = 'Unknown'; this.targetDuration = null; this.mediaSegments = null; this.listedDuration = null; this.encrypted = false;
  }
  private initializePlayer(url: string) {
    const video = this.videoElement.nativeElement;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30,
        manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 1, levelLoadingTimeOut: 10000, levelLoadingMaxRetry: 1, fragLoadingTimeOut: 15000, fragLoadingMaxRetry: 1 });
      this.hls = hls; this.engine = 'Hls.js · MediaSource';
      hls.on(Hls.Events.MANIFEST_LOADING, () => this.log('Manifest', 'Requested', url));
      hls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => this.logStats('Manifest', 'Loaded', data.url, data.stats));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.isLoading = false; this.status = 'Manifest ready · press play';
        this.updateLevels(); this.updateAudio();
      });
      hls.on(Hls.Events.LEVEL_LOADING, (_event, data) => this.log('Media playlist', 'Requested', data.url));
      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        this.streamType = data.details.live ? 'Live' : 'VOD'; this.targetDuration = finiteValue(data.details.targetduration);
        this.listedDuration = finiteValue(data.details.totalduration); this.mediaSegments = data.details.fragments.length;
        this.encrypted = data.details.encryptedFragments.length > 0 || this.encrypted;
        this.logStats('Media playlist', 'Loaded', data.details.url, data.stats); this.updateLevels();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => { this.currentLevel = data.level; this.log('Quality', 'Now level ' + data.level, url); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this.updateAudio());
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => { this.selectedAudio = data.id; this.log('Audio', 'Track changed', url); });
      hls.on(Hls.Events.FRAG_LOADING, (_event, data) => this.log('Segment', 'Requested', data.frag.url));
      hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
        const stats = data.part?.stats || data.frag.stats;
        this.segmentTime = finiteValue(stats.loading.end - stats.loading.start); this.segmentBytes += stats.loaded;
        this.loadedSegments++; this.logStats('Segment', 'Loaded', data.frag.url, stats); this.updateMedia();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const detail = /^[a-zA-Z0-9_-]{1,80}$/.test(data.details) ? data.details : 'streamError';
        const status = typeof data.response?.code === 'number' ? ' · HTTP ' + data.response.code : '';
        this.log(data.fatal ? 'Error' : 'Warning', detail + status, data.url || url);
        if (data.fatal) {
          this.hasError = true; this.isLoading = false; this.status = 'Playback failed'; hls.stopLoad();
          this.errorMessage = data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'A playlist, segment, or key request failed' + status + '. Check server CORS permissions and stream availability, then retry.' : 'The browser could not decode this stream (' + detail + '). Try another rendition or a compatible stream.';
        }
      });
      hls.attachMedia(video); hls.loadSource(url);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      this.engine = 'Native HLS · browser-managed'; this.status = 'Native player loading…';
      video.src = url;
      this.isLoading = false;
    } else {
      this.engine = 'Playback unavailable'; this.status = 'Manifest inspected'; this.isLoading = false;
      this.hasError = true; this.errorMessage = 'This browser cannot play HLS. You can still inspect the playlist metadata. Try a browser with Hls.js MediaSource or native HLS support.';
    }
  }
  private updateLevels() {
    if (!this.hls) return;
    this.qualityLevels = this.hls.levels.map((level, index) => ({ index, width: finiteValue(level.width || undefined), height: finiteValue(level.height || undefined), bitrate: finiteValue(level.bitrate || undefined), codecs: this.safeCodecs([level.videoCodec, level.audioCodec].filter(Boolean).join(', ')) }));
  }
  private updateAudio() {
    if (!this.hls) return;
    this.audioTracks = this.hls.audioTracks.map((track, index) => ({ index, label: (track.name || 'Track ' + (index + 1)).slice(0, 60) + (track.lang ? ' · ' + track.lang.slice(0, 12) : '') }));
    this.selectedAudio = this.hls.audioTrack;
  }
  updateMedia(event?: Event) {
    if (!this.active) return;
    const video = this.videoElement.nativeElement;
    this.currentTime = finiteValue(video.currentTime) || 0; this.duration = finiteValue(video.duration);
    const ranges: string[] = []; let seconds = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i), end = video.buffered.end(i);
      ranges.push(start.toFixed(1) + '–' + end.toFixed(1) + 's');
      if (start <= video.currentTime && end >= video.currentTime) seconds = end - video.currentTime;
    }
    this.bufferedRanges = ranges.join(', ') || 'None'; this.bufferSeconds = Math.max(0, seconds);
    if (this.hls) {
      this.bandwidth = this.loadedSegments ? finiteValue(this.hls.bandwidthEstimate) : null;
      this.liveLatency = this.streamType === 'Live' && this.loadedSegments > 0 && this.hls.liveSyncPosition !== null ? finiteValue(this.hls.latency) : null;
    }
    if (event) {
      const states: Record<string, string> = { play: 'Playing', playing: 'Playing', pause: 'Paused', waiting: 'Buffering', stalled: 'Waiting for data', ended: 'Ended', loadedmetadata: 'Ready · press play' };
      if (states[event.type]) { this.status = states[event.type]; this.log('Playback', states[event.type], this.videoUrl); }
      if (event.type === 'loadedmetadata') this.isLoading = false;
    }
  }
  mediaError() {
    if (!this.active || this.hasError) return;
    this.hasError = true; this.isLoading = false; this.status = 'Playback failed';
    this.errorMessage = 'The browser reported a media decoding or loading error. Inspect the stream codecs and CORS settings, or try a compatible rendition.';
    this.log('Error', 'Browser media error', this.videoUrl);
  }
  chooseQuality(event: Event) {
    this.selectedQuality = Number((event.target as HTMLSelectElement).value);
    if (this.hls) { this.hls.nextLevel = this.selectedQuality; this.log('Quality', this.selectedQuality < 0 ? 'Automatic adaptation' : 'Requested level ' + this.selectedQuality, this.videoUrl); }
  }
  chooseAudio(event: Event) { this.selectedAudio = Number((event.target as HTMLSelectElement).value); if (this.hls) this.hls.audioTrack = this.selectedAudio; }
  retry() { this.retryCount++; const count = this.retryCount; void this.changeVideoUrl(this.videoUrl).then(() => this.retryCount = count); }
  stop(markStopped = true) {
    this.generation++; this.active = false; this.controller?.abort('cancelled'); this.controller = undefined;
    if (this.poll) clearInterval(this.poll); this.poll = undefined;
    this.hls?.destroy(); this.hls = null;
    const video = this.videoElement?.nativeElement;
    if (video && (video.getAttribute('src') || video.currentSrc || video.readyState > 0)) { video.pause(); video.removeAttribute('src'); video.load(); }
    this.isLoading = false; if (markStopped) this.status = 'Stopped';
  }
  clearLog() { this.entries = []; }
  private logStats(kind: string, result: string, url: string, stats: LoaderStats) {
    const duration = finiteValue(stats.loading.end - stats.loading.start);
    this.log(kind, result, url, stats.loaded, duration, duration && stats.loaded ? stats.loaded * 8 * 1000 / duration : null);
  }
  private log(kind: string, result: string, url: string, bytes: number | null = null, milliseconds: number | null = null, throughput: number | null = null) {
    this.entries = [{ time: new Date().toISOString(), kind, result, origin: resourceOrigin(url), bytes: finiteValue(bytes ?? undefined), milliseconds: finiteValue(milliseconds ?? undefined), throughput: finiteValue(throughput ?? undefined) }, ...this.entries].slice(0, 120);
  }
  report() {
    return { product: 'Giorgi HLS Inspector', generatedAt: new Date().toISOString(), privacy: 'Origins only. URL paths, query strings, fragments, authentication headers and raw playlists are excluded.', sourceOrigin: this.sourceOrigin, engine: this.engine, status: this.status,
      playlist: this.playlist ? { ...this.playlist, renditions: this.qualityLevels } : null,
      playback: { streamType: this.streamType, currentTimeSeconds: this.currentTime, durationSeconds: this.duration, bufferedSeconds: this.bufferSeconds, bufferedRanges: this.bufferedRanges, selectedQuality: this.selectedQuality, activeLevel: this.currentLevel, bandwidthEstimateBps: this.bandwidth, liveLatencySeconds: this.liveLatency },
      media: { type: this.streamType, targetDurationSeconds: this.targetDuration, listedSegments: this.mediaSegments, listedDurationSeconds: this.listedDuration, encrypted: this.encrypted, availableAudioTracks: this.audioTracks.length },
      network: { inspectionMilliseconds: this.manifestTime, loadedSegments: this.loadedSegments, segmentBytes: this.segmentBytes, latestSegmentMilliseconds: this.segmentTime }, events: this.entries };
  }
  async copyReport() { try { await navigator.clipboard.writeText(JSON.stringify(this.report(), null, 2)); this.copyMessage = 'Redacted report copied.'; } catch { this.copyMessage = 'Clipboard unavailable. Download the report instead.'; } }
  downloadReport() { const blob = new Blob([JSON.stringify(this.report(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'hls-diagnostics.json'; a.click(); URL.revokeObjectURL(url); this.copyMessage = 'Redacted report downloaded.'; }
  private safeCodecs(value: string) { return /^[a-zA-Z0-9., _-]{1,120}$/.test(value) ? value : 'Not declared'; }
  seconds(value: number | null) { return value === null ? 'Unavailable' : value.toFixed(1) + ' s'; }
  kbps(value: number | null) { return value === null ? 'Not declared' : Math.round(value / 1000).toLocaleString() + ' kbps'; }
  size(value: number | null) { return value === null ? '—' : value >= 1024 * 1024 ? (value / 1024 / 1024).toFixed(2) + ' MB' : (value / 1024).toFixed(1) + ' KB'; }
  time(iso: string) { return iso.slice(11, 23); }
  get manualQualityAvailable() { return !!this.hls && this.qualityLevels.length > 0; }
}
