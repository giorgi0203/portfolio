import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideNoopAnimations()],
    }).compileComponents();
  });

  it('renders the portfolio owner in the home link', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('nav a');
    expect(link.getAttribute('aria-label')).toBe('Giorgi Arabuli — home');
    expect(link.textContent).toContain('giorgi.app');
    expect(link.getAttribute('href')).toBe('/');
  });

  it('links directly to the deployed HLS player', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      'a[href="https://hls-player.giorgi.app/"]',
    );
    expect(link?.textContent.trim()).toBe('HLS Player');
  });
  it('links directly to the deployed todo list', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      'a[href="https://smart-todolist.giorgi.app/"]',
    );
    expect(link?.textContent.trim()).toBe('Smart Todo List');
  });
});
