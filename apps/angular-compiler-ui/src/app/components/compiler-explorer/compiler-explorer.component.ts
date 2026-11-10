import { Component, computed, effect, input, output, signal, afterRenderEffect, inject, ElementRef } from '@angular/core';
import type { CompilationOutcome } from '../../services/compiler-api.service';
import { generatedLines, parseCompilerInstructions, type CompilerInstruction, type CompilerPhase, type SourceMatch } from '../../compiler-explanations';

@Component({
  selector:'app-compiler-explorer',standalone:true,
  templateUrl:'./compiler-explorer.component.html',styleUrl:'./compiler-explorer.component.css',
})
export class CompilerExplorerComponent {
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  result=input<CompilationOutcome|null>(null);
  isCompiling=input(false);
  source=input('');
  compiledSource=input('');
  selectedSource=input<{startLine:number;endLine:number;start?:number;end?:number}|null>(null);
  serverStatus=input<'checking'|'online'|'offline'>('checking');
  sourceFocus=output<SourceMatch>();
  compileRequested=output<void>();
  retryRequested=output<void>();
  view=signal<'annotated'|'raw'>('annotated');
  phase=signal<CompilerPhase|'all'>('all');
  filePath=signal('');
  selectedId=signal('');
  copied=signal(false);
  readonly phases=[{id:'all',label:'All'},{id:'creation',label:'Creation'},{id:'update',label:'Update'},{id:'definition',label:'Definition'},{id:'event',label:'Event callbacks'},{id:'helper',label:'Helpers'}] as const;
  readonly files=computed(()=>{const value=this.result();return value?.success?value.files:[];});
  readonly file=computed(()=>this.files().find(file=>file.path===this.filePath())||this.files().find(file=>file.path.includes('component'))||this.files()[0]);
  readonly stale=computed(()=>!!this.result()?.success&&this.compiledSource()!==this.source());
  readonly instructions=computed(()=>{const file=this.file();return file?parseCompilerInstructions(file.content,this.compiledSource(),file.path):[];});
  readonly filtered=computed(()=>this.instructions().filter(instruction=>this.phase()==='all'||instruction.phase===this.phase()));
  readonly lines=computed(()=>{const file=this.file();return file?generatedLines(file.content,this.instructions()):[];});
  readonly selected=computed(()=>this.instructions().find(instruction=>instruction.id===this.selectedId())||this.filtered()[0]||this.instructions()[0]);
  readonly visibleLineLimit=computed(()=>(this.file()?.content.split('\n').length||0)>1800);
  constructor(){
    afterRenderEffect(()=>{
      const selected=this.selected();this.view();if(!selected)return;
      const host=this.host.nativeElement;
      for(const [containerSelector,rowSelector] of [['.generated-code','[data-line="'+selected.line+'"]'],['.instruction-list','[data-instruction]']]){
        const container=host.querySelector<HTMLElement>(containerSelector);if(!container||!container.clientHeight)continue;
        const row=containerSelector==='.generated-code'?container.querySelector<HTMLElement>(rowSelector):container.querySelector<HTMLElement>('.active');if(!row)continue;
        const top=row.offsetTop,bottom=top+row.offsetHeight;
        if(top<container.scrollTop)container.scrollTop=top;else if(bottom>container.scrollTop+container.clientHeight)container.scrollTop=bottom-container.clientHeight;
      }
    });
    effect(()=>{const instructions=this.instructions();if(!instructions.some(instruction=>instruction.id===this.selectedId()))this.selectedId.set(instructions[0]?.id||'');});
    effect(()=>{
      const span=this.selectedSource();if(!span||this.stale())return;
      const matches=this.instructions().filter(instruction=>{const match=instruction.sourceMatch;if(!match)return false;return span.start!==undefined&&span.end!==undefined?match.start<span.end&&match.end>span.start:match.startLine<=span.endLine&&match.endLine>=span.startLine;});
      // Prefer the update binding over an element's broad creation match.
      const match=matches.find(instruction=>instruction.phase==='update')||matches[0];
      if(match)this.selectedId.set(match.id);
    });
  }
  select(instruction:CompilerInstruction){this.selectedId.set(instruction.id);this.copied.set(false);}
  selectLine(line:number){const match=this.instructions().find(instruction=>instruction.line===line);if(match)this.select(match);}
  selectPhase(phase:CompilerPhase|'all'){this.phase.set(phase);const first=this.filtered()[0];if(first)this.selectedId.set(first.id);}
  showSource(){const match=this.selected()?.sourceMatch;if(match&&!this.stale())this.sourceFocus.emit(match);}
  async copy(){const content=this.file()?.content;if(!content)return;try{await navigator.clipboard.writeText(content);this.copied.set(true);}catch{this.copied.set(false);}}
  download(){const file=this.file();if(!file)return;const url=URL.createObjectURL(new Blob([file.content],{type:'text/javascript;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=file.path.split('/').pop()||'compiled-component.js';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  phaseLabel(phase:CompilerPhase){return phase==='creation'?'Creation · rf & 1':phase==='update'?'Update · rf & 2':phase==='definition'?'Component / development definition':phase==='event'?'Event callback · runs on interaction':'Rendering helper';}
}
