import { Component, inject, signal, computed, viewChild, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { CompilerApiService, type CompilationOutcome } from './services/compiler-api.service';
import { CodeEditorComponent } from './components/code-editor/code-editor.component';
import { CompilerExplorerComponent } from './components/compiler-explorer/compiler-explorer.component';
import type { InspectionActivity, InspectionBlock, InspectionSelection } from './inspection-types';
import type { SourceEditorRange } from './components/code-editor/code-editor.component';
import { learningLessons, type LearningLesson } from './lessons';
import { RenderReplay, replayLimit } from './components/render-replay/render-replay';
import { WorkspaceTrail, type WorkspacePanel } from './components/workspace-trail/workspace-trail';
import { owningPreviewBlock } from './workspace-selection';
import type { CompilerInstruction } from './compiler-explanations';
import { previewDocument } from './preview-document';
interface Experiment {id:string;title:string;source:string;lessonId?:string;createdAt?:string;updatedAt?:string;}
interface User {id:string;name:string;email:string;}
interface CheckResult {label:string;passed:boolean;actual:string;}
interface Change {name:string;before:string;after:string;}
const localKey='giorgi-learning-v1';
@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule,CodeEditorComponent,CompilerExplorerComponent,WorkspaceTrail,RenderReplay],templateUrl:'./app.html',styleUrl:'./app.css'})
export class App implements OnInit,OnDestroy {
 @ViewChild('previewFrame') previewFrame?:ElementRef<HTMLIFrameElement>;
 private readonly compilerService=inject(CompilerApiService);
 private readonly sanitizer=inject(DomSanitizer);
 readonly lessons=learningLessons;
 selectedLessonId=signal(learningLessons[0].id);
 lesson=computed(()=>this.lessons.find(lesson=>lesson.id===this.selectedLessonId())||this.lessons[0]);
 componentTs=signal(this.lessons[0].source);
 templateHtml=signal('');styleCss=signal('');
 isCompiling=signal(false);compilationResult=signal<CompilationOutcome|null>(null);serverStatus=signal<'checking'|'online'|'offline'>('checking');
 previewHtml=signal<SafeHtml|null>(null);previewStatus=signal<'idle'|'loading'|'running'|'error'>('idle');previewError=signal('');
 results=signal<CheckResult[]>([]);state=signal<Record<string,string>>({});changes=signal<Change[]>([]);batches=signal(0);
 hintCount=signal(0);showLibrary=signal(false);showGuide=signal(false);mobileTab=signal<'editor'|'preview'|'compiler'|'learn'>('editor');
 compiledSource=signal('');previewSource=signal('');inspectionEnabled=signal(true);inspectionBlocks=signal<InspectionBlock[]>([]);inspection=signal<InspectionSelection|null>(null);activities=signal<InspectionActivity[]>([]);inspectionTruncated=signal(false);inspectionUnmapped=signal<string[]>([]);sourceRange=signal<SourceEditorRange|null>(null);
 readonly previewStale=computed(()=>!!this.previewHtml()&&!!this.previewSource()&&this.previewSource()!==this.componentTs());
 private readonly explorer = viewChild(CompilerExplorerComponent);
 private readonly selectionOwner = signal<'none' | 'source' | 'compiler' | 'preview'>('none');
 private focusBlockId: string | null = null;
 private compileGeneration = 0;
 private initialRunTimer?: ReturnType<typeof setTimeout>;

 readonly sourceLabel = computed(() => {
  const span = this.sourceRange();
  if (!span) return this.selectionOwner() === 'compiler' ? 'No template range' : 'Select an expression';
  const excerpt = this.componentTs().slice(span.start, span.end).trim().replace(/\s+/g, ' ');
  return 'L' + span.startLine + (excerpt ? ' · ' + excerpt.slice(0, 90) : '');
 });
 readonly previewLabel = computed(() => {
  if (this.previewStale()) return 'Run latest source';
  const selection = this.inspection();
  if (!selection) return this.previewStatus() === 'running' ? 'Select an element' : 'Preview ' + this.previewStatus();
  if (selection.instanceIndex === 0) return '<' + selection.tag + '> · not rendered';
  return '<' + selection.tag + '>' + (selection.text ? ' · ' + selection.text : '');
 });
 readonly compiledLabel = computed(() => {
  if (this.isCompiling()) return 'Compiling…';
  const result = this.compilationResult();
  if (!result) return 'Compile to connect';
  if (this.compiledSource() !== this.componentTs()) return 'Compile latest source';
  if (!result.success) return 'See diagnostics';
  const selected = this.explorer()?.selected();
  if (!selected) return 'No matching instruction';
  return this.sourceRange() || this.selectionOwner() === 'compiler'
    ? selected.name + ' · L' + selected.line : 'Select an instruction';
 });
 readonly inspectedBlock=computed(()=>this.inspectionBlocks().find(block=>block.id===this.inspection()?.blockId)||null);
 readonly inspectedValues=computed(()=>Object.entries(this.inspection()?.values||{}));
 readonly inspectedLocals=computed(()=>Object.entries(this.inspection()?.locals||{}));
 completed=signal<string[]>([]);experiments=signal<Experiment[]>([]);user=signal<User|null>(null);accountLoading=signal(true);saving=signal(false);
 title='My Angular experiment';message=signal('');shareLink=signal('');
 private sharedImported=false;private accountGeneration=0;private readyConsumed=false;private runSource='';private runChecks:LearningLesson['checks']=[];private channel='';protected runId=0;private pendingChecks=false;private previewTimer?:ReturnType<typeof setTimeout>;private draftTimer?:ReturnType<typeof setTimeout>;private currentExperimentId='';
 readonly stateEntries=computed(()=>Object.entries(this.state()));
 readonly progress=computed(()=>Math.round(this.completed().filter(id=>this.lessons.some(lesson=>lesson.id===id)).length/this.lessons.length*100));
 private readonly onMessage=(event:MessageEvent)=>{
  if(event.source!==this.previewFrame?.nativeElement.contentWindow||event.origin!=='null'||event.data?.channel!==this.channel)return;
  const data=event.data;
  if(data.type==='learning:ready'){if(this.readyConsumed)return;this.readyConsumed=true;this.previewFrame?.nativeElement.contentWindow?.postMessage({type:'learning:run',channel:this.channel,runId:this.runId,source:this.runSource,checks:this.runChecks},'*');return;}
  if(data.runId!==this.runId)return;
  if(data.type==='learning:inspection-map')this.receiveInspectionMap(data);
  if(data.type==='learning:inspect')this.receiveInspection(data.selection);
  if(data.type==='learning:activity')this.receiveActivity(data.activity);
  if(data.type==='learning:rendered'){clearTimeout(this.previewTimer);this.previewStatus.set('running');this.sendPreview('learning:inspect-mode',{enabled:this.inspectionEnabled()});this.connectInitialBlock();}
  if(data.type==='learning:error'){clearTimeout(this.previewTimer);this.previewStatus.set('error');this.previewError.set(String(data.message||'Preview failed').slice(0,4000));}
  if(data.type==='learning:state'&&data.state&&typeof data.state==='object'){
   const values:Record<string,string>={};for(const [key,value] of Object.entries(data.state).slice(0,30))if(typeof value==='string')values[key.slice(0,80)]=value.slice(0,500);
   this.state.set(values);this.batches.set(Number(data.batches)||0);
   if(Array.isArray(data.changes)&&data.changes.length)this.changes.set(data.changes.filter((item:Change)=>typeof item?.name==='string'&&typeof item?.before==='string'&&typeof item?.after==='string').slice(0,20).map((item:Change)=>({name:item.name.slice(0,80),before:item.before.slice(0,500),after:item.after.slice(0,500)})));
  }
  if(data.type==='learning:checked'&&Array.isArray(data.results)){
   const checked=data.results.filter((item:CheckResult)=>typeof item?.label==='string'&&typeof item?.passed==='boolean').slice(0,12);this.results.set(checked);
   if(checked.length===this.lesson().checks.length&&checked.every((item:CheckResult)=>item.passed)){this.markComplete();this.showGuide.set(true);this.message.set('Challenge complete. Nice work—try another lesson or keep experimenting.');}
  }
 };
 constructor(){
  this.restoreGuest();
  this.readShare();this.checkServerStatus();
 }
 ngOnInit(){window.addEventListener('message',this.onMessage);void this.loadAccount();if(!this.sharedImported&&this.componentTs()===this.lesson().source){this.initialRunTimer=setTimeout(()=>{if(this.previewStatus()==='idle'&&this.componentTs()===this.lesson().source){this.runPreview();void this.loadLessonOutput(this.lesson());}},0);}this.telemetry();}
 ngOnDestroy(){this.compileGeneration++;clearTimeout(this.initialRunTimer);window.removeEventListener('message',this.onMessage);clearTimeout(this.previewTimer);clearTimeout(this.draftTimer);}
 private telemetry(){if(navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl)return;let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{ /* Direct visit. */ }void fetch('/api/analytics/event',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pageview',label:'home',referrer}),keepalive:true}).catch(()=>undefined);}
 checkServerStatus(){this.serverStatus.set('checking');this.compilerService.healthCheck().subscribe({next:healthy=>this.serverStatus.set(healthy?'online':'offline'),error:()=>this.serverStatus.set('offline')});}
 setSource(value:string){if(value===this.componentTs())return;this.clearConnection();this.shareLink.set('');this.sourceRange.set(null);this.componentTs.set(value);this.results.set([]);clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.persist(),300);}
 chooseLesson(lesson:LearningLesson){this.resetCompilation();this.selectedLessonId.set(lesson.id);this.componentTs.set(lesson.source);this.title=lesson.title;this.currentExperimentId='';this.hintCount.set(0);this.results.set([]);this.message.set('');this.persist();this.runPreview();void this.loadLessonOutput(lesson);}
 runPreview(checks=false){
  this.stopPreview();this.pendingChecks=checks;this.runSource=this.componentTs();this.previewSource.set(this.runSource);if(checks)this.showGuide.set(true);this.runChecks=checks?this.lesson().checks:[];this.readyConsumed=false;this.runId++;this.channel=crypto.randomUUID();this.previewError.set('');this.previewStatus.set('loading');this.state.set({});this.changes.set([]);this.batches.set(0);if(checks)this.results.set([]);
  this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(previewDocument(location.origin,this.channel)));
  this.previewTimer=setTimeout(()=>{if(this.previewStatus()==='loading'){this.previewStatus.set('error');this.previewError.set('The preview could not start. Check your code, then press Run preview to retry.');}},30000);
 }
 stopPreview(){this.state.set({});this.changes.set([]);this.batches.set(0);this.previewError.set('');this.focusBlockId=null;this.selectionOwner.set('none');this.inspection.set(null);this.inspectionBlocks.set([]);this.activities.set([]);this.sourceRange.set(null);this.inspectionTruncated.set(false);this.inspectionUnmapped.set([]);clearTimeout(this.previewTimer);this.readyConsumed=true;this.channel='';this.runId++;this.previewHtml.set(null);this.previewStatus.set('idle');}
 showHint(){this.hintCount.update(count=>Math.min(count+1,this.lesson().hints.length));}
 revealSolution(){this.setSource(this.lesson().solution);this.message.set('Solution loaded. Run the challenge checks to see how it behaves.');this.runPreview();}
 resetLesson(){this.chooseLesson(this.lesson());}
 private resetCompilation() {
  this.compileGeneration++;
  this.isCompiling.set(false);
  this.compilationResult.set(null);
  this.compiledSource.set('');
 }
 private async loadLessonOutput(lesson:LearningLesson) {
  const generation = ++this.compileGeneration;
  try {
   const response = await fetch('/lessons/' + lesson.id + '.json', {credentials:'omit', cache:'no-cache'});
   if (!response.ok) return;
   const data = await response.json();
   if (generation !== this.compileGeneration || this.componentTs() !== lesson.source ||
       data.source !== lesson.source || !Array.isArray(data.files) || !data.files.length ||
       !data.files.every((file:{path?:unknown;content?:unknown}) => typeof file?.path==='string' && typeof file.content==='string')) return;
   this.compiledSource.set(lesson.source);
   this.compilationResult.set({success:true, files:data.files, compiledCode:data.files[0].content, diagnostics:data.diagnostics || []});
  } catch { /* The Compile AOT button remains available when a lesson asset cannot load. */ }
 }
 compile() {
  if (this.isCompiling()) return;
  const generation = ++this.compileGeneration, source = this.componentTs();
  this.isCompiling.set(true);
  this.compilationResult.set(null);
  this.compiledSource.set(source);
  const finish = (result:CompilationOutcome) => {
   if (generation !== this.compileGeneration) return;
   this.isCompiling.set(false);
   this.compilationResult.set(result);
  };
  this.compilerService.compile(source,this.templateHtml(),this.styleCss()||undefined).subscribe({next:finish,error:finish});
 }
 runAndCompile() { this.runPreview(); this.compile(); }
 openPanel(panel:WorkspacePanel) {
  this.mobileTab.set(panel);
  if (panel === 'learn') this.showGuide.set(true);
  const selectors = {editor:'.editor-pane', preview:'.preview-pane', compiler:'.compiler-pane', learn:'.lesson-guide'};
  requestAnimationFrame(() => {
   const target = document.querySelector<HTMLElement>(selectors[panel]);
   if (!target) return;
   target.focus({preventScroll:true});
   const box = target.getBoundingClientRect();
   if (box.top < 0 || box.top > window.innerHeight * 0.6) target.scrollIntoView({block:'start'});
  });
 }
 private clearConnection() {
  this.focusBlockId = null;
  this.selectionOwner.set('none');
  this.inspection.set(null);
  this.sourceRange.set(null);
  this.sendPreview('learning:clear-focus');
 }
 instructionSelected(instruction: CompilerInstruction | null) {
  if (this.compiledSource() !== this.componentTs()) return;
  if (instruction?.sourceMatch) this.focusSource(instruction.sourceMatch, false, 'compiler');
  else { this.clearConnection(); this.selectionOwner.set('compiler'); }
 }
 private sendPreview(type:string,payload:Record<string,unknown>={}){if(!this.readyConsumed||!this.previewHtml())return;this.previewFrame?.nativeElement.contentWindow?.postMessage({type,channel:this.channel,runId:this.runId,...payload},'*');}
 toggleInspection(){this.inspectionEnabled.update(value=>!value);this.sendPreview('learning:inspect-mode',{enabled:this.inspectionEnabled()});if(!this.inspectionEnabled())this.clearConnection();}
 unpinInspection(){this.sendPreview('learning:unpin');}
 openMappedSource(){if(this.previewStale()){this.message.set('Run the latest source before highlighting it. The block shown belongs to the previous run.');return;}const block=this.inspectedBlock();if(block){this.sourceRange.set({startLine:block.startLine,endLine:block.endLine,startColumn:block.startColumn,endColumn:block.endColumn,start:block.start,end:block.end});this.openPanel('editor');}}
 focusSource(range:SourceEditorRange, openEditor=false, owner:'source'|'compiler'='source') {
  if (!range || !Number.isInteger(range.startLine) || !Number.isInteger(range.endLine)) return;
  this.selectionOwner.set(owner);
  this.sourceRange.set(range);
  const block = !this.previewStale() && range.start!==undefined && range.end!==undefined
   ? owningPreviewBlock({start:range.start,end:range.end}, this.inspectionBlocks()) : null;
  this.focusBlockId = block?.id ?? null;
  if (this.inspection()?.blockId !== block?.id) this.inspection.set(null);
  if (block) this.focusPreviewBlock(block, true);
  else this.sendPreview('learning:clear-focus');
  if (openEditor) this.openPanel('editor');
 }
 private focusPreviewBlock(block:InspectionBlock, pin:boolean) {
  this.focusBlockId = block.id;
  this.inspectionEnabled.set(true);
  this.sendPreview('learning:inspect-mode', {enabled:true});
  this.sendPreview('learning:focus-block', {blockId:block.id,pin});
 }
 changeInstance(index:number) {
  const block = this.inspectedBlock(), selection = this.inspection();
  if (!block || !selection?.instanceCount || index<1 || index>selection.instanceCount || this.previewStale()) return;
  this.focusBlockId=block.id;
  this.sendPreview('learning:focus-block',{blockId:block.id,instanceIndex:index,pin:true});
 }
 private connectInitialBlock() {
  if (this.previewStale() || !this.inspectionEnabled()) return;
  const owner = this.selectionOwner(), range = this.sourceRange();
  if ((owner === 'source' || owner === 'compiler') && range) {
   this.focusSource(range, false, owner);
   return;
  }
  if (owner !== 'none') return;
  const blocks = this.inspectionBlocks();
  const block = blocks.find(entry=>entry.bindings.some(binding=>binding.kind==='text') && !entry.controls.length);
  if (!block) return;
  this.sourceRange.set(block);
  this.selectionOwner.set('preview');
  this.focusPreviewBlock(block,false);
 }
 private values(input:unknown):Record<string,string>{if(!input||typeof input!=='object'||Array.isArray(input))return {};return Object.fromEntries(Object.entries(input).filter(([,value])=>typeof value==='string').slice(0,30).map(([name,value])=>[name.slice(0,80),(value as string).slice(0,500)]));}
 private receiveInspectionMap(data:{blocks?:unknown;truncated?:unknown;unmappedComponents?:unknown}){
  if(!Array.isArray(data.blocks))return;const blocks:InspectionBlock[]=[];
  for(const item of data.blocks.slice(0,300)){
   if(!item||typeof item.id!=='string'||typeof item.component!=='string'||typeof item.tag!=='string'||!Number.isInteger(item.start)||!Number.isInteger(item.end)||item.start<0||item.end<item.start||item.end>this.runSource.length)continue;
   const startLine=this.runSource.slice(0,item.start).split('\n').length,endLine=this.runSource.slice(0,item.end).split('\n').length;
   const startColumn=item.start-(this.runSource.lastIndexOf('\n',Math.max(0,item.start-1))+1)+1,endColumn=item.end-(this.runSource.lastIndexOf('\n',Math.max(0,item.end-1))+1)+1;
   const bindings=Array.isArray(item.bindings)?item.bindings.filter((binding:{kind?:unknown;name?:unknown;expression?:unknown})=>binding&&typeof binding.kind==='string'&&['text','property','event','two-way'].includes(binding.kind)&&typeof binding.name==='string'&&typeof binding.expression==='string').slice(0,20).map((binding:{kind:'text'|'property'|'event'|'two-way';name:string;expression:string})=>({kind:binding.kind,name:binding.name.slice(0,80),expression:binding.expression.slice(0,300)})):[];
   blocks.push({id:item.id.slice(0,100),component:item.component.slice(0,100),tag:item.tag.slice(0,80),start:item.start,end:item.end,startLine,endLine,startColumn,endColumn,source:this.runSource.slice(item.start,item.end).slice(0,3000),bindings,controls:Array.isArray(item.controls)?item.controls.filter((value:unknown)=>typeof value==='string').slice(0,10).map((value:string)=>value.slice(0,250)):[]});
  }
  this.inspectionBlocks.set(blocks);this.inspectionTruncated.set(data.truncated===true||data.blocks.length>300);this.inspectionUnmapped.set(Array.isArray(data.unmappedComponents)?data.unmappedComponents.filter((value:unknown)=>typeof value==='string').slice(0,10).map((value:string)=>value.slice(0,100)):[]);
 }
 private receiveInspection(value:unknown){
  if(value===null){this.inspection.set(null);if(this.selectionOwner()==='preview' && !this.focusBlockId)this.sourceRange.set(null);return;}if(!value||typeof value!=='object')return;
  const item=value as InspectionSelection;if(typeof item.tag!=='string'||typeof item.component!=='string'||typeof item.text!=='string')return;
  const block=this.inspectionBlocks().find(entry=>entry.id===item.blockId);
  const selection:InspectionSelection={blockId:block?.id||null,component:item.component.slice(0,100),tag:item.tag.slice(0,80),text:item.text.slice(0,1000),attributes:Array.isArray(item.attributes)?item.attributes.filter(entry=>entry&&typeof entry.name==='string'&&typeof entry.value==='string').slice(0,15).map(entry=>({name:entry.name.slice(0,80),value:entry.value.slice(0,250)})):[],values:this.values(item.values),locals:this.values(item.locals),pinned:item.pinned===true,reason:typeof item.reason==='string'?item.reason.slice(0,300):undefined};
  if (item.origin === 'workspace' && (!block || this.focusBlockId !== block.id)) return;
  selection.origin = item.origin === 'workspace' ? 'workspace' : 'preview';
  const {instanceCount, instanceIndex} = item;
  if (typeof instanceCount==='number' && Number.isSafeInteger(instanceCount) && instanceCount>=0 &&
      typeof instanceIndex==='number' && Number.isSafeInteger(instanceIndex) && instanceIndex>=0 && instanceIndex<=instanceCount) {
   selection.instanceCount=instanceCount;
   selection.instanceIndex=instanceIndex;
  }
  const delta = item.lastDomChange;
  if(delta && typeof delta.name==='string' && typeof delta.before==='string' && typeof delta.after==='string')
   selection.lastDomChange={name:delta.name.slice(0,80),before:delta.before.slice(0,500),after:delta.after.slice(0,500)};
  this.inspection.set(selection);
  if (selection.origin === 'workspace') return;
  this.focusBlockId = null;
  this.selectionOwner.set('preview');
  this.sourceRange.set(block && !this.previewStale() ? block : null);
 }
 private receiveActivity(value:unknown){
  if (!value || typeof value!=='object') return;
  const item = value as InspectionActivity;
  if (!['initial','event','render','state'].includes(item.kind) || !Number.isSafeInteger(item.id) ||
      typeof item.phase!=='string' || typeof item.eventName!=='string' || typeof item.handler!=='string') return;
  const changes = (Array.isArray(item.changes) ? item.changes : []).slice(0,20).flatMap(entry =>
    entry && typeof entry.name==='string' && typeof entry.before==='string' && typeof entry.after==='string'
      ? [{name:entry.name.slice(0,80),before:entry.before.slice(0,500),after:entry.after.slice(0,500)}] : []);
  const domChanges = (Array.isArray(item.domChanges) ? item.domChanges : []).slice(0,20).flatMap(entry =>
    entry && typeof entry.name==='string' && typeof entry.before==='string' &&
    typeof entry.after==='string' && typeof entry.tag==='string'
      ? [{name:entry.name.slice(0,80),before:entry.before.slice(0,400),after:entry.after.slice(0,400),
          tag:entry.tag.slice(0,80),blockId:typeof entry.blockId==='string'?entry.blockId.slice(0,100):null}] : []);
  const activity:InspectionActivity = {
   id:item.id,kind:item.kind,phase:item.phase.slice(0,150),at:Number.isFinite(item.at)?item.at:Date.now(),
   blockId:typeof item.blockId==='string'?item.blockId.slice(0,100):null,
   eventName:item.eventName.slice(0,80),handler:item.handler.slice(0,350),state:this.values(item.state),
   changes,domChanges,domChangeCount:Number.isSafeInteger(item.domChangeCount) && item.domChangeCount>=domChanges.length
     ? item.domChangeCount : domChanges.length,
  };
  this.activities.update(frames=>[...frames.slice(1-replayLimit),activity]);
 }
 openReplaySource(block:InspectionBlock) {
  if (!this.previewStale() && this.inspectionBlocks().includes(block)) this.focusSource(block,true);
 }
 private markComplete(){const generation=this.accountGeneration;const id=this.lesson().id;if(!this.completed().includes(id))this.completed.update(ids=>[...ids,id]);this.persist();if(this.user())void this.request('/api/learning/progress',{method:'PUT',body:JSON.stringify({completedLessonIds:this.completed()})}).catch(()=>{if(generation===this.accountGeneration)this.message.set('Completed in this tab; cloud sync failed. Run checks again when online to retry.');});}
 private restoreGuest(){
  this.resetCompilation();
  this.stopPreview();this.currentExperimentId='';this.selectedLessonId.set(this.lessons[0].id);this.componentTs.set(this.lessons[0].source);this.title='My Angular experiment';this.completed.set([]);this.experiments.set([]);this.results.set([]);this.state.set({});this.changes.set([]);this.compilationResult.set(null);this.compiledSource.set('');this.previewSource.set('');this.previewError.set('');this.shareLink.set('');this.templateHtml.set('');this.styleCss.set('');
  try{const saved=JSON.parse(localStorage.getItem(localKey)||'{}');if(Array.isArray(saved.completed))this.completed.set(saved.completed.filter((id:unknown)=>typeof id==='string'&&this.lessons.some(lesson=>lesson.id===id)));if(Array.isArray(saved.experiments))this.experiments.set(saved.experiments.filter((item:Experiment)=>typeof item?.id==='string'&&typeof item?.source==='string'&&typeof item?.title==='string').slice(0,20));if(saved.draft&&typeof saved.draft.source==='string'&&saved.draft.source.length<=60000){this.componentTs.set(saved.draft.source);if(this.lessons.some(lesson=>lesson.id===saved.draft.lessonId))this.selectedLessonId.set(saved.draft.lessonId);this.title=saved.draft.title||this.title;}}catch{ /* Guest mode works without browser storage. */ }
 }
 private persist(){if(this.user())return;try{localStorage.setItem(localKey,JSON.stringify({completed:this.completed(),experiments:this.experiments().slice(0,20),draft:{source:this.componentTs().slice(0,60000),lessonId:this.selectedLessonId(),title:this.title.slice(0,120)}}));}catch{this.message.set('Browser storage is full or unavailable. Copy a share link to keep this experiment.');}}
 private async request(path:string,options:RequestInit={}){const response=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(10000),...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;}
 private clearShareAddress(){this.shareLink.set('');if(location.hash.startsWith('#experiment='))try{history.replaceState(null,'',location.pathname+location.search);}catch{ /* An unavailable history API does not expose account data. */ }}
 async loadAccount(){
  const generation=++this.accountGeneration;this.accountLoading.set(true);
  try{
   const session=await this.request('/api/auth/session');if(generation!==this.accountGeneration)return;
   if(!session.user){if(this.user()){this.user.set(null);this.restoreGuest();this.clearShareAddress();}return;}
   if(this.user()&&this.user()?.id!==session.user.id){this.restoreGuest();this.clearShareAddress();}
   const id=session.user.id;this.user.set(session.user);
   const [library,progress]=await Promise.all([this.request('/api/learning/experiments'),this.request('/api/learning/progress')]);
   if(generation!==this.accountGeneration||this.user()?.id!==id)return;
   this.experiments.set(library.experiments||[]);const remote=progress.progress?.completedLessonIds||[];this.completed.set(remote.filter((lessonId:string)=>this.lessons.some(lesson=>lesson.id===lessonId)));
  }catch{ /* Guest mode remains available during an account-service outage. */ }
  finally{if(generation===this.accountGeneration)this.accountLoading.set(false);}
 }

 async saveExperiment(copy=false){
  if(this.saving())return;const generation=this.accountGeneration;const owner=this.user()?.id;this.saving.set(true);this.message.set('');const title=this.title.trim().slice(0,120)||this.lesson().title;
  try{
   if(this.componentTs().length>60000)throw new Error('Keep saved experiments below 60 KB.');
   if(this.user()){
    const existing=!copy&&this.currentExperimentId&&!this.currentExperimentId.startsWith('guest-');const endpoint='/api/learning/experiments'+(existing?'/'+encodeURIComponent(this.currentExperimentId):'');
    const saved=await this.request(endpoint,{method:existing?'PATCH':'POST',body:JSON.stringify({title,source:this.componentTs(),lessonId:this.selectedLessonId()})});if(generation!==this.accountGeneration||this.user()?.id!==owner)return;this.currentExperimentId=saved.experiment.id;const library=await this.request('/api/learning/experiments');if(generation!==this.accountGeneration||this.user()?.id!==owner)return;this.experiments.set(library.experiments);this.message.set('Saved to your Giorgi account.');
   }else{
    const id=!copy&&this.currentExperimentId?this.currentExperimentId:'guest-'+crypto.randomUUID();this.currentExperimentId=id;const experiment={id,title,source:this.componentTs(),lessonId:this.selectedLessonId(),updatedAt:new Date().toISOString()};this.experiments.update(items=>[experiment,...items.filter(item=>item.id!==id)].slice(0,20));this.persist();this.message.set('Saved in this browser. Sign in to save across devices.');
   }
   this.showLibrary.set(true);
  }catch(error){if(generation===this.accountGeneration)this.message.set(error instanceof Error?error.message:'Could not save the experiment.');}finally{if(generation===this.accountGeneration)this.saving.set(false);}
 }
 loadExperiment(experiment:Experiment){this.resetCompilation();this.clearShareAddress();this.currentExperimentId=experiment.id;this.title=experiment.title;this.componentTs.set(experiment.source);if(experiment.lessonId&&this.lessons.some(lesson=>lesson.id===experiment.lessonId))this.selectedLessonId.set(experiment.lessonId);this.results.set([]);this.hintCount.set(0);this.persist();this.runPreview();this.message.set('Loaded '+experiment.title+'.');}
 async deleteExperiment(experiment:Experiment){try{if(this.user())await this.request('/api/learning/experiments/'+encodeURIComponent(experiment.id),{method:'DELETE'});this.experiments.update(items=>items.filter(item=>item.id!==experiment.id));if(this.currentExperimentId===experiment.id)this.currentExperimentId='';this.persist();this.message.set('Experiment removed.');}catch{this.message.set('Could not remove that experiment. Please retry.');}}
 async share(){try{const payload=JSON.stringify({v:1,title:this.title.slice(0,120),lessonId:this.selectedLessonId(),source:this.componentTs()});if(new TextEncoder().encode(payload).length>24000)throw new Error('This experiment is too large for a portable link. Save it to your library instead.');const bytes=new TextEncoder().encode(payload);const encoded=btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=location.origin+location.pathname+'#experiment='+encoded;this.shareLink.set(url);await navigator.clipboard?.writeText(url);this.message.set('Share link ready. It contains the code, so only share code you want others to see.');}catch(error){this.message.set(error instanceof Error?error.message:'Copy the link below to share.');}}
 private readShare(){if(!location.hash.startsWith('#experiment='))return;try{const raw=location.hash.slice(12);if(raw.length>40000)throw new Error();const decoded=atob(raw.replace(/-/g,'+').replace(/_/g,'/'));const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded,char=>char.charCodeAt(0))));if(data.v!==1||typeof data.source!=='string'||data.source.length>60000)throw new Error();this.componentTs.set(data.source);this.title=typeof data.title==='string'?data.title.slice(0,120):'Shared experiment';if(this.lessons.some(lesson=>lesson.id===data.lessonId))this.selectedLessonId.set(data.lessonId);this.sharedImported=true;this.message.set('Shared experiment loaded. Review the code, then press Run preview when ready.');}catch{this.message.set('That share link could not be read. You can still start a lesson.');}}
 async signOut(){++this.accountGeneration;this.resetCompilation();clearTimeout(this.draftTimer);this.accountLoading.set(false);this.saving.set(false);this.isCompiling.set(false);try{await this.request('/api/auth/logout',{method:'POST',body:'{}'});this.user.set(null);this.restoreGuest();this.clearShareAddress();this.message.set('Signed out. Your private library is hidden; guest work is restored.');}catch{this.message.set('Could not sign out. Please retry.');}}
}
