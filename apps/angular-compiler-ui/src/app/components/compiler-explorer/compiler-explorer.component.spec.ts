import { TestBed } from '@angular/core/testing';
import { describe,it,expect,beforeEach } from 'vitest';
import { CompilerExplorerComponent } from './compiler-explorer.component';
import { fixtureSource,fixtureCode } from './compiler-fixture';
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
});
