import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import Hls from 'hls.js';
import { App } from './app';

describe('HLS player', () => {
  beforeEach(async () => {
    vi.spyOn(Hls, 'isSupported').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the player and stream input', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('h1')?.textContent).toContain('HLS Video Player');
    expect(element.querySelector<HTMLInputElement>('#videoUrl')?.value).toBe(
      fixture.componentInstance.videoUrl,
    );
    expect(fixture.componentInstance.isLoading).toBe(true);
    element.querySelector('video')?.dispatchEvent(new Event('loadedmetadata'));
    expect(fixture.componentInstance.isLoading).toBe(false);
  });

  it('loads a new stream through the URL input in a native HLS browser', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector<HTMLInputElement>('#videoUrl');
    if (!input) throw new Error('Missing video URL input');
    input.value = 'https://example.com/video.m3u8';
    const button = Array.from(element.querySelectorAll('button')).find(
      candidate => candidate.textContent?.trim() === 'Load',
    );
    button?.click();
    expect(fixture.componentInstance.videoUrl).toBe(input.value);
    expect(element.querySelector('video')?.src).toBe(input.value);
    expect(fixture.componentInstance.hasError).toBe(false);
  });
});
