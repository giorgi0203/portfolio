import { Component, input, output, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorModule],
  template: `
    <div class="editor-container">
      <div class="editor-header">
        <span class="label">{{ label() }}</span>
        <span class="language-badge">{{ language() }}</span>
      </div>
      <div class="editor-wrapper">
        <ngx-monaco-editor
          [options]="editorOptions"
          [(ngModel)]="code"
          (ngModelChange)="onCodeChange($event)"
        />
      </div>
    </div>
  `,
  styles: [`
    .editor-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      border-bottom: 1px solid #3c3c3c;
    }
    
    .editor-container:last-child {
      border-bottom: none;
    }
    
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
    }
    
    .label {
      font-size: 12px;
      font-weight: 500;
      color: #d4d4d4;
    }
    
    .language-badge {
      font-size: 10px;
      padding: 2px 6px;
      background: #3c3c3c;
      border-radius: 3px;
      color: #888;
      text-transform: uppercase;
    }
    
    .editor-wrapper {
      flex: 1;
      min-height: 150px;
    }
    
    :host ::ng-deep .editor-wrapper ngx-monaco-editor {
      height: 300px;
    }
    
    :host ::ng-deep .editor-wrapper .monaco-editor {
      height: 100% !important;
    }
  `],
})
export class CodeEditorComponent implements OnInit {
  label = input.required<string>();
  language = input<string>('typescript');
  value = input<string>('');
  
  valueChange = output<string>();
  
  code = '';

  editorOptions: Record<string, unknown> = {
    theme: 'vs-dark',
    language: 'typescript',
    minimap: { enabled: false },
    fontSize: 13,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    padding: { top: 10 },
  };

  constructor() {
    // React to value changes from parent
    effect(() => {
      const newValue = this.value();
      if (newValue !== this.code) {
        this.code = newValue;
      }
    });

    // React to language changes
    effect(() => {
      const lang = this.language();
      this.editorOptions = {
        ...this.editorOptions,
        language: this.mapLanguage(lang),
      };
    });
  }

  ngOnInit() {
    this.code = this.value();
    this.editorOptions = {
      ...this.editorOptions,
      language: this.mapLanguage(this.language()),
    };
  }

  onCodeChange(value: string) {
    this.valueChange.emit(value);
  }

  private mapLanguage(lang: string): string {
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'typescript': 'typescript',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
    };
    return langMap[lang] || 'typescript';
  }
}
