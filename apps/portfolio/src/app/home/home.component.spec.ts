import { TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';

describe('Personal workshop', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
    }).compileComponents();
  });

  it('renders the portrait and working app links without an API', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(
      page
        .querySelector('a[aria-label="Open HLS Inspector"]')
        ?.getAttribute('href'),
    ).toBe('https://hls-player.giorgi.app/');
    expect(
      page
        .querySelector('a[aria-label="Open Smart Todo List"]')
        ?.getAttribute('href'),
    ).toBe('https://smart-todolist.giorgi.app/');
    expect(page.querySelector('a[aria-label="Open HTTP Playground"]')?.getAttribute('href')).toBe('https://http-playground.giorgi.app/');
    expect(page.querySelector('a[aria-label="Open The Decision Department"]')?.getAttribute('href')).toBe('https://decisions.giorgi.app/');
    expect(page.querySelector('.hero-portrait')?.getAttribute('alt')).toContain(
      'Giorgi',
    );
    expect(page.querySelectorAll('[data-app-card]').length).toBe(7);
    for(const host of ['example-mcp','mcp','api']) expect(page.querySelector('a[href="https://'+host+'.giorgi.app/"]')).toBeNull();
  });

  it('filters the drawer to useful apps', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const button = Array.from(page.querySelectorAll('.filters button')).find(
      (item) => item.textContent?.includes('Useful-ish'),
    );
    button?.click();
    fixture.detectChanges();
    expect(
      page.querySelector('[aria-label="Open Smart Todo List"]'),
    ).not.toBeNull();
    expect(page.querySelector('[aria-label="Open HLS Inspector"]')).toBeNull();
    expect(page.querySelector('[aria-label="Open HTTP Playground"]')).not.toBeNull();
    expect(page.querySelector('[aria-label="Open The Decision Department"]')).toBeNull();
    expect(page.querySelectorAll('[data-app-card]').length).toBe(5);
  });

  it('offers another idea for a future project', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    const before = page.querySelector('#next-idea')?.textContent;
    page.querySelector<HTMLButtonElement>('.idea-button')?.click();
    fixture.detectChanges();
    expect(page.querySelector('#next-idea')?.textContent).not.toBe(before);
  });

  it('lets the cat approve the website', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    page
      .querySelector<HTMLButtonElement>(
        '[aria-label="Ask the cat for a review"]',
      )
      ?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="status"]')?.textContent).toContain(
      'looks shippable',
    );
  });
});
