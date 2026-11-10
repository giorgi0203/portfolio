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
  }
];
