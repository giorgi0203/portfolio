import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompilerApiService, CompilationOutcome } from './services/compiler-api.service';
import { CodeEditorComponent } from './components/code-editor/code-editor.component';
import { OutputPanelComponent } from './components/output-panel/output-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CodeEditorComponent,
    OutputPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly compilerService = inject(CompilerApiService);

  componentTs = signal(`import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-demo',
  standalone: true,
  imports: [CommonModule],
  template: \`<div class="container">
  <h1>{{ title }}</h1>
  <p>Count: {{ count }}</p>
  <div class="buttons">
    <button (click)="decrement()">-</button>
    <button (click)="increment()">+</button>
  </div>
</div>\`,
  styles: [\`.container {
  text-align: center;
  padding: 20px;
}

.buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}\`]
})
export class DemoComponent {
  title = 'Hello Angular';
  count = 0;

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }
}`);

  templateHtml = signal(''); // Optional: for external template files

  styleCss = signal(''); // Optional: for external style files

  isCompiling = signal(false);
  compilationResult = signal<CompilationOutcome | null>(null);
  serverStatus = signal<'checking' | 'online' | 'offline'>('checking');

  constructor() {
    if(typeof navigator!=='undefined'&&navigator.doNotTrack!=='1'&&!(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl){
      let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{ /* Direct visit. */ }
      void fetch('/api/analytics/event',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pageview',label:'home',referrer}),keepalive:true}).catch(()=>undefined);
    }
    this.checkServerStatus();
  }

  checkServerStatus() {
    this.serverStatus.set('checking');
    this.compilerService.healthCheck().subscribe({
      next: (isHealthy) => this.serverStatus.set(isHealthy ? 'online' : 'offline'),
      error: () => this.serverStatus.set('offline'),
    });
  }

  compile() {
    if (this.isCompiling()) return;
    this.isCompiling.set(true);
    this.compilationResult.set(null);

    const componentCode = this.componentTs();
    const externalTemplate = this.templateHtml();
    const externalStyles = this.styleCss();

    this.compilerService
      .compile(componentCode, externalTemplate, externalStyles || undefined)
      .subscribe({
        next: (result) => {
          this.compilationResult.set(result);
          this.isCompiling.set(false);
        },
        error: (error) => {
          this.compilationResult.set(error);
          this.isCompiling.set(false);
        },
      });
  }

  loadExample(example: 'counter' | 'list' | 'form') {
    const examples: Record<string, { ts: string; html: string; css: string }> = {
      counter: {
        ts: `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-counter',
  standalone: true,
  imports: [CommonModule],
  template: \`<div class="counter">
  <h1>{{ title }}</h1>
  <p class="count">{{ count }}</p>
  <button (click)="decrement()">−</button>
  <button (click)="increment()">+</button>
</div>\`,
  styles: [\`.counter { text-align: center; padding: 20px; }
.count { font-size: 48px; margin: 20px 0; color: #dd0031; }
button { padding: 10px 24px; margin: 0 8px; font-size: 20px; cursor: pointer; }\`]
})
export class CounterComponent {
  title = 'Counter Example';
  count = 0;

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }
}`,
        html: '',
        css: ''
      },
      list: {
        ts: `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: \`<div class="list-demo">
  <h2>Frameworks</h2>
  <ul>
    <li *ngFor="let item of items; let i = index">
      <span>{{ item }}</span>
      <button (click)="removeItem(i)">×</button>
    </li>
  </ul>
  <div class="add-form">
    <input [(ngModel)]="newItem" placeholder="Add framework..." />
    <button (click)="addItem()">Add</button>
  </div>
</div>\`,
  styles: [\`.list-demo { max-width: 320px; margin: 0 auto; }
h2 { color: #dd0031; }
ul { list-style: none; padding: 0; }
li { display: flex; justify-content: space-between; padding: 8px 12px; background: #f5f5f5; margin: 4px 0; border-radius: 4px; }
.add-form { display: flex; gap: 8px; margin-top: 16px; }
input { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 8px 16px; cursor: pointer; }\`]
})
export class ListComponent {
  items = ['Angular', 'React', 'Vue', 'Svelte'];
  newItem = '';

  addItem() {
    if (this.newItem.trim()) {
      this.items = [...this.items, this.newItem.trim()];
      this.newItem = '';
    }
  }

  removeItem(index: number) {
    this.items = this.items.filter((_, i) => i !== index);
  }
}`,
        html: '',
        css: ''
      },
      form: {
        ts: `import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: \`<div class="form-demo">
  <h2>Contact Form</h2>
  
  <form *ngIf="!submitted">
    <div class="field">
      <label>Name</label>
      <input [(ngModel)]="name" name="name" placeholder="Your name" />
    </div>
    <div class="field">
      <label>Email</label>
      <input [(ngModel)]="email" name="email" type="email" placeholder="your@email.com" />
    </div>
    <button type="button" (click)="onSubmit()">Submit</button>
  </form>
  
  <div *ngIf="submitted" class="success">
    <p>✅ Thanks, {{ name }}!</p>
    <p>We'll contact you at {{ email }}</p>
    <button (click)="reset()">Reset</button>
  </div>
</div>\`,
  styles: [\`.form-demo { max-width: 320px; margin: 0 auto; }
h2 { color: #dd0031; }
.field { margin-bottom: 16px; }
label { display: block; margin-bottom: 4px; font-weight: 500; }
input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
button { padding: 10px 20px; background: #dd0031; color: white; border: none; border-radius: 4px; cursor: pointer; }
.success { text-align: center; padding: 20px; background: #e8f5e9; border-radius: 8px; }
.success p { margin: 8px 0; }\`]
})
export class FormComponent {
  name = '';
  email = '';
  submitted = false;

  onSubmit() {
    if (this.name && this.email) {
      this.submitted = true;
    }
  }

  reset() {
    this.name = '';
    this.email = '';
    this.submitted = false;
  }
}`,
        html: '',
        css: ''
      }
    };
    
    const ex = examples[example];
    this.componentTs.set(ex.ts);
    this.templateHtml.set(ex.html);
    this.styleCss.set(ex.css);
  }
}
