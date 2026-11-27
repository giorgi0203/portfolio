export interface LearningLesson {
  id: string;
  title: string;
  topic: string;
  minutes: number;
  description: string;
  explanation: string[];
  hints: string[];
  challenge: string;
  source: string;
  solution: string;
  checks: Array<{
    label: string;
    kind: 'text' | 'click-text' | 'fill-text';
    selector: string;
    value?: string;
    expected: string;
  }>;
}

const signalsSource = `import { Component, signal, computed } from '@angular/core';

@Component({
  selector: 'app-demo',
  standalone: true,
  template: \`
    <h2>A tiny signal counter</h2>
    <p>Count: {{ count() }}</p>
    <p>Double: {{ doubled() }}</p>
    <button id="increment" (click)="count.update(next)">Add one</button>
  \`,
  styles: ['button { padding: 10px 18px; }']
})
export class DemoComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 1);
  next = (value: number) => value + 1;
}`;

const conditionalSource = `import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-demo',
  standalone: true,
  template: \`
    <h2>A message with a switch</h2>
    <button id="reveal" (click)="toggle()">Toggle message</button>
    @if (false) {
      <p id="message">Secret unlocked</p>
    } @else {
      <p id="hint">The message is hidden.</p>
    }
  \`
})
export class DemoComponent {
  revealed = signal(false);
  toggle() { this.revealed.update(value => !value); }
}`;

const listSource = `import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-demo',
  standalone: true,
  template: \`
    <h2>Small plans</h2>
    <p>Remaining: {{ tasks().length }}</p>
    <ul>
      @for (task of tasks(); track $index) {
        <li [id]="'task-' + task.id">
          <strong>{{ task.title }}</strong>
          <input #draft placeholder="A note for this task" (input)="onDraftInput()" />
          <p>Draft: {{ draft.value }}</p>
        </li>
      } @empty {
        <li>Everything is done. Take a break!</li>
      }
    </ul>
    <button id="reverse" (click)="reverse()">Reverse task order</button>
    <button id="finish-first" (click)="finishFirst()">Finish the first task</button>
  \`
})
export class DemoComponent {
  tasks = signal([
    { id: 1, title: 'Write a tiny app' },
    { id: 2, title: 'Try something strange' },
    { id: 3, title: 'Celebrate the small win' }
  ]);
  reverse() { this.tasks.update(tasks => [...tasks].reverse()); }
  finishFirst() { this.tasks.update(tasks => tasks.slice(1)); }
  onDraftInput() { /* The input event asks Angular to refresh the draft label. */ }
}`;

const formsSource = `import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [FormsModule],
  template: \`
    <h2>A greeting that listens</h2>
    <label for="name">Your name</label>
    <input id="name" [ngModel]="name" placeholder="Try Ada" />
    <p>Hello, {{ name || 'friend' }}!</p>
  \`,
  styles: ['input { display: block; margin-top: 8px; padding: 10px; }']
})
export class DemoComponent {
  name = '';
}`;

const communicationSource = `import { Component, Input, Output, EventEmitter, signal, forwardRef } from '@angular/core';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [forwardRef(() => StepperComponent)],
  template: \`
    <h2>A parent and a child</h2>
    <p>Total: {{ count() }}</p>
    <lab-stepper [amount]="2" (changed)="add(0)" />
  \`
})
export class DemoComponent {
  count = signal(0);
  add(amount: number) { this.count.update(value => value + amount); }
}

@Component({
  selector: 'lab-stepper',
  standalone: true,
  template: \`
    <button id="child-add" (click)="changed.emit(amount)">
      Child says: add {{ amount }}
    </button>
  \`
})
export class StepperComponent {
  @Input() amount = 1;
  @Output() changed = new EventEmitter<number>();
}`;

const changeDetectionSource = `import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';

@Component({
  selector: 'lab-profile-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    <article>
      <h3>Profile</h3>
      <p id="profile-name">{{ profile.name }}</p>
    </article>
  \`
})
export class ProfileCardComponent {
  @Input() profile = { name: '' };
}

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [ProfileCardComponent],
  template: \`
    <h2>OnPush profile</h2>
    <lab-profile-card [profile]="profile()" />
    <button id="rename" (click)="rename()">Update profile</button>
  \`
})
export class DemoComponent {
  profile = signal({ name: 'Ada' });
  rename() {
    this.profile().name = 'Grace';
    this.profile.update(value => value);
  }
}`;

const renderingSource = `import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: \`
    <h2>Team notices</h2>
    <ng-template #noticeCard let-notice="notice">
      <article>
        <h3>{{ notice?.title }}</h3>
        <p>{{ notice?.message }}</p>
      </article>
    </ng-template>
    <p>Notices: {{ notices().length }}</p>
    <section>
      @for (notice of notices(); track notice.id) {
        <ng-container
          [ngTemplateOutlet]="noticeCard"
          [ngTemplateOutletContext]="{ $implicit: notice }"
        ></ng-container>
      } @empty {
        <p id="empty">All caught up.</p>
      }
    </section>
    <button id="dismiss" (click)="dismissFirst()">Dismiss first notice</button>
  \`
})
export class DemoComponent {
  notices = signal([
    { id: 1, title: 'Release ready', message: 'The build is green.' },
    { id: 2, title: 'Backup complete', message: 'The snapshot is saved.' }
  ]);
  dismissFirst() { this.notices.update(notices => notices.slice(1)); }
}`;

// Emit two ordinary @for blocks so each copy can be edited and inspected in the lab.
function trackingList(list: 'A' | 'B', track: string) {
  return `<section aria-label="List ${list}">
      <h3>List ${list}</h3>
      <ol>
        @for (task of tasks(); track ${track}) {
          <li [attr.data-slot]="$index" [class.target]="hoveredSlot() === $index">
            <strong class="handle" [class.ready]="canMove()" (pointerdown)="startDrag($event, task.id)"
                    (pointermove)="overRow($event)" (pointerup)="endDrag($event)"
                    (pointercancel)="cancelDrag()" (lostpointercapture)="cancelDrag()">{{ task.name }}</strong>
            <input data-list="${list}" [attr.data-task]="task.id" [attr.data-position]="$index + 1"
                   [attr.aria-label]="'List ${list} ' + task.name + ' draft'" maxlength="80"
                   [readOnly]="finished()" placeholder="Write a draft"
                   (input)="copyDraft($event, task.id)" />
          </li>
        }
      </ol>
    </section>`;
}

const rowTrackingSource = `import { Component, ElementRef, Injector, afterNextRender, inject, signal } from '@angular/core';

const startingTasks = [{ id: 1, name: 'Sketch' }, { id: 2, name: 'Build' }, { id: 3, name: 'Ship' }];

@Component({
  selector: 'app-demo', standalone: true,
  template: \`
    <h2>Which row keeps my draft?</h2>
    <p>Edit a draft. Each edit is copied to the matching input in the other list.</p>
    <div class="boards">
    ${trackingList('A', '$index')}
    ${trackingList('B', 'task.id')}
    </div>
    <fieldset [disabled]="finished()">
      <legend>Which list will keep every input with its original task?</legend>
      @for (option of ['A', 'B', 'Both']; track option) {
        <label><input type="radio" name="prediction" [value]="option"
                      [checked]="prediction() === option" (change)="prediction.set(option)" />
          {{ option === 'Both' ? 'Both' : 'List ' + option }}</label>
      }
    </fieldset>
    <p>Drag a task name onto another row, or choose a move below.</p>
    <div class="moves">
      <label>Move task <select #choice [disabled]="finished()">
        @for (task of tasks(); track task.id) {
          <option [value]="task.id" [selected]="task.id === 2">{{ task.name }}</option>
        }
      </select></label>
      <label>To position <select #position [disabled]="finished()">
        <option value="0">First</option><option value="1">Second</option><option value="2">Third</option>
      </select></label>
      <button id="move" [disabled]="!canMove()" (click)="move(+choice.value, +position.value)">Move row</button>
    </div>
    <p aria-live="polite">{{ message() }}</p>
    @for (result of results(); track result.list) {
      <section class="evidence">
        <h3>List {{ result.list }} kept {{ result.kept }} of {{ result.total }} inputs with their tasks.</h3>
        @for (line of result.lines; track $index) { <p>{{ line }}</p> }
      </section>
    }
    @if (finished()) { <button (click)="reset(); choice.value = '2'; position.value = '0'">Try again</button> }
  \`,
  styles: [\`
    :host { display: block; font: 14px/1.45 system-ui, sans-serif; }
    h2, h3 { margin: 0 0 .45rem; } p { margin: .5rem 0 .8rem; }
    .boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
    .boards section, .evidence { padding: .55rem; border: 1px solid #bdcbbd; border-radius: .5rem; }
    .boards section:first-child { background: #faf4e7; } .boards section:last-child { background: #edf4e8; }
    ol { margin: 0; padding: 0; list-style: none; } li { padding: .25rem 0; }
    li.target { outline: 2px solid #41745c; border-radius: .25rem; }
    .handle.ready { cursor: grab; touch-action: none; user-select: none; background: #fff9; }
    .handle.ready::after { content: '⠿'; float: right; color: #536754; }
    .handle { padding: .18rem 0; }
    li input { box-sizing: border-box; width: 100%; min-width: 0; font: inherit; padding: .25rem; }
    li strong { display: block; font-weight: 600; } fieldset { margin: .75rem 0; padding: .4rem; }
    fieldset label { display: inline-block; margin-right: .4rem; } input[type="radio"] { padding: 0; }
    .moves { display: flex; flex-wrap: wrap; gap: .45rem; align-items: end; }
    .moves select { display: block; font: inherit; padding: .3rem; }
    button { font: inherit; margin: 0; padding: .4rem .65rem; } button:disabled { opacity: .5; }
    .evidence { margin-bottom: .5rem; } .evidence h3 { font-size: 1rem; }
  \`]
})
export class DemoComponent {
  tasks = signal([...startingTasks]);
  prediction = signal('');
  finished = signal(false);
  message = signal('');
  results = signal<{list: string; kept: number; total: number; lines: string[]}[]>([]);
  hoveredSlot = signal(-1);
  private drag: { task: number; pointer: number } | null = null;
  private host: HTMLElement = inject(ElementRef).nativeElement;
  private injector = inject(Injector);

  ngAfterViewInit() { this.seedDrafts(); }
  canMove() { return !!this.prediction() && !this.finished(); }

  private inputs() {
    return Array.from(this.host.querySelectorAll<HTMLInputElement>('input[data-task]'));
  }
  private seedDrafts() {
    for (const input of this.inputs()) input.value = input.dataset['task'] === '2' ? 'Bring a pen' : '';
  }
  copyDraft(event: Event, id: number) {
    const edited = event.target as HTMLInputElement;
    for (const other of this.inputs()) {
      if (other !== edited && Number(other.dataset['task']) === id) other.value = edited.value;
    }
  }
  startDrag(event: PointerEvent, task: number) {
    if (!this.canMove() || !event.isPrimary || event.button !== 0) return;
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    this.drag = { task, pointer: event.pointerId };
    this.overRow(event);
  }
  overRow(event: PointerEvent) {
    if (this.drag?.pointer !== event.pointerId) return;
    const element = this.host.ownerDocument.elementFromPoint(event.clientX, event.clientY);
    const slot = element?.closest<HTMLElement>('li[data-slot]')?.dataset['slot'];
    this.hoveredSlot.set(slot === undefined ? -1 : Number(slot));
  }
  endDrag(event: PointerEvent) {
    if (this.drag?.pointer !== event.pointerId) return;
    this.overRow(event);
    const {task} = this.drag;
    const slot = this.hoveredSlot();
    this.cancelDrag();
    if (slot >= 0) this.move(task, slot);
  }
  cancelDrag() { this.drag = null; this.hoveredSlot.set(-1); }
  move(id: number, to: number) {
    if (!this.canMove()) return;
    const next = [...this.tasks()];
    const from = next.findIndex(task => task.id === id);
    if (from < 0 || to < 0 || to >= next.length) return;
    if (from === to) { this.message.set('Choose a different position.'); return; }

    // Save the actual input objects before Angular reconciles either list.
    const before = this.inputs().map(node => ({
      node, list: node.dataset['list']!, task: Number(node.dataset['task']), row: node.dataset['position']
    }));
    next.splice(to, 0, next.splice(from, 1)[0]);
    this.finished.set(true);
    this.tasks.set(next);

    afterNextRender(() => {
      const results = ['A', 'B'].map(list => {
        const group = before.filter(entry => entry.list === list);
        let kept = 0;
        const lines: string[] = [];
        for (const {node, task, row} of group) {
          const present = this.host.contains(node);
          const current = present ? Number(node.dataset['task']) : null;
          if (current === task) kept++;
          if (node.value || task === id) {
            const oldName = startingTasks.find(item => item.id === task)?.name;
            const now = next.find(item => item.id === current)?.name;
            const sameNode = present ? 'same input now in row ' + node.dataset['position'] + ' (' + now + ')' : 'input removed';
            lines.push('Row ' + row + ' (' + oldName + ') → ' + sameNode + (node.value ? ' · “' + node.value + '”' : ''));
          }
        }
        return { list, kept, total: group.length, lines };
      });
      const winners = results.filter(result => result.kept === result.total).map(result => result.list);
      const outcome = winners.length === 2 ? 'Both' : (winners[0] ?? 'Neither');
      this.message.set((outcome === this.prediction() ? 'Your prediction matched.' : 'Your prediction differed.') + ' Compare the reused input nodes below.');
      this.results.set(results);
    }, {injector: this.injector});
  }
  reset() {
    this.tasks.set([...startingTasks]); this.finished.set(false); this.prediction.set('');
    this.message.set(''); this.results.set([]); this.cancelDrag();
    afterNextRender(() => this.seedDrafts(), {injector:this.injector});
  }
}`;

export const learningLessons: LearningLesson[] = [
  {
    id: 'signals',
    title: 'A counter with a memory',
    topic: 'Signals & computed values',
    minutes: 5,
    description: 'Change one value and let Angular keep its dependent value in sync.',
    challenge: 'The counter works, but Double is not double. Make the computed value equal twice the current count.',
    explanation: [
      'signal(0) creates writable state. Calling count() reads its current value; update changes it using the previous value.',
      'computed remembers the signals it reads and recalculates when those dependencies change. doubled should read count(), rather than keeping a separate counter.',
      'The template reads both signals. Angular tracks those reads and updates the affected text bindings after a click.',
      'In Ivy output, ɵɵtextInterpolate writes the current expression into a text node. The creation and update branches do different jobs.'
    ],
    hints: [
      'Find the computed(() => ...) expression in the class.',
      'The expression currently multiplies the count by 1. Which multiplier means double?'
    ],
    source: signalsSource,
    solution: signalsSource.replace('this.count() * 1', 'this.count() * 2'),
    checks: [
      { label: 'The counter begins at zero', kind: 'text', selector: 'body', expected: 'Count: 0' },
      { label: 'One click produces a doubled value of two', kind: 'click-text', selector: '#increment', expected: 'Double: 2' },
      { label: 'The computed value keeps following the signal', kind: 'click-text', selector: '#increment', expected: 'Double: 4' }
    ]
  },
  {
    id: 'conditional',
    title: 'Now you see it',
    topic: '@if & conditional rendering',
    minutes: 4,
    description: 'Use a signal to decide whether a piece of the page exists.',
    challenge: 'The toggle updates a signal, but the secret never appears. Connect @if to the actual state.',
    explanation: [
      '@if chooses a template branch. A false condition shows the @else branch; a true condition creates the message branch.',
      'revealed is a signal, so the condition must call revealed() to read its boolean value.',
      'Changing the signal changes which branch exists. This differs from merely hiding an element with CSS.',
      'The generated conditional instructions manage embedded views. The template condition remains the decision that drives them.'
    ],
    hints: [
      'The button already calls toggle(), and toggle already updates revealed.',
      'Replace the fixed false condition with a read of the revealed signal.'
    ],
    source: conditionalSource,
    solution: conditionalSource.replace('@if (false)', '@if (revealed())'),
    checks: [
      { label: 'The initial state shows the hidden-message hint', kind: 'text', selector: '#hint', expected: 'The message is hidden.' },
      { label: 'The first toggle reveals the message', kind: 'click-text', selector: '#reveal', expected: 'Secret unlocked' },
      { label: 'The next toggle hides it again', kind: 'click-text', selector: '#reveal', expected: 'The message is hidden.' }
    ]
  },
  {
    id: 'lists',
    title: 'Every item has an identity',
    topic: '@for & tracking',
    minutes: 6,
    description: 'Keep a task’s row and its draft together when the collection moves.',
    challenge: 'Write a note for the first task, then reverse the list: the note moves to the wrong task. Keep each row’s identity stable.',
    explanation: [
      '@for repeats the row template for each item. In this example each row also holds a draft inside its own input element.',
      'track task.id gives each row a stable identity when items are removed, inserted, or reordered.',
      'Tracking by index describes a position rather than an item. After reversing, the first position belongs to a different task but retains the old input element and draft.',
      'The signal is updated with a new array. Angular reconciles that array with the current rows; @empty supplies the no-items view.'
    ],
    hints: [
      'The list already contains every task. The problem is the identity after the track keyword.',
      'Each task already has a unique id. Use it after the track keyword.'
    ],
    source: listSource,
    solution: listSource.replace('track $index', 'track task.id'),
    checks: [
      { label: 'All tasks are rendered', kind: 'text', selector: 'ul', expected: 'Celebrate the small win' },
      { label: 'A row can hold its own draft', kind: 'fill-text', selector: '#task-1 input', value: 'Keep this note', expected: 'Draft: Keep this note' },
      { label: 'The array can be reordered', kind: 'click-text', selector: '#reverse', expected: 'Remaining: 3' },
      { label: 'The draft stays with task 1 after reordering', kind: 'text', selector: '#task-1', expected: 'Draft: Keep this note' },
      { label: 'Finishing a task updates the remaining count', kind: 'click-text', selector: '#finish-first', expected: 'Remaining: 2' },
      { label: 'The list can become empty', kind: 'click-text', selector: '#finish-first', expected: 'Remaining: 1' },
      { label: 'The empty state appears after the final task', kind: 'click-text', selector: '#finish-first', expected: 'Everything is done. Take a break!' }
    ]
  },
  {
    id: 'forms',
    title: 'A form that talks back',
    topic: 'Forms & two-way binding',
    minutes: 5,
    description: 'Send input to the component and reflect it back into the page.',
    challenge: 'Typing changes the input, but not the greeting. Make the name binding work in both directions.',
    explanation: [
      '[ngModel] sends the component value into the input. By itself, it does not assign later input changes back to name.',
      '[(ngModel)] combines an input binding with a matching change-event binding. This is the familiar two-way binding syntax.',
      'FormsModule provides the ngModel directive and the control’s value accessor.',
      'After input updates name, interpolation renders the new greeting. The browser control and Angular component now share the same value.'
    ],
    hints: [
      'Find the ngModel binding on the input element.',
      'Two-way binding uses parentheses inside square brackets: [(...)]="...".'
    ],
    source: formsSource,
    solution: formsSource.replace('[ngModel]="name"', '[(ngModel)]="name"'),
    checks: [
      { label: 'An empty name uses the friendly fallback', kind: 'text', selector: 'body', expected: 'Hello, friend!' },
      { label: 'Typing Ada updates the component greeting', kind: 'fill-text', selector: '#name', value: 'Ada', expected: 'Hello, Ada!' },
      { label: 'A second edit also updates the greeting', kind: 'fill-text', selector: '#name', value: 'Giorgi', expected: 'Hello, Giorgi!' }
    ]
  },
  {
    id: 'communication',
    title: 'Pass it down, send it up',
    topic: 'Component inputs & outputs',
    minutes: 7,
    description: 'A parent configures a child; the child reports an action back.',
    challenge: 'The child emits the right amount, but the parent always adds zero. Use the emitted event value.',
    explanation: [
      'The parent sends 2 through [amount]. The child receives it in its @Input() field, whose default would otherwise be 1.',
      '@Output() exposes an EventEmitter. changed.emit(amount) reports the child’s configured amount to the parent.',
      'The parent’s event binding receives that payload as $event. Passing a fixed zero ignores the useful data the child sent.',
      'The parent owns count; the child exposes a reusable input/output contract. forwardRef lets this single-file example refer to a child class declared further down.'
    ],
    hints: [
      'Look at (changed)="add(0)" in the parent template.',
      'Angular exposes an output event’s emitted value through the $event variable.'
    ],
    source: communicationSource,
    solution: communicationSource.replace('(changed)="add(0)"', '(changed)="add($event)"'),
    checks: [
      { label: 'The parent starts with an empty total', kind: 'text', selector: 'body', expected: 'Total: 0' },
      { label: 'The parent uses the first child event payload', kind: 'click-text', selector: '#child-add', expected: 'Total: 2' },
      { label: 'The reusable child can emit again', kind: 'click-text', selector: '#child-add', expected: 'Total: 4' }
    ]
  },
  {
    id: 'change-detection',
    title: 'Give OnPush a new identity',
    topic: 'Change detection & OnPush',
    minutes: 8,
    description: 'See why a signal and an OnPush child both need a changed input reference.',
    challenge: 'The parent mutates a profile in place, so the OnPush card keeps showing the old name. Replace the profile immutably so Angular can detect the input change.',
    explanation: [
      'The profile card uses ChangeDetectionStrategy.OnPush, so Angular checks it when an input reference changes or when the component itself is marked for checking.',
      'The parent signal uses object identity to decide whether an update is new. Returning the same mutated object does not notify signal consumers.',
      'Create a new profile object with the updated name. The signal then notifies the parent, and the changed input reference lets Angular check the OnPush child.',
      'The DOM update happens through Angular change detection; manually editing the rendered element would not update the component state.'
    ],
    hints: [
      'Look at the two lines in rename(): they mutate the current profile and return that same object.',
      'Use profile.update() to return a new object with the name set to Grace.'
    ],
    source: changeDetectionSource,
    solution: changeDetectionSource.replace(
      `    this.profile().name = 'Grace';
    this.profile.update(value => value);`,
      `    this.profile.update(value => ({ ...value, name: 'Grace' }));`
    ),
    checks: [
      { label: 'The OnPush card starts with Ada', kind: 'text', selector: '#profile-name', expected: 'Ada' },
      { label: 'An immutable signal update refreshes the OnPush input', kind: 'click-text', selector: '#rename', expected: 'Grace' }
    ]
  },
  {
    id: 'rendering',
    title: 'Render a template with context',
    topic: 'Rendering & template outlets',
    minutes: 8,
    description: 'Render a reusable template for each item and pass its context explicitly.',
    challenge: 'The notice template is instantiated for every item, but its text is blank. Read the implicit value supplied by ngTemplateOutletContext.',
    explanation: [
      'An ng-template declares a reusable embedded view; it does not render until an outlet instantiates it.',
      'ngTemplateOutletContext supplies values to the embedded view. The $implicit property is exposed by a let-variable without a context-property name.',
      'The @for block creates one outlet per notice and tracks each notice by its stable id.',
      'When the signal removes items, Angular updates the repeated views. The @empty branch renders when no notices remain.'
    ],
    hints: [
      'The outlet context has a $implicit value, not a property named notice.',
      'Change the template declaration to bind the let-notice variable to the implicit context value.'
    ],
    source: renderingSource,
    solution: renderingSource.replace('let-notice="notice"', 'let-notice'),
    checks: [
      { label: 'The first notice is rendered from the template context', kind: 'text', selector: 'body', expected: 'Release ready' },
      { label: 'Removing a notice renders the next tracked item', kind: 'click-text', selector: '#dismiss', expected: 'Backup complete' },
      { label: 'Removing the final notice renders the empty view', kind: 'click-text', selector: '#dismiss', expected: 'All caught up.' }
    ]
  },
  {
    id: 'row-tracking',
    title: 'Which row keeps my draft?',
    topic: 'Compare row identity',
    minutes: 6,
    description: 'Give an input a draft, predict where it will land, then reorder two live lists.',
    challenge: 'The starter uses track $index in list A and track task.id in list B. Run the experiment, then change list A so both lists preserve every draft with its task.',
    explanation: [
      'The draft lives in the browser input. Typing also copies the text to the matching input in the other list so both begin with the same note.',
      'When Angular reconciles an @for block, its tracking key identifies which existing view to reuse. A stable task ID follows a task when its array position changes.',
      'The experiment holds references to the actual input nodes before moving a task. After Angular renders, it reads the task and position from those same nodes to reveal the outcome.',
      'Select either @for block in the editor. Compare the generated repeater creation calls and inspect the tracking function supplied to each.'
    ],
    hints: [
      'Make a prediction, then move Build to the first position. Read where its input is now in each list.',
      'Find the @for directly under the List A heading and compare its track expression with List B.'
    ],
    source: rowTrackingSource,
    solution: rowTrackingSource.replace('@for (task of tasks(); track $index)', '@for (task of tasks(); track task.id)'),
    checks: [
      { label: 'Both live lists are rendered', kind: 'text', selector: '.boards', expected: 'List B' },
      { label: 'Enter a prediction for both lists', kind: 'click-text', selector: 'input[value="Both"]', expected: 'Move row' },
      { label: 'Moving Build reveals measured input identities', kind: 'click-text', selector: '#move', expected: 'List B kept 3 of 3 inputs with their tasks.' },
      { label: 'List A also preserves every task’s input', kind: 'text', selector: '.evidence', expected: 'List A kept 3 of 3 inputs with their tasks.' }
    ]
  }
];
