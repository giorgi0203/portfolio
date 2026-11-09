import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ApiService } from '../services/api.service';
import { HomeComponent } from './home.component';

describe('Portfolio deployed apps', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ApiService, useValue: { getSkills: () => of([]) } },
      ],
    }).compileComponents();
  });

  it('renders working subdomain links without a projects API', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('a[aria-label="Open HLS Player"]')?.getAttribute('href'))
      .toBe('https://hls-player.giorgi.app/');
    expect(page.querySelector('a[aria-label="Open Smart Todo List"]')?.getAttribute('href'))
      .toBe('https://smart-todolist.giorgi.app/');
    expect(page.querySelectorAll('#projects img').length).toBe(2);
    expect(page.querySelector('a[href="/angular-playground"]')).toBeNull();
  });
});
