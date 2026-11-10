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
import { gsap } from 'gsap';
import { clamp } from './cat-geometry';

type CatState =
  | 'watching'
  | 'resting'
  | 'grooming'
  | 'yawning'
  | 'stretching'
  | 'petting'
  | 'playing'
  | 'sleeping'
  | 'paused'
  | 'jumping';
type Activity = 'pet' | 'play' | 'sleep';
interface Habitat {
  anchor: HTMLElement;
  surface: 'portrait' | 'card';
  x: number;
  y: number;
  controlsX: number;
  controlsY: number;
  controlsWidth: number;
}

@Component({
  selector: 'app-cat-sidekick',
  standalone: true,
  templateUrl: './cat-sidekick.component.html',
  styleUrl: './cat-sidekick.component.css',
})
export class CatSidekickComponent implements AfterViewInit, OnDestroy {
  @ViewChild('sprite') private sprite!: ElementRef<HTMLElement>;
  @ViewChild('controls') private controls?: ElementRef<HTMLElement>;
  readonly paused = signal(false);
  private readonly zone = inject(NgZone);
  private readonly preferenceKey = 'giorgi-cat-paused';
  private cleanups: (() => void)[] = [];
  private context?: ReturnType<typeof gsap.context>;
  private idle?: ReturnType<typeof gsap.timeline>;
  private sequence?: ReturnType<typeof gsap.timeline>;
  private transition?: ReturnType<typeof gsap.timeline>;
  private visibilityClock?: ReturnType<typeof setInterval>;
  private idleClock?: ReturnType<typeof setInterval>;
  private layoutTimer?: ReturnType<typeof setTimeout>;
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private gridObserver?: MutationObserver;
  private habitat?: Habitat;
  private reduced = false;
  private touch = false;
  private blocked = false;
  private inView = true;
  private destroyed = false;
  private napping = false;
  private width = 160;
  private height = 182;
  private state: CatState = 'resting';
  private idleTurn = 0;
  private lastPointer = 0;
  private cursor?: { x: number; y: number };
  private invitedCard?: HTMLElement;

  ngAfterViewInit() {
    try {
      this.paused.set(localStorage.getItem(this.preferenceKey) === 'true');
    } catch {
      /* Storage is optional. */
    }
    this.zone.runOutsideAngular(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const coarse = window.matchMedia?.('(pointer: coarse)');
      const preferences = () => {
        this.reduced = !!reduced?.matches;
        this.touch = !!coarse?.matches;
        this.width = this.touch ? 104 : 160;
        this.height = this.touch ? 118 : 182;
        const sprite = this.sprite.nativeElement;
        sprite.style.width = this.width + 'px';
        sprite.style.height = this.height + 'px';
        sprite.dataset['motion'] = this.reduced
          ? 'reduced'
          : this.touch
            ? 'touch'
            : 'full';
        clearTimeout(this.hoverTimer);
        this.invitedCard = undefined;
        this.stopAnimations();
        this.setupRig();
        this.scheduleLayout();
      };
      for (const query of [reduced, coarse]) {
        query?.addEventListener?.('change', preferences);
        this.cleanups.push(() =>
          query?.removeEventListener?.('change', preferences),
        );
      }
      preferences();
      this.listen(window, 'resize', () => this.scheduleLayout(), {
        passive: true,
      });
      this.listen(
        window,
        'pointermove',
        (event) => this.watch(event as PointerEvent),
        { passive: true },
      );
      this.listen(document, 'visibilitychange', () => this.syncActivity());
      this.listen(document, 'focusin', () => this.syncActivity());
      this.listen(document, 'focusout', () => this.syncActivity());
      if (typeof IntersectionObserver !== 'undefined')
        this.intersectionObserver = new IntersectionObserver(
          (entries) => {
            const entry = entries.find(
              (item) => item.target === this.habitat?.anchor,
            );
            if (entry) {
              this.inView = entry.isIntersecting;
              this.syncActivity();
            }
          },
          { threshold: 0.08 },
        );
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
        this.resizeObserver.observe(document.body);
      }
      this.visibilityClock = setInterval(() => this.syncActivity(), 650);
      this.idleClock = setInterval(() => this.idleAction(), 6500);
      this.scheduleLayout();
    });
  }

  toggle() {
    this.paused.update((value) => !value);
    try {
      localStorage.setItem(this.preferenceKey, String(this.paused()));
    } catch {
      /* This visit still remembers the choice. */
    }
    this.zone.runOutsideAngular(() => {
      clearTimeout(this.hoverTimer);
      this.invitedCard = undefined;
      this.sequence?.kill();
      this.cancelTransition();
      this.napping = false;
      this.resetPose();
      this.setState(this.paused() ? 'paused' : 'watching');
      this.syncActivity();
    });
  }

  action(kind: Activity) {
    this.zone.runOutsideAngular(() => {
      if (this.destroyed) return;
      if (this.paused()) {
        this.zone.run(() => this.paused.set(false));
        try {
          localStorage.setItem(this.preferenceKey, 'false');
        } catch {
          /* Optional preference. */
        }
      }
      clearTimeout(this.hoverTimer);
      this.invitedCard = undefined;
      this.sequence?.kill();
      this.cancelTransition();
      this.napping = kind === 'sleep';
      this.resetPose();
      if (kind === 'sleep') {
        this.setState('sleeping');
        this.idle?.pause();
        gsap.set(this.parts('.cat-head'), { rotation: 7, y: 5 });
        return;
      }
      if (this.reduced) {
        this.setState('watching');
        return;
      }
      this.perform(kind === 'pet' ? 'petting' : 'playing');
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    clearInterval(this.visibilityClock);
    clearInterval(this.idleClock);
    clearTimeout(this.layoutTimer);
    clearTimeout(this.hoverTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.gridObserver?.disconnect();
    this.stopAnimations();
    this.context?.revert();
    for (const cleanup of this.cleanups) cleanup();
  }

  private parts(selector: string) {
    return this.sprite.nativeElement.querySelectorAll<SVGElement>(selector);
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
  private setupRig() {
    this.context?.revert();
    this.context = gsap.context(() => {
      for (const [selector, origin] of [
        ['.cat-body', '110 232'],
        ['.cat-chest', '110 160'],
        ['.cat-head', '108 130'],
        ['.cat-ear-left', '73 60'],
        ['.cat-ear-right', '145 58'],
        ['.cat-left-paw', '88 163'],
        ['.cat-right-paw', '128 163'],
        ['.cat-tail', '154 218'],
        ['.cat-tail-tip', '194 175'],
        ['.awake-eyes', '109 95'],
        ['.cat-jaw', '110 132'],
      ] as const)
        gsap.set(this.parts(selector), { svgOrigin: origin });
      if (!this.reduced && !this.touch) {
        this.idle = gsap.timeline({ repeat: -1 });
        this.idle
          .to(
            this.parts('.cat-chest'),
            {
              scaleY: 1.018,
              duration: 2.1,
              yoyo: true,
              repeat: 1,
              ease: 'sine.inOut',
            },
            0,
          )
          .to(
            this.parts('.cat-tail'),
            {
              rotation: -5,
              duration: 2.8,
              yoyo: true,
              repeat: 1,
              ease: 'sine.inOut',
            },
            0,
          )
          .to(
            this.parts('.cat-tail-tip'),
            {
              rotation: 12,
              duration: 1.4,
              yoyo: true,
              repeat: 3,
              ease: 'sine.inOut',
            },
            0,
          )
          .to(
            this.parts('.awake-eyes'),
            {
              scaleY: 0.08,
              duration: 0.11,
              yoyo: true,
              repeat: 1,
              ease: 'sine.inOut',
            },
            3.1,
          )
          .to(
            this.parts('.cat-ear-left'),
            { rotation: -8, duration: 0.18, yoyo: true, repeat: 1 },
            4.7,
          )
          .to({}, { duration: 1 }, 5.6);
      }
    }, this.sprite.nativeElement);
    this.setState(
      this.paused() ? 'paused' : this.napping ? 'sleeping' : 'watching',
    );
    this.syncActivity();
  }
  private stopAnimations() {
    this.idle?.kill();
    this.sequence?.kill();
    this.transition?.kill();
    gsap.killTweensOf(this.sprite.nativeElement);
    gsap.killTweensOf(this.sprite.nativeElement.querySelectorAll('*'));
  }
  private cancelTransition() {
    this.transition?.kill();
    this.transition = undefined;
    if (this.habitat)
      gsap.set(this.sprite.nativeElement, {
        x: this.habitat.x,
        y: this.habitat.y,
        opacity: 1,
      });
  }
  private resetPose() {
    gsap.killTweensOf(this.parts('.cat-head,.cat-pupil'));
    gsap.set(
      this.parts(
        '.cat-head,.cat-body,.cat-left-paw,.cat-right-paw,.cat-jaw,.cat-ear-left,.cat-ear-right',
      ),
      { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    );
    gsap.set(this.parts('.cat-mouth,.cat-tongue'), { opacity: 0 });
    gsap.set(this.parts('.cat-tongue'), { scaleY: 0 });
    gsap.set(this.parts('.awake-eyes'), { scaleY: 1 });
    gsap.set(this.parts('.cat-tail'), { y: 0 });
  }
  private syncActivity() {
    if (this.destroyed) return;
    const focused = document.activeElement;
    this.blocked =
      !!document.querySelector('dialog[open],.analytics-choice') ||
      !!focused?.closest('input,textarea,[contenteditable="true"]');
    this.sprite.nativeElement.hidden = this.blocked || !this.habitat;
    if (this.controls)
      this.controls.nativeElement.hidden = this.blocked || !this.habitat;
    const stopped =
      !this.habitat ||
      this.blocked ||
      document.hidden ||
      !this.inView ||
      this.paused() ||
      this.reduced ||
      this.napping;
    if (stopped) {
      this.idle?.pause();
      this.sequence?.pause();
      this.transition?.pause();
    } else {
      if (
        !this.touch &&
        (this.state === 'watching' || this.state === 'resting')
      )
        this.idle?.resume();
      else this.idle?.pause();
      this.sequence?.resume();
      this.transition?.resume();
    }
  }
  private watch(event: PointerEvent) {
    const moved =
      (!this.cursor &&
        Math.abs(event.movementX) + Math.abs(event.movementY) > 0) ||
      (!!this.cursor &&
        Math.hypot(
          event.clientX - this.cursor.x,
          event.clientY - this.cursor.y,
        ) > 1);
    this.cursor = { x: event.clientX, y: event.clientY };
    if (moved) this.visitCard(event);
    if (
      event.pointerType === 'touch' ||
      this.touch ||
      this.reduced ||
      this.paused() ||
      this.blocked ||
      !this.inView ||
      this.napping ||
      this.sequence?.isActive()
    )
      return;
    const now = performance.now();
    if (now - this.lastPointer < 55) return;
    this.lastPointer = now;
    const bounds = this.sprite.nativeElement.getBoundingClientRect();
    const x = clamp(
      (event.clientX - bounds.left - bounds.width / 2) / 100,
      -3.5,
      3.5,
    );
    const y = clamp(
      (event.clientY - bounds.top - bounds.height / 3) / 130,
      -2,
      2,
    );
    gsap.to(this.parts('.cat-pupil'), {
      x,
      y,
      duration: 0.35,
      overwrite: 'auto',
      ease: 'power2.out',
    });
    gsap.to(this.parts('.cat-head'), {
      rotation: x * 0.9,
      y: y * 0.25,
      duration: 0.65,
      overwrite: 'auto',
      ease: 'sine.out',
    });
  }
  private idleAction() {
    this.syncActivity();
    if (
      this.touch ||
      this.reduced ||
      this.paused() ||
      this.napping ||
      this.blocked ||
      document.hidden ||
      !this.inView ||
      this.sequence?.isActive() ||
      this.transition?.isActive()
    )
      return;
    const actions: CatState[] = [
      'grooming',
      'resting',
      'yawning',
      'stretching',
      'resting',
    ];
    const action = actions[this.idleTurn++ % actions.length];
    if (action !== 'resting') this.perform(action);
  }
  private perform(state: CatState) {
    this.sequence?.kill();
    this.resetPose();
    this.setState(state);
    const head = this.parts('.cat-head'),
      body = this.parts('.cat-body'),
      paw = this.parts('.cat-right-paw');
    const finish = () => {
      if (!this.destroyed) {
        this.resetPose();
        this.setState(this.napping ? 'sleeping' : 'watching');
        this.syncActivity();
      }
    };
    this.idle?.pause();
    const timeline = (this.sequence = gsap.timeline({ onComplete: finish }));
    if (state === 'petting') {
      timeline
        .to(head, { rotation: -10, y: -3, duration: 0.35, ease: 'sine.inOut' })
        .to(
          this.parts('.cat-ear-left,.cat-ear-right'),
          { rotation: -9, duration: 0.25 },
          0,
        )
        .to(head, {
          rotation: 5,
          duration: 0.45,
          repeat: 1,
          yoyo: true,
          ease: 'sine.inOut',
        })
        .to(head, { rotation: 0, y: 0, duration: 0.35 });
    } else if (state === 'playing') {
      timeline
        .to(body, {
          scaleY: 0.86,
          scaleX: 1.06,
          duration: 0.22,
          ease: 'power2.in',
        })
        .to(body, {
          y: -28,
          scaleY: 1.04,
          scaleX: 0.98,
          duration: 0.34,
          ease: 'power2.out',
        })
        .to(
          this.parts('.cat-tail'),
          { y: -28, duration: 0.34, ease: 'power2.out' },
          '<',
        )
        .to(
          paw,
          {
            rotation: -25,
            x: 8,
            y: -13,
            duration: 0.23,
            yoyo: true,
            repeat: 1,
          },
          '<',
        )
        .to(body, {
          y: 0,
          scaleY: 0.95,
          scaleX: 1.03,
          duration: 0.35,
          ease: 'power2.in',
        })
        .to(
          this.parts('.cat-tail'),
          { y: 0, duration: 0.35, ease: 'power2.in' },
          '<',
        )
        .to(body, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'sine.out' });
    } else if (state === 'grooming') {
      timeline
        .to(paw, {
          y: -42,
          x: -11,
          rotation: -27,
          duration: 0.5,
          ease: 'sine.inOut',
        })
        .to(head, { rotation: 13, y: 7, duration: 0.4 }, '<')
        .to(
          this.parts('.cat-tongue'),
          { opacity: 1, scaleY: 1, duration: 0.12, repeat: 5, yoyo: true },
          0.5,
        )
        .to(
          paw,
          {
            y: -51,
            x: -15,
            rotation: -36,
            duration: 0.32,
            repeat: 3,
            yoyo: true,
          },
          0.6,
        )
        .to([head, paw], { x: 0, y: 0, rotation: 0, duration: 0.5 });
    } else if (state === 'yawning') {
      gsap.set(this.parts('.cat-mouth'), { opacity: 1 });
      timeline
        .to(this.parts('.awake-eyes'), { scaleY: 0.25, duration: 0.4 })
        .to(
          this.parts('.cat-jaw'),
          { scaleY: 1.55, y: 5, duration: 0.65, ease: 'sine.inOut' },
          0,
        )
        .to(head, { rotation: -5, y: -3, duration: 0.5 }, 0)
        .to(this.parts('.cat-jaw'), { scaleY: 1, y: 0, duration: 0.65 }, '+=.3')
        .to(this.parts('.awake-eyes'), { scaleY: 1, duration: 0.3 }, '<')
        .to(head, { rotation: 0, y: 0, duration: 0.3 }, '<');
    } else if (state === 'stretching') {
      timeline
        .to(body, { scaleY: 1.065, y: -3, duration: 0.7, ease: 'sine.inOut' })
        .to(
          this.parts('.cat-left-paw,.cat-right-paw'),
          { y: 4, rotation: 4, duration: 0.65 },
          '<',
        )
        .to(head, { rotation: -7, y: -5, duration: 0.7 }, '<')
        .to(
          [
            body,
            head,
            ...Array.from(this.parts('.cat-left-paw,.cat-right-paw')),
          ],
          { x: 0, y: 0, rotation: 0, scaleY: 1, duration: 0.7 },
          '+=.35',
        );
    }
    this.syncActivity();
  }
  private visitCard(event: PointerEvent) {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-app-card]',
    );
    if (
      event.pointerType === 'touch' ||
      this.touch ||
      this.reduced ||
      this.paused() ||
      this.blocked
    )
      return;
    if (target === this.invitedCard) return;
    this.invitedCard = target ?? undefined;
    clearTimeout(this.hoverTimer);
    if (!target || target === this.habitat?.anchor) return;
    this.hoverTimer = setTimeout(() => {
      if (
        !this.destroyed &&
        !this.paused() &&
        !this.reduced &&
        !this.touch &&
        !this.blocked &&
        target.isConnected &&
        target.matches(':hover')
      )
        this.moveHome(target, true);
    }, 450);
  }
  private scheduleLayout() {
    clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => {
      if (this.destroyed) return;
      const anchor = this.habitat?.anchor.isConnected
        ? this.habitat.anchor
        : document.querySelector<HTMLElement>('.portrait-scene');
      if (!anchor) {
        this.sprite.nativeElement.hidden = true;
        return;
      }
      this.moveHome(anchor, false);
      const grid = document.querySelector('.project-grid');
      if (
        grid &&
        !this.gridObserver &&
        typeof MutationObserver !== 'undefined'
      ) {
        this.gridObserver = new MutationObserver(() => this.scheduleLayout());
        this.gridObserver.observe(grid, { childList: true });
      }
    }, 180);
  }
  private locate(anchor: HTMLElement): Habitat | undefined {
    const portrait = anchor.matches('.portrait-scene');
    const area = portrait
      ? anchor
      : anchor.querySelector<HTMLElement>('.project-preview');
    if (!area) return;
    const rect = area.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const width = Math.min(320, rect.width - 16);
    if (portrait) {
      const left = rect.left + 8,
        right = rect.right - this.width - 8;
      const positions = [rect.left + rect.width * 0.3, (left + right) / 2];
      for (let x = left; x <= right; x += 12) positions.push(x);
      const badges = Array.from(
        anchor.querySelectorAll<HTMLElement>(
          '.human-stamp,.cat-label,.portrait-label',
        ),
      ).map((node) => node.getBoundingClientRect());
      const lowerBadges = Array.from(
        anchor.querySelectorAll<HTMLElement>('.human-stamp,.cat-label'),
      ).map((node) => node.getBoundingClientRect());
      for (const feet of [
        rect.bottom - 6,
        Math.min(...lowerBadges.map((badge) => badge.top), rect.bottom) - 7,
      ]) {
        for (const x of positions) {
          if (x < left || x > right) continue;
          const y = feet - this.height;
          if (
            badges.some(
              (badge) =>
                x < badge.right + 4 &&
                x + this.width > badge.left - 4 &&
                y < badge.bottom + 4 &&
                y + this.height > badge.top - 4,
            )
          )
            continue;
          return {
            anchor,
            surface: 'portrait',
            x: x + scrollX,
            y: y + scrollY,
            controlsX: rect.left + (rect.width - width) / 2 + scrollX,
            controlsY: rect.bottom + 6 + scrollY,
            controlsWidth: width,
          };
        }
      }
    } else
      return {
        anchor,
        surface: 'card',
        x: rect.right - this.width - 16 + scrollX,
        y: rect.bottom - this.height - 43 + scrollY,
        controlsX: rect.left + 8 + scrollX,
        controlsY: rect.bottom - 37 + scrollY,
        controlsWidth: width,
      };
    return;
  }
  private moveHome(anchor: HTMLElement, animate: boolean) {
    const next = this.locate(anchor);
    if (!next) return;
    const before = this.habitat;
    this.sequence?.kill();
    this.cancelTransition();
    this.resetPose();
    if (before?.anchor !== anchor || animate) this.napping = false;
    this.habitat = next;
    this.sprite.nativeElement.dataset['surface'] = next.surface;
    this.sprite.nativeElement.dataset['anchor'] = anchor.matches(
      '.portrait-scene',
    )
      ? 'hero'
      : (anchor.querySelector('h3')?.textContent?.trim() ?? 'project');
    this.intersectionObserver?.disconnect();
    this.intersectionObserver?.observe(anchor);
    const bounds = anchor.getBoundingClientRect();
    this.inView = bounds.bottom > 0 && bounds.top < innerHeight;
    const controls = this.controls?.nativeElement;
    if (controls) {
      controls.style.left = next.controlsX + 'px';
      controls.style.top = next.controlsY + 'px';
      controls.style.width = next.controlsWidth + 'px';
    }
    const finish = () => {
      this.setState(
        this.paused() ? 'paused' : this.napping ? 'sleeping' : 'watching',
      );
      if (this.napping)
        gsap.set(this.parts('.cat-head'), { rotation: 7, y: 5 });
      this.syncActivity();
    };
    if (!animate || !before || this.reduced || this.touch) {
      gsap.set(this.sprite.nativeElement, { x: next.x, y: next.y, opacity: 1 });
      finish();
      return;
    }
    this.setState('jumping');
    const sourceRect = before.anchor.getBoundingClientRect();
    const sourceVisible =
      sourceRect.bottom > 80 && sourceRect.top < innerHeight;
    const timeline = (this.transition = gsap.timeline({ onComplete: finish }));
    if (!sourceVisible || Math.abs(before.y - next.y) > 480)
      timeline
        .to(this.sprite.nativeElement, { opacity: 0, duration: 0.15 })
        .set(this.sprite.nativeElement, { x: next.x, y: next.y })
        .to(this.sprite.nativeElement, { opacity: 1, duration: 0.25 });
    else
      timeline
        .to(this.parts('.cat-body'), { scaleY: 0.87, duration: 0.18 })
        .to(this.sprite.nativeElement, {
          x: (before.x + next.x) / 2,
          y: Math.min(before.y, next.y) - 45,
          duration: 0.32,
          ease: 'power2.out',
        })
        .to(this.sprite.nativeElement, {
          x: next.x,
          y: next.y,
          duration: 0.33,
          ease: 'power2.in',
        })
        .to(this.parts('.cat-body'), { scaleY: 1, duration: 0.18 }, '-=.1');
    this.syncActivity();
  }
}
