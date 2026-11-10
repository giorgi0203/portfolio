import { TestBed } from '@angular/core/testing';
import Hls from 'hls.js';
import { App } from './app';
const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST\n';
describe('HLS Inspector', () => {
  beforeEach(async () => {
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(playlist))));
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('does not contact external stream servers before a user loads a playlist', () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Inspector');
    expect(fetch).not.toHaveBeenCalled(); expect(fixture.componentInstance.isLoading).toBe(false);
  });
  it('inspects a media playlist and retains playback through native HLS fallback', async () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    await fixture.componentInstance.changeVideoUrl('https://example.com/private/master.m3u8?token=super-secret');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video').src).toContain('token=super-secret');
    expect(fixture.componentInstance.engine).toContain('Native'); expect(fixture.componentInstance.streamType).toBe('VOD');
    expect(fixture.componentInstance.hasError).toBe(false);
    const report = JSON.stringify(fixture.componentInstance.report());
    expect(report).not.toContain('super-secret'); expect(report).not.toContain('/private/'); expect(report).not.toContain('master.m3u8');
    expect(report).toContain('https://example.com'); fixture.destroy();
  });
  it('keeps native playback available when browser CORS blocks inspection', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    await fixture.componentInstance.changeVideoUrl('https://example.com/live.m3u8');
    expect(fixture.componentInstance.engine).toContain('Native'); expect(fixture.componentInstance.hasError).toBe(false);
    expect(fixture.componentInstance.playlist).toBeNull(); expect(fixture.componentInstance.inspectionWarning).toContain('unavailable');
    expect(fixture.nativeElement.querySelector('video').src).toBe('https://example.com/live.m3u8'); fixture.destroy();
  });
  it('shows invalid URL errors without requesting or logging the supplied source', async () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    await fixture.componentInstance.changeVideoUrl('javascript:private-data'); fixture.detectChanges();
    expect(fetch).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('HTTP');
    expect(JSON.stringify(fixture.componentInstance.report())).not.toContain('private-data'); fixture.destroy();
  });
});
