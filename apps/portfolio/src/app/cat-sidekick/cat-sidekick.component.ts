import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CatPerch, cardPerch, clamp } from './cat-geometry';

type CatState =
  | 'watching'
  | 'crouching'
  | 'jumping'
  | 'sleeping'
  | 'paused'
  | 'resting';

@Component({
  selector: 'app-cat-sidekick',
  standalone: true,
  templateUrl: './cat-sidekick.component.html',
  styleUrl: './cat-sidekick.component.css',
})
export class CatSidekickComponent implements AfterViewInit, OnDestroy {
  @ViewChild('sprite') private sprite!: ElementRef<HTMLElement>;
  readonly paused = signal(false);
  private readonly zone = inject(NgZone);
  private readonly preferenceKey = 'giorgi-cat-paused';
  private cleanups: (() => void)[] = [];
  private clock?: ReturnType<typeof setInterval>;
  private settle?: ReturnType<typeof setTimeout>;
  private crouch?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private eyeFrame = 0;
  private destroyed = false;
  private reduced = false;
  private touch = false;
  private hidden = false;
  private placementHidden = false;
  private x = 0;
  private y = 0;
  private width = 118;
  private height = 130;
  private pointer = { x: 0, y: 0 };
  private lastPointer = 0;
  private lastPounce = 0;
  private surface: CatPerch['surface'] = 'dock';
  private state: CatState = 'resting';

  ngAfterViewInit() {
    try {
      this.paused.set(localStorage.getItem(this.preferenceKey) === 'true');
    } catch {
      /* A cat needs no storage permission. */
    }
    this.zone.runOutsideAngular(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const coarse = window.matchMedia?.('(pointer: coarse)');
      const preferences = () => {
        this.reduced = !!reduced?.matches;
        this.touch = !!coarse?.matches;
        this.width = this.touch ? 86 : 118;
        this.height = this.touch ? 95 : 130;
        this.sprite.nativeElement.style.width = this.width + 'px';
        this.sprite.nativeElement.style.height = this.height + 'px';
        this.sprite.nativeElement.dataset['motion'] = this.reduced
          ? 'reduced'
          : this.touch
            ? 'touch'
            : 'full';
        this.stopMovement();
        this.land(this.findPerch(), true);
        this.setState(this.paused() ? 'paused' : 'resting');
      };
      for (const query of [reduced, coarse]) {
        query?.addEventListener?.('change', preferences);
        this.cleanups.push(() =>
          query?.removeEventListener?.('change', preferences),
        );
      }
      preferences();
      this.lastPointer = performance.now();
      this.lastPounce = performance.now();
      this.repositionSoon();
      this.listen(window, 'pointermove', (event) =>
        this.watch(event as PointerEvent),
      );
      this.listen(window, 'scroll', () => this.repositionSoon(), {
        passive: true,
      });
      this.listen(window, 'resize', () => this.repositionSoon(), {
        passive: true,
      });
      this.listen(document, 'visibilitychange', () => {
        if (document.hidden) this.stopMovement();
        else this.repositionSoon();
      });
      this.listen(document, 'focusin', () => this.updateVisibility());
      this.listen(document, 'focusout', () => this.updateVisibility());
      this.listen(document, 'click', (event) => {
        if (!(event.target as Element | null)?.closest('.cat-toggle'))
          this.repositionSoon();
      });
      this.clock = setInterval(() => this.tick(), 800);
    });
  }

  toggle() {
    this.paused.update((value) => !value);
    try {
      localStorage.setItem(this.preferenceKey, String(this.paused()));
    } catch {
      /* Choice still applies to this visit. */
    }
    this.zone.runOutsideAngular(() => {
      this.stopMovement();
      this.lastPointer = performance.now();
      this.lastPounce = performance.now();
      this.setState(this.paused() ? 'paused' : 'resting');
      this.look(0, 0);
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.stopMovement();
    cancelAnimationFrame(this.eyeFrame);
    clearInterval(this.clock);
    clearTimeout(this.settle);
    for (const cleanup of this.cleanups) cleanup();
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener, options);
    this.cleanups.push(() =>
      target.removeEventListener(type, listener, options),
    );
  }
  private setState(state: CatState) {
    this.state = state;
    this.sprite.nativeElement.dataset['state'] = state;
  }
  private active() {
    return (
      !this.destroyed &&
      !this.paused() &&
      !this.reduced &&
      !this.touch &&
      !document.hidden &&
      !this.hidden
    );
  }
  private look(x: number, y: number) {
    const style = this.sprite.nativeElement.style;
    style.setProperty('--look-x', x.toFixed(1) + 'px');
    style.setProperty('--look-y', y.toFixed(1) + 'px');
  }

  private watch(event: PointerEvent) {
    if (event.pointerType === 'touch' || !this.active()) return;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.lastPointer = performance.now();
    if (this.state === 'sleeping' || this.state === 'resting')
      this.setState('watching');
    if (!this.eyeFrame)
      this.eyeFrame = requestAnimationFrame(() => {
        this.eyeFrame = 0;
        this.look(
          clamp((this.pointer.x - this.x - this.width / 2) / 70, -4, 4),
          clamp((this.pointer.y - this.y - this.height / 3) / 90, -2.5, 2.5),
        );
      });
  }

  private tick() {
    this.updateVisibility();
    if (!this.active()) return;
    const now = performance.now();
    if (this.state === 'jumping' || this.state === 'crouching') return;
    if (now - this.lastPointer > 14000) {
      this.setState('sleeping');
      return;
    }
    if (now - this.lastPointer > 5000) {
      this.setState('resting');
      return;
    }
    if (now - this.lastPounce > 6500) {
      const perch = this.findPerch();
      if (Math.hypot(perch.x - this.x, perch.y - this.y) > 34)
        this.pounce(perch);
    }
  }

  private updateVisibility() {
    const focused = document.activeElement;
    const contact = document.querySelector('#contact')?.getBoundingClientRect();
    this.hidden =
      this.placementHidden ||
      !!document.querySelector('dialog[open],.analytics-choice') ||
      !!focused?.closest('input,textarea,[contenteditable="true"]') ||
      !!(contact && contact.top < innerHeight * 0.7);
    this.sprite.nativeElement.hidden = this.hidden;
    if (this.hidden) this.stopMovement();
  }

  private repositionSoon() {
    clearTimeout(this.settle);
    this.stopMovement();
    this.settle = setTimeout(() => {
      this.placementHidden = false;
      this.updateVisibility();
      if (this.hidden || this.destroyed) return;
      const perch = this.findPerch();
      this.updateVisibility();
      if (this.hidden) return;
      if (this.active() && Math.hypot(perch.x - this.x, perch.y - this.y) > 40)
        this.pounce(perch);
      else this.land(perch, true);
    }, 650);
  }

  private findPerch(): CatPerch {
    this.placementHidden = false;
    const header =
      document.querySelector('.site-header')?.getBoundingClientRect().bottom ??
      0;
    const perches: CatPerch[] = [];
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>('[data-app-card]'),
    )) {
      const perch = cardPerch(
        element.getBoundingClientRect(),
        this.width,
        this.height,
        innerWidth,
        innerHeight,
        header,
        this.pointer.x || innerWidth * 0.75,
      );
      if (!perch) continue;
      for (const x of [
        perch.x,
        perch.left,
        perch.right,
        (perch.left + perch.right) / 2,
      ]) {
        const candidate = { ...perch, x };
        if (this.clearPerch(candidate, element)) perches.push(candidate);
      }
    }
    if (perches.length)
      return perches.sort(
        (a, b) =>
          Math.hypot(a.x - this.pointer.x, a.y - this.pointer.y) -
          Math.hypot(b.x - this.pointer.x, b.y - this.pointer.y),
      )[0];
    const portrait = document
      .querySelector('.portrait-scene')
      ?.getBoundingClientRect();
    if (
      portrait &&
      portrait.bottom > header + this.height + 30 &&
      portrait.top < innerHeight - 80
    ) {
      const left = clamp(
        portrait.left + (this.touch ? 12 : portrait.width * 0.3),
        12,
        innerWidth - this.width - 12,
      );
      const right = clamp(
        portrait.right - this.width - 18,
        left,
        innerWidth - this.width - 12,
      );
      const perch: CatPerch = {
        x: clamp(
          (this.pointer.x || portrait.right) - this.width / 2,
          left,
          right,
        ),
        y: clamp(
          portrait.bottom - this.height - 6,
          header + 14,
          innerHeight - this.height - 16,
        ),
        left,
        right,
        surface: 'portrait',
      };
      const portraitCandidates = [perch.x, left, right, (left + right) / 2];
      for (let x = left; x <= right; x += 18) portraitCandidates.push(x);
      for (const x of portraitCandidates) {
        const candidate = { ...perch, x };
        if (this.clearPerch(candidate)) return candidate;
      }
    }
    const note = document
      .querySelector('.process-note')
      ?.getBoundingClientRect();
    if (note) {
      const perch = cardPerch(
        note,
        this.width,
        this.height,
        innerWidth,
        innerHeight,
        header,
        innerWidth,
      );
      if (perch && this.clearPerch(perch)) return { ...perch, surface: 'note' };
    }
    const x = innerWidth - this.width - 20;
    const dock: CatPerch = {
      x: Math.max(12, x),
      y: Math.max(header + 14, innerHeight - this.height - 24),
      left: 12,
      right: Math.max(12, x),
      surface: 'dock',
    };
    for (const candidate of [dock, { ...dock, x: 12 }])
      if (this.clearPerch(candidate)) return candidate;
    this.placementHidden = true;
    this.hidden = true;
    this.sprite.nativeElement.hidden = true;
    return dock;
  }

  private clearPerch(perch: CatPerch, landingCard?: HTMLElement) {
    const obstacles = document.querySelectorAll<HTMLElement>(
      'h1,h2,h3,p,.eyebrow,.filters,.tiny-note,button,input,textarea,[data-app-card],.future-card,.site-header,.cat-label,.human-stamp,.portrait-label,.process-note ol,.toolbox',
    );
    return Array.from(obstacles).every((element) => {
      if (
        element === landingCard ||
        landingCard?.contains(element) ||
        element.closest('app-cat-sidekick')
      )
        return true;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return true;
      return (
        perch.x + this.width + 5 <= rect.left ||
        perch.x - 5 >= rect.right ||
        perch.y + this.height - 3 <= rect.top ||
        perch.y - 8 >= rect.bottom
      );
    });
  }

  private land(perch: CatPerch, reset = false) {
    this.x = perch.x;
    this.y = perch.y;
    this.surface = perch.surface;
    const element = this.sprite.nativeElement;
    element.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
    element.style.setProperty('--jump-tilt', '0deg');
    element.dataset['surface'] = this.surface;
    if (reset)
      this.setState(
        this.paused()
          ? 'paused'
          : this.reduced || this.touch
            ? 'resting'
            : 'watching',
      );
  }

  private pounce(perch: CatPerch) {
    if (!this.active()) return;
    this.stopMovement();
    this.setState('crouching');
    this.lastPounce = performance.now();
    this.sprite.nativeElement.style.setProperty(
      '--facing',
      perch.x < this.x ? '-1' : '1',
    );
    this.crouch = setTimeout(() => {
      if (!this.active()) return;
      this.setState('jumping');
      const from = { x: this.x, y: this.y },
        start = performance.now();
      const animate = (now: number) => {
        if (!this.active()) return;
        const t = clamp((now - start) / 760, 0, 1),
          smooth = t * t * (3 - 2 * t),
          arc =
            Math.sin(t * Math.PI) *
            Math.min(94, Math.max(38, Math.abs(perch.x - from.x) * 0.15));
        this.x = from.x + (perch.x - from.x) * smooth;
        this.y = Math.max(
          (document.querySelector('.site-header')?.getBoundingClientRect()
            .bottom ?? 0) + 8,
          from.y + (perch.y - from.y) * smooth - arc,
        );
        this.sprite.nativeElement.style.transform = `translate3d(${this.x}px,${this.y}px,0)`;
        this.sprite.nativeElement.style.setProperty(
          '--jump-tilt',
          (Math.sin(t * Math.PI * 2) * (perch.x > from.x ? 9 : -9)).toFixed(1) +
            'deg',
        );
        if (t < 1) this.frame = requestAnimationFrame(animate);
        else {
          this.frame = 0;
          this.land(perch);
          this.setState('watching');
        }
      };
      this.frame = requestAnimationFrame(animate);
    }, 320);
  }
  private stopMovement() {
    clearTimeout(this.crouch);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.state === 'jumping' || this.state === 'crouching') {
      this.sprite.nativeElement.style.setProperty('--jump-tilt', '0deg');
      this.setState(this.paused() ? 'paused' : 'resting');
    }
  }
}
