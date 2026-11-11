export interface Rendition {
  index: number;
  width: number | null;
  height: number | null;
  bitrate: number | null;
  codecs: string;
}
export interface PlaylistSummary {
  kind: 'master' | 'media';
  renditionCount: number;
  renditions: Rendition[];
  audioTrackCount: number;
  targetDuration: number | null;
  segmentCount: number;
  listedDuration: number | null;
  live: boolean | null;
  encrypted: boolean;
}

/** Reports contain an origin only: signed query strings, credentials and paths never leave the URL input. */
export function resourceOrigin(input: string): string {
  try { return new URL(input).origin; } catch { return 'unavailable'; }
}
export function validateStreamUrl(input: string): URL {
  const url = new URL(input.trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Enter an HTTP or HTTPS playlist URL.');
  if (url.username || url.password) throw new Error('Use a URL without embedded username or password.');
  if (typeof location !== 'undefined' && location.protocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('Use HTTPS for streams opened from this HTTPS page.');
  }
  return url;
}
export function finiteValue(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
export function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) result[match[1]] = match[2].replace(/^"|"$/g, '');
  return result;
}
export function parsePlaylist(text: string): PlaylistSummary {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('The response is not an HLS playlist (#EXTM3U is missing).');
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const renditions = lines.filter(line => line.startsWith('#EXT-X-STREAM-INF:')).map((line, index) => {
    const attrs = attributes(line.slice(line.indexOf(':') + 1));
    const [width, height] = (attrs['RESOLUTION'] || '').split('x').map(Number);
    return { index, width: width > 0 ? finiteValue(width) : null, height: height > 0 ? finiteValue(height) : null, bitrate: finiteValue(Number(attrs['AVERAGE-BANDWIDTH'] || attrs['BANDWIDTH']) || undefined), codecs: /^[\w., -]{1,120}$/.test(attrs['CODECS'] || '') ? attrs['CODECS'] : 'Not declared' };
  });
  const durations = lines.filter(line => line.startsWith('#EXTINF:')).map(line => Number(line.slice(8).split(',')[0])).filter(Number.isFinite);
  const master = renditions.length > 0;
  const target = lines.find(line => line.startsWith('#EXT-X-TARGETDURATION:'));
  return { kind: master ? 'master' : 'media', renditionCount: renditions.length, renditions,
    audioTrackCount: lines.filter(line => line.startsWith('#EXT-X-MEDIA:') && attributes(line.slice(13))['TYPE'] === 'AUDIO').length,
    targetDuration: target ? finiteValue(Number(target.split(':')[1])) : null, segmentCount: durations.length,
    listedDuration: durations.length ? durations.reduce((a, b) => a + b, 0) : null,
    live: master ? null : !lines.includes('#EXT-X-ENDLIST'),
    encrypted: lines.some(line => line.startsWith('#EXT-X-KEY:') && attributes(line.slice(11))['METHOD'] !== 'NONE') };
}
export async function readPlaylist(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok) throw new Error('HTTP ' + response.status + ': the playlist could not be loaded.');
  if (Number(response.headers.get('content-length')) > 1024 * 1024) throw new Error('The playlist exceeds the 1 MB inspection limit.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The playlist response was empty.');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('Inspection cancelled.');
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > 1024 * 1024) throw new Error('The playlist exceeds the 1 MB inspection limit.');
      parts.push(item.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}
