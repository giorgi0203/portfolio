import { Component, input, output } from '@angular/core';

export type WorkspacePanel = 'editor' | 'preview' | 'compiler' | 'learn';

@Component({
  selector: 'app-workspace-trail',
  template: `
    <section aria-label="Connected workspace" class="connection-trail">
      <div class="trail-heading">
        <div><h2>Follow a binding</h2><p>Select a template expression, a rendered element, or an Angular instruction.</p></div>
        <button type="button" class="connect-workspace" (click)="run.emit()" [disabled]="busy() || !canCompile()"
          title="Run the current source in the preview and send it to the AOT compiler">{{busy() ? 'Compiling…' : 'Run & compile'}}</button>
      </div>
      <nav aria-label="Workspace panels" class="trail-panels">
        <button type="button" aria-label="Code" [class.active]="panel()==='editor'" (click)="open.emit('editor')">
          <span>Template</span><code>{{sourceLabel()}}</code>
        </button>
        <b aria-hidden="true">⇄</b>
        <button type="button" aria-label="Preview" [class.active]="panel()==='preview'" (click)="open.emit('preview')">
          <span>Live preview</span><code>{{previewLabel()}}</code>
        </button>
        <b aria-hidden="true">⇄</b>
        <button type="button" aria-label="Compiler" [class.active]="panel()==='compiler'" (click)="open.emit('compiler')">
          <span>Compiled code</span><code>{{compiledLabel()}}</code>
        </button>
        <button type="button" class="guide" aria-label="Learn" [class.active]="panel()==='learn'" (click)="open.emit('learn')">Lesson guide</button>
      </nav>
    </section>`,
  styles: [`
    :host { display:block; margin:0 3vw 14px; color:#284737; }
    .connection-trail { padding:15px; background:#f4f7ee; border:1px solid #d5dfc9; border-radius:12px; }
    .trail-heading,.trail-panels { display:flex; align-items:center; gap:10px; }
    .trail-heading { justify-content:space-between; margin-bottom:12px; }
    h2 { font:600 16px/1.2 system-ui,sans-serif; margin:0; }
    p { margin:4px 0 0; font:12px/1.5 system-ui,sans-serif; color:#53684d; }
    button { font:600 12px/1.4 system-ui,sans-serif; cursor:pointer; }
    button:focus-visible { outline:2px solid #507345; outline-offset:2px; }
    .connect-workspace { padding:9px 14px; border:0; border-radius:7px; background:#254b38; color:white; flex:none; }
    .connect-workspace:disabled { opacity:.55; cursor:default; }
    .trail-panels button { min-width:0; text-align:left; flex:1; padding:8px 10px; border:1px solid #cedbc6; border-radius:7px; background:white; color:#254b38; }
    .trail-panels button:hover { border-color:#74906d; }
    .trail-panels code { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:12px/1.5 ui-monospace,monospace; }
    .trail-panels b { font-weight:400; color:#67825e; }
    .trail-panels .guide { flex:none; background:transparent; text-align:center; }
    @media(max-width:880px) {
      :host { margin:0 5vw 12px; }
      .connection-trail { padding:10px; }
      .trail-panels { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px; }
      .trail-panels button { padding:7px 5px; }
      .trail-panels button.active { background:#254b38; border-color:#254b38; color:white; }
      .trail-panels b { display:none; }
      .trail-panels .guide { grid-column:1/-1; padding:5px; }
      .trail-panels code { font-size:10px; }
      p { font-size:11px; }
    }
  `],
})
export class WorkspaceTrail {
  panel = input.required<WorkspacePanel>();
  sourceLabel = input.required<string>();
  previewLabel = input.required<string>();
  compiledLabel = input.required<string>();
  busy = input(false);
  canCompile = input(false);
  open = output<WorkspacePanel>();
  run = output<void>();
}
