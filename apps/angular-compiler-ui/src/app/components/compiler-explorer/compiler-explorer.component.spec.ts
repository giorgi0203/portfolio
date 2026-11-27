import { TestBed } from '@angular/core/testing';
import { describe,it,expect,beforeEach } from 'vitest';
import { CompilerExplorerComponent } from './compiler-explorer.component';
import { fixtureSource,fixtureCode } from './compiler-fixture';
import type { InspectionBlock, InspectionSelection } from '../../inspection-types';

function blockFor(tag: string, text: string, bindings: InspectionBlock['bindings'] = []): InspectionBlock {
  const start = fixtureSource.indexOf(text);
  const end = start + text.length;
  const startLine = fixtureSource.slice(0, start).split('\n').length;
  const endLine = fixtureSource.slice(0, end).split('\n').length;
  return {id: tag, tag, component: 'DemoComponent', start, end, startLine, endLine, startColumn: 1,
    endColumn: text.length + 1, source: text, bindings, controls: []};
}

describe('Compiler explorer interactions',()=>{
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CompilerExplorerComponent]}).compileComponents();});
  function create(code=fixtureCode){const fixture=TestBed.createComponent(CompilerExplorerComponent);fixture.componentRef.setInput('source',fixtureSource);fixture.componentRef.setInput('compiledSource',fixtureSource);fixture.componentRef.setInput('serverStatus','online');fixture.componentRef.setInput('result',{success:true,files:[{path:'demo.component.js',content:code}],compiledCode:code,diagnostics:[]});fixture.detectChanges();return fixture;}
  it('renders real output and reading comments, selects an instruction, and emits an explicitly approximate source link',()=>{
    const fixture=create(),page=fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.compiler-comment')?.textContent).toContain('Create');
    const instruction=page.querySelector<HTMLButtonElement>('[data-instruction="ɵɵdomListener"]');expect(instruction).not.toBeNull();instruction?.click();fixture.detectChanges();
    expect(page.querySelector('.instruction-explanation')?.textContent).toContain('Connect a browser event');
    const focused:unknown[]=[];fixture.componentInstance.sourceFocus.subscribe(value=>focused.push(value));
    Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent?.trim()==='Show related source')?.click();
    expect(focused).toEqual([expect.objectContaining({startLine:4,approximate:true})]);
    fixture.componentInstance.view.set('raw');fixture.detectChanges();expect(page.querySelector('.compiler-comment')).toBeNull();
  });
  it('announces which generated instruction line is selected',()=>{
    const fixture=create(),page=fixture.nativeElement as HTMLElement;
    const lines=Array.from(page.querySelectorAll<HTMLButtonElement>('.generated-line:not(:disabled)'));
    const selected=lines.find(line=>line.classList.contains('selected'));
    const next=lines.find(line=>line!==selected);
    expect(selected?.getAttribute('aria-pressed')).toBe('true');
    expect(next).toBeDefined();
    next?.click();fixture.detectChanges();
    expect(next?.getAttribute('aria-pressed')).toBe('true');
    expect(selected?.getAttribute('aria-pressed')).toBe('false');
  });
  it('marks stale output and prevents old-source navigation after the editor changes',()=>{
    const fixture=create();const mapped=fixture.componentInstance.instructions().find(instruction=>instruction.sourceMatch);expect(mapped).toBeDefined();if(mapped)fixture.componentInstance.select(mapped);fixture.componentRef.setInput('source',fixtureSource+'\n// Edited');fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;expect(page.querySelector('.stale-output')?.textContent).toContain('last compilation');
    const button=Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent?.trim()==='Show related source');expect(button?.disabled).toBe(true);
    const focused:unknown[]=[];fixture.componentInstance.sourceFocus.subscribe(value=>focused.push(value));fixture.componentInstance.showSource();expect(focused).toEqual([]);
  });
  it('displays diagnostics and source text without creating markup from compiler strings',()=>{
    const fixture=create('i0.ɵɵtext(0,"<img src=x onerror=alert(1)>");');const page=fixture.nativeElement as HTMLElement;expect(page.querySelector('img')).toBeNull();expect(page.querySelector('.generated-code')?.textContent).toContain('<img');
    fixture.componentRef.setInput('result',{success:false,errorMessage:'Bad template',diagnostics:[{message:'<script>unexpected()</script>',category:'error',file:'demo.component.ts',line:3}]});fixture.detectChanges();expect(page.querySelector('[role="alert"]')?.textContent).toContain('<script>');expect(page.querySelector('script')).toBeNull();expect(page.querySelector('.generated-code')).toBeNull();
  });
  it('links explicit picks in place and keeps a chosen creation call through its preview echo', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const button = blockFor('button', '<button (click)="increment()">Add</button>', [
      {kind: 'event', name: 'click', expression: 'increment()'},
    ]);
    fixture.componentRef.setInput('previewBlocks', [button]);
    fixture.componentRef.setInput('selectedSource', button);
    fixture.detectChanges();
    expect(component.selected()?.name).toBe('ɵɵdomListener');

    const picked: Array<string | null> = [];
    component.instructionFocus.subscribe(instruction => picked.push(instruction?.name ?? null));
    const opening = component.instructions().find(call => call.name === 'ɵɵdomElementStart' && call.raw.includes('"button"'));
    if (!opening) throw new Error('Missing button creation call');
    component.select(opening);
    fixture.componentRef.setInput('selectedSource', {...button});
    fixture.detectChanges();
    expect(picked).toEqual(['ɵɵdomElementStart']);
    expect(component.selected()?.id).toBe(opening.id);
    expect(page.querySelector('.argument-list')?.textContent).toContain('View slot');
    expect(page.querySelector('.runtime-steps')?.textContent?.trim()).toBeTruthy();
    expect(page.querySelector('.source-snippet')?.textContent).toContain('<button');
    expect(page.querySelector('.angular-source')?.getAttribute('href')).toMatch(/^https:\/\/github.com\/angular\/angular\/blob\//);
    fixture.componentRef.setInput('source', fixtureSource + ' ');
    fixture.detectChanges();
    component.select(opening);
    expect(picked).toHaveLength(1);
  });
  it('links a caret to an interpolation and displays only a matching fresh preview observation', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const heading = blockFor('h1', '<h1>Count: {{ count() }}</h1>');
    const button = blockFor('button', '<button (click)="increment()">Add</button>');
    const uniqueSource = fixtureSource.replace('<p>{{ count() }}</p>', '<p>Other</p>');
    fixture.componentRef.setInput('source', uniqueSource);
    fixture.componentRef.setInput('compiledSource', uniqueSource);
    const index = uniqueSource.indexOf('count()');
    fixture.componentRef.setInput('previewBlocks', [heading,button]);
    fixture.componentRef.setInput('selectedSource', {start:index,end:index,startLine:3,endLine:3});
    const observed: InspectionSelection = {
      blockId: heading.id, tag: 'h1', component: 'DemoComponent', text: 'Count: 2', values: {count: '2', extra: 'hide me'},
      locals: {}, attributes: [], pinned: true, instanceIndex: 1, instanceCount: 1,
      lastDomChange: {name: 'text', before: 'Count: 1', after: 'Count: 2'},
    };
    fixture.componentRef.setInput('observedBlock', heading);
    fixture.componentRef.setInput('observation', observed);
    fixture.detectChanges();
    expect(component.selected()?.name).toContain('Interpolate');
    expect(page.querySelector('.value-row')?.textContent).toContain('count');
    expect(page.querySelector('.observed-text')?.textContent).toContain('Count: 2');
    expect(page.querySelector('.observed-preview')?.textContent).not.toContain('hide me');
    expect(page.querySelector('.dom-change')?.textContent).toContain('Count: 1');
    fixture.componentRef.setInput('observedBlock', button);
    fixture.detectChanges();
    expect(page.querySelector('.observed-preview')).toBeNull();
    fixture.componentRef.setInput('observedBlock', heading);
    fixture.componentRef.setInput('source', fixtureSource + ' ');
    fixture.detectChanges();
    expect(page.querySelector('.observed-preview')).toBeNull();
  });
  it('clears linked focus on explicitly opening a file or phase with no instructions', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    const content = 'if (rf & 1) { i0.ɵɵtext(0, "Ready"); }';
    const componentPath = 'demo.component.js';
    const bootstrapPath = 'main.js';
    fixture.componentRef.setInput('result', {
      success: true, files: [{path: componentPath, content}, {path: bootstrapPath, content: 'bootstrapApplication(App);'}],
      compiledCode: content, diagnostics: [],
    });
    fixture.detectChanges();
    const picked: Array<string | null> = [];
    component.instructionFocus.subscribe(instruction => picked.push(instruction?.name ?? null));
    component.selectPhase('creation');
    component.selectPhase('update');
    expect(component.selected()).toBeUndefined();
    component.selectPhase('all');
    expect(component.selected()?.name).toBe('ɵɵtext');
    component.selectFile(bootstrapPath);
    expect(component.selected()).toBeUndefined();
    expect(component.selectedId()).toBe('');
    component.selectFile(componentPath);
    expect(picked).toEqual(['ɵɵtext', null, 'ɵɵtext', null, 'ɵɵtext']);
  });
});
