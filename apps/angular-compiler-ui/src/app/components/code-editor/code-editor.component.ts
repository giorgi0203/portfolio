import { Component, input, output, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import type { editor, IDisposable } from 'monaco-editor';
export interface SourceEditorRange {startLine:number;endLine:number;startColumn?:number;endColumn?:number;start?:number;end?:number;}

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
          (onInit)="onEditorInit($event)"
        />
      </div>
    </div>
  `,
  styles: [`
    .editor-container {
      display: flex;
      flex-direction: column;
      height: 100%;
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
      height: 100%;
      display: block;
    }
    
    :host ::ng-deep .editor-wrapper .monaco-editor {
      height: 100% !important;
    }
    :host ::ng-deep .learning-source-highlight {background:rgba(137,176,92,.24);border-top:1px solid #8eb468;border-bottom:1px solid #8eb468;}
    :host ::ng-deep .learning-source-gutter {background:#8eb468;width:4px!important;margin-left:3px;}
  `],
})
export class CodeEditorComponent implements OnInit, OnDestroy {
  label = input.required<string>();
  language = input<string>('typescript');
  value = input<string>('');
  sourceRange = input<SourceEditorRange|null>(null);
  sourceSelection = output<SourceEditorRange>();
  private editor?:editor.IStandaloneCodeEditor;
  private selectionListener?:IDisposable;
  private decorations:string[]=[];
  
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
    effect(()=>{this.applyRange(this.sourceRange());});
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

  onEditorInit(instance:editor.IStandaloneCodeEditor){
    this.editor=instance;this.applyRange(this.sourceRange());
    this.selectionListener?.dispose();
    this.selectionListener=instance.onDidChangeCursorSelection(event=>{
      // Decorations/reveal from preview hover must never turn into a source-focus command.
      if(event.source==='api'||!instance.hasTextFocus())return;
      this.sourceSelection.emit({startLine:event.selection.startLineNumber,endLine:event.selection.endLineNumber,startColumn:event.selection.startColumn,endColumn:event.selection.endColumn,start:instance.getModel()?.getOffsetAt({lineNumber:event.selection.startLineNumber,column:event.selection.startColumn}),end:instance.getModel()?.getOffsetAt({lineNumber:event.selection.endLineNumber,column:event.selection.endColumn})});
    });
  }
  private applyRange(value:SourceEditorRange|null){
    const instance=this.editor,model=instance?.getModel();if(!instance||!model)return;
    if(!value||!Number.isFinite(value.startLine)||!Number.isFinite(value.endLine)){this.decorations=instance.deltaDecorations(this.decorations,[]);return;}
    const startLineNumber=Math.max(1,Math.min(model.getLineCount(),Math.floor(value.startLine))),endLineNumber=Math.max(startLineNumber,Math.min(model.getLineCount(),Math.floor(value.endLine)));
    this.decorations=instance.deltaDecorations(this.decorations,[{range:{startLineNumber,endLineNumber,startColumn:1,endColumn:model.getLineMaxColumn(endLineNumber)},options:{isWholeLine:true,className:'learning-source-highlight',linesDecorationsClassName:'learning-source-gutter'}}]);
    instance.revealLinesInCenterIfOutsideViewport(startLineNumber,endLineNumber);
  }
  ngOnDestroy(){this.selectionListener?.dispose();this.editor=undefined;}

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
