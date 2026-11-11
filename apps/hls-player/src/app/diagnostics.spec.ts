import { parsePlaylist, resourceOrigin, validateStreamUrl, readPlaylist } from './diagnostics';
describe('Stream diagnostics', () => {
  it('parses quoted codecs and real rendition attributes without exporting URLs', () => {
    const result = parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=150000,RESOLUTION=320x180,CODECS="avc1.42e01e,mp4a.40.2"\n/private/low.m3u8?token=secret\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360\n/other/high.m3u8\n');
    expect(result.kind).toBe('master'); expect(result.renditionCount).toBe(2);
    expect(result.renditions[0].codecs).toBe('avc1.42e01e,mp4a.40.2'); expect(result.renditions[1].height).toBe(360);
    expect(JSON.stringify(result)).not.toContain('secret'); expect(JSON.stringify(result)).not.toContain('m3u8');
  });
  it('distinguishes live and VOD and summarizes segment durations and encryption', () => {
    const source = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example/private?token=secret"\n#EXTINF:3.2,\na.ts\n#EXTINF:4.0,\nb.ts\n';
    const live = parsePlaylist(source); expect(live.live).toBe(true); expect(live.targetDuration).toBe(4); expect(live.segmentCount).toBe(2); expect(live.listedDuration).toBeCloseTo(7.2); expect(live.encrypted).toBe(true);
    expect(parsePlaylist(source + '#EXT-X-ENDLIST\n').live).toBe(false); expect(JSON.stringify(live)).not.toContain('secret');
  });
  it('rejects non-playlists, unsupported URL schemes, and embedded credentials', () => {
    expect(() => parsePlaylist('<html>not a manifest</html>')).toThrow();
    expect(() => validateStreamUrl('javascript:alert(1)')).toThrow();
    expect(() => validateStreamUrl('https://name:secret@example.com/master.m3u8')).toThrow();
    expect(resourceOrigin('https://example.com/private/secret/master.m3u8?token=secret#private')).toBe('https://example.com');
  });
  it('bounds actual response bytes even if the server omits content-length', async () => {
    await expect(readPlaylist(new Response('x'.repeat(1024 * 1024 + 1)), new AbortController().signal)).rejects.toThrow('1 MB');
    await expect(readPlaylist(new Response('missing', { status: 404 }), new AbortController().signal)).rejects.toThrow('HTTP 404');
  });
});
