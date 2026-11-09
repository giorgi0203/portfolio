import { Component, input, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import type { CompilationOutcome } from '../../services/compiler-api.service';
import type { CompiledFile } from 'shared-types';

@Component({
  selector: 'app-output-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorModule],
  template: `
    <div class="output-container">
      <div class="output-header">
        <span class="label">Compiled Output</span>
        <div class="header-actions">
          @if (result()?.success && compiledFiles().length > 0) {
            <button class="format-btn" (click)="formatCurrentFile()" title="Format Code">
              ✨ Format
            </button>
          }
          <span class="status-badge" [class]="statusClass()">{{ statusText() }}</span>
        </div>
      </div>
      
      <div class="output-content">
        @if (isCompiling()) {
          <div class="loading">
            <div class="spinner"></div>
            <p>Compiling with Angular AOT...</p>
          </div>
        } @else if (!result()) {
          <div class="placeholder">
            <div class="icon">🅰️</div>
            <p>Click <strong>Compile</strong> to see Ivy output</p>
            <p class="hint">The compiled code will contain ɵɵdefineComponent and other Ivy instructions</p>
          </div>
        } @else if (result()?.success) {
          <div class="success-output">
            <div class="file-tabs">
              @for (file of compiledFiles(); track file.path) {
                <button 
                  class="file-tab" 
                  [class.active]="selectedFilePath() === file.path"
                  (click)="selectFile(file.path)"
                >
                  📄 {{ getFileName(file.path) }}
                </button>
              }
            </div>
            <div class="monaco-wrapper">
              <ngx-monaco-editor
                [options]="outputEditorOptions"
                [(ngModel)]="selectedContent"
              />
            </div>
          </div>
        } @else {
          <div class="error-output">
            <h3>❌ Compilation Failed</h3>
            <ul class="diagnostics">
              @for (diag of result()?.diagnostics || []; track $index) {
                <li class="diagnostic" [class]="diag.category">
                  @if (diag.file) {
                    <span class="diag-location">
                      {{ diag.file }}{{ diag.line ? ':' + diag.line : '' }}{{ diag.col ? ':' + diag.col : '' }}
                    </span>
                  }
                  <span class="diag-message">{{ diag.message }}</span>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .output-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    
    .output-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
    }
    
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .format-btn {
      padding: 4px 8px;
      background: #0e639c;
      border: 1px solid #0e639c;
      border-radius: 3px;
      color: #fff;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }
    
    .format-btn:hover {
      background: #1177bb;
      border-color: #1177bb;
    }
    
    .label { font-size: 12px; font-weight: 500; color: #d4d4d4; }
    
    .status-badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 500;
    }
    
    .status-badge.idle { background: #3c3c3c; color: #888; }
    .status-badge.compiling { background: #ff9800; color: #000; }
    .status-badge.success { background: #4caf50; color: #fff; }
    .status-badge.error { background: #f44336; color: #fff; }
    
    .output-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .loading, .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 16px;
      color: #888;
    }
    
    .icon { font-size: 64px; }
    
    .placeholder p { margin: 4px 0; }
    .placeholder .hint { font-size: 12px; color: #555; }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #3c3c3c;
      border-top-color: #dd0031;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .success-output {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    
    .file-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      flex-wrap: wrap;
    }
    
    .file-tab {
      padding: 6px 12px;
      background: #2d2d2d;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      color: #888;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .file-tab:hover { background: #3c3c3c; color: #d4d4d4; }
    .file-tab.active { background: #0e639c; border-color: #0e639c; color: #fff; }
    
    .monaco-wrapper {
      flex: 1;
      min-height: 0;
    }
    
    :host ::ng-deep .monaco-wrapper ngx-monaco-editor,
    :host ::ng-deep .monaco-wrapper .monaco-editor {
      height: 100vh !important;
    }
    
    .error-output {
      padding: 16px;
      overflow: auto;
    }
    
    .error-output h3 { color: #f44336; margin-bottom: 16px; }
    
    .diagnostics { list-style: none; padding: 0; }
    
    .diagnostic {
      padding: 12px;
      margin-bottom: 8px;
      background: #2d2d2d;
      border-radius: 4px;
      border-left: 3px solid #f44336;
    }
    
    .diagnostic.warning { border-left-color: #ff9800; }
    .diagnostic.info { border-left-color: #2196f3; }
    
    .diag-location {
      display: block;
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      color: #888;
      margin-bottom: 4px;
    }
    
    .diag-message { color: #d4d4d4; font-size: 13px; }
  `],
})
export class OutputPanelComponent {
  result = input<CompilationOutcome | null>(null);
  isCompiling = input<boolean>(false);

  selectedFilePath = signal<string>('');
  selectedContent = '';

  outputEditorOptions = {
    theme: 'vs-dark',
    language: 'javascript',
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    readOnly: true,
    wordWrap: 'on' as const,
    padding: { top: 10 },
    formatOnPaste: true,
    formatOnType: true,
  };

  constructor() {
    // Auto-select first component file when result changes
    effect(() => {
      const r = this.result();
      if (r?.success && r.files.length > 0) {
        const componentFile = r.files.find((f: CompiledFile) => f.path.includes('component'));
        const pathToSelect = componentFile?.path || r.files[0].path;
        // Only update if different to avoid loops
        if (this.selectedFilePath() !== pathToSelect) {
          this.selectedFilePath.set(pathToSelect);
          const file = r.files.find((f: CompiledFile) => f.path === pathToSelect);
          this.selectedContent = this.formatJavaScript(file?.content || '');
        }
      }
    });
  }

  /**
   * Formats JavaScript/TypeScript code for better readability
   */
  private formatJavaScript(code: string): string {
    if (!code.trim()) return code;
    
    try {
      // Enhanced formatting specifically for Angular compiled output
      let formatted = code
        // Format component factory and metadata
        .replace(/(ɵɵdefineComponent\s*\(\s*{)/g, 'ɵɵdefineComponent({\n  ')
        .replace(/(ɵsetClassMetadata\s*\(\s*\w+\s*,\s*\[\s*{)/g, match => match + '\n    ')
        
        // Format dependencies array
        .replace(/dependencies:\s*\[([^\]]+)\]/g, (match, deps) => {
          const depList = deps.split(',').map((dep: string) => dep.trim()).filter((dep: string) => dep);
          if (depList.length > 1) {
            return `dependencies: [\n    ${depList.join(',\n    ')}\n  ]`;
          }
          return match;
        })
        
        // Format styles array
        .replace(/styles:\s*\[\s*"([^"]+)"\s*\]/g, (match, styleContent) => {
          if (styleContent.includes('\\n')) {
            // Parse and format CSS within the string
            const formattedStyles = styleContent
              .split('\\n')
              .map((line: string) => line.trim())
              .filter((line: string) => line)
              .join('\n    ');
            return `styles: [\n    "${formattedStyles}"\n  ]`;
          }
          return match;
        })
        
        // Format template strings
        .replace(/template:\s*"([^"]+)"/g, (match, templateContent) => {
          if (templateContent.includes('\\n')) {
            const formattedTemplate = templateContent
              .split('\\n')
              .map((line: string) => line.trim())
              .filter((line: string) => line)
              .join('\n    ');
            return `template: "\n    ${formattedTemplate}\n  "`;
          }
          return match;
        })
        
        // Add line breaks after key structural elements
        .replace(/}\s*}\s*,\s*dependencies:/g, '\n  }\n}, dependencies:')
        .replace(/}\s*}\s*,\s*styles:/g, '\n  }\n}, styles:')
        .replace(/]\s*}\s*\)\s*;\s*}/g, ']\n});\n}')
        
        // Format metadata arrays
        .replace(/(type:\s*Component,\s*args:\s*\[\s*{)/g, '$1\n      ')
        .replace(/standalone:\s*true,\s*imports:/g, 'standalone: true,\n      imports:')
        
        // Add spacing around major sections
        .replace(/(\(\(\)\s*=>\s*{)/g, '\n\n(() => {')
        .replace(/(}\)\(\);)/g, '})();\n')
        
        // Clean up and standardize spacing
        .replace(/,\s*([a-zA-Z_$][\w$]*:)/g, ',\n  $1')
        .replace(/{\s*([a-zA-Z_$][\w$]*:)/g, '{\n  $1')
        .replace(/([^{]\n)\s*}/g, '$1}')
        
        // Remove excess blank lines
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\s*\n/gm, '')
        .trim();

      // Final pass for proper indentation
      const lines = formatted.split('\n');
      let indentLevel = 0;
      const indentedLines = lines.map(line => {
        const trimmedLine = line.trim();
        
        if (trimmedLine.includes('}')) {
          indentLevel = Math.max(0, indentLevel - 1);
        }
        
        const indentedLine = '  '.repeat(indentLevel) + trimmedLine;
        
        if (trimmedLine.includes('{')) {
          indentLevel++;
        }
        
        return indentedLine;
      });
      
      return indentedLines.join('\n');
    } catch (error) {
      console.warn('Failed to format code:', error);
      return code;
    }
  }

  statusClass = computed(() => {
    if (this.isCompiling()) return 'compiling';
    if (!this.result()) return 'idle';
    return this.result()?.success ? 'success' : 'error';
  });

  statusText = computed(() => {
    if (this.isCompiling()) return 'Compiling';
    if (!this.result()) return 'Ready';
    return this.result()?.success ? 'Success' : 'Error';
  });

  compiledFiles = computed((): CompiledFile[] => {
    const r = this.result();
    if (r?.success) {
      return r.files;
    }
    return [];
  });

  selectFile(path: string) {
    this.selectedFilePath.set(path);
    const file = this.compiledFiles().find((f: CompiledFile) => f.path === path);
    this.selectedContent = this.formatJavaScript(file?.content || '');
  }

  getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  formatCurrentFile() {
    if (this.selectedContent) {
      this.selectedContent = this.formatJavaScript(this.selectedContent);
    }
  }
}
