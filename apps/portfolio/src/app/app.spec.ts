import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, NoopAnimationsModule], // Use NoopAnimationsModule for testing
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')).toBeTruthy();
  });

  it('should have skills data', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.skills.length).toBeGreaterThan(0);
    expect(app.skills[0]).toHaveProperty('name');
    expect(app.skills[0]).toHaveProperty('level');
    expect(app.skills[0]).toHaveProperty('icon');
  });

  it('should have projects data', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.projects.length).toBeGreaterThan(0);
    expect(app.projects[0]).toHaveProperty('title');
    expect(app.projects[0]).toHaveProperty('description');
  });

  it('should have about me data', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.aboutMe).toHaveProperty('name');
    expect(app.aboutMe).toHaveProperty('title');
    expect(app.aboutMe).toHaveProperty('description');
  });

  it('should have particles for background animation', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.particles.length).toBe(50);
    expect(app.particles[0]).toHaveProperty('x');
    expect(app.particles[0]).toHaveProperty('y');
    expect(app.particles[0]).toHaveProperty('size');
    expect(app.particles[0]).toHaveProperty('speed');
  });

  it('should have scrollToSection method', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(typeof app.scrollToSection).toBe('function');
  });

  it('should have downloadResume method', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(typeof app.downloadResume).toBe('function');
  });



  describe('Component methods', () => {
    it('should call scrollToSection without errors', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      
      // Mock getElementById to avoid DOM errors in tests
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      
      expect(() => app.scrollToSection('home')).not.toThrow();
    });

    it('should call downloadResume without errors', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      
      // Spy on console.log to verify the method is called
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      
      app.downloadResume();
      expect(consoleSpy).toHaveBeenCalledWith('Download resume clicked');
    });


  });
});
