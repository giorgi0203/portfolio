import { Component, inject, signal, computed, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { CompilerApiService, type CompilationOutcome } from './services/compiler-api.service';
import { CodeEditorComponent } from './components/code-editor/code-editor.component';
import { CompilerExplorerComponent } from './components/compiler-explorer/compiler-explorer.component';
import type { InspectionActivity, InspectionBlock, InspectionSelection } from './inspection-types';
import type { SourceEditorRange } from './components/code-editor/code-editor.component';
import { learningLessons, type LearningLesson } from './lessons';
import { previewDocument } from './preview-document';
interface Experiment {id:string;title:string;source:string;lessonId?:string;createdAt?:string;updatedAt?:string;}
interface User {id:string;name:string;email:string;}
interface CheckResult {label:string;passed:boolean;actual:string;}
interface Change {name:string;before:string;after:string;}
const localKey='giorgi-learning-v1';
@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule,CodeEditorComponent,CompilerExplorerComponent],templateUrl:'./app.html',styleUrl:'./app.css'})
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
 readonly inspectedBlock=computed(()=>this.inspectionBlocks().find(block=>block.id===this.inspection()?.blockId)||null);
 readonly inspectedValues=computed(()=>Object.entries(this.inspection()?.values||{}));
 readonly inspectedLocals=computed(()=>Object.entries(this.inspection()?.locals||{}));
 readonly lastActivity=computed(()=>this.activities()[0]||null);
 completed=signal<string[]>([]);experiments=signal<Experiment[]>([]);user=signal<User|null>(null);accountLoading=signal(true);saving=signal(false);
 title='My Angular experiment';message=signal('');shareLink=signal('');
 private sharedImported=false;private accountGeneration=0;private readyConsumed=false;private runSource='';private runChecks:LearningLesson['checks']=[];private channel='';private runId=0;private pendingChecks=false;private previewTimer?:ReturnType<typeof setTimeout>;private draftTimer?:ReturnType<typeof setTimeout>;private currentExperimentId='';
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
  if(data.type==='learning:rendered'){clearTimeout(this.previewTimer);this.previewStatus.set('running');this.sendPreview('learning:inspect-mode',{enabled:this.inspectionEnabled()});}
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
 ngOnInit(){window.addEventListener('message',this.onMessage);void this.loadAccount();if(!this.sharedImported&&this.componentTs()===this.lesson().source)setTimeout(()=>this.runPreview(),0);this.telemetry();}
 ngOnDestroy(){window.removeEventListener('message',this.onMessage);clearTimeout(this.previewTimer);clearTimeout(this.draftTimer);}
 private telemetry(){if(navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl)return;let referrer='';try{referrer=new URL(document.referrer).hostname;}catch{ /* Direct visit. */ }void fetch('/api/analytics/event',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'pageview',label:'home',referrer}),keepalive:true}).catch(()=>undefined);}
 checkServerStatus(){this.serverStatus.set('checking');this.compilerService.healthCheck().subscribe({next:healthy=>this.serverStatus.set(healthy?'online':'offline'),error:()=>this.serverStatus.set('offline')});}
 setSource(value:string){this.shareLink.set('');this.sourceRange.set(null);this.componentTs.set(value);this.results.set([]);clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>this.persist(),300);}
 chooseLesson(lesson:LearningLesson){this.selectedLessonId.set(lesson.id);this.componentTs.set(lesson.source);this.title=lesson.title;this.currentExperimentId='';this.hintCount.set(0);this.results.set([]);this.compilationResult.set(null);this.compiledSource.set('');this.message.set('');this.persist();this.runPreview();}
 runPreview(checks=false){
  this.stopPreview();this.pendingChecks=checks;this.runSource=this.componentTs();this.previewSource.set(this.runSource);if(checks)this.showGuide.set(true);this.runChecks=checks?this.lesson().checks:[];this.readyConsumed=false;this.runId++;this.channel=crypto.randomUUID();this.previewError.set('');this.previewStatus.set('loading');this.state.set({});this.changes.set([]);this.batches.set(0);if(checks)this.results.set([]);
  this.previewHtml.set(this.sanitizer.bypassSecurityTrustHtml(previewDocument(location.origin,this.channel)));
  this.previewTimer=setTimeout(()=>{if(this.previewStatus()==='loading'){this.previewStatus.set('error');this.previewError.set('The preview could not start. Check your code, then press Run preview to retry.');}},30000);
 }
 stopPreview(){this.inspection.set(null);this.inspectionBlocks.set([]);this.activities.set([]);this.sourceRange.set(null);this.inspectionTruncated.set(false);this.inspectionUnmapped.set([]);clearTimeout(this.previewTimer);this.readyConsumed=true;this.channel='';this.runId++;this.previewHtml.set(null);this.previewStatus.set('idle');}
 showHint(){this.hintCount.update(count=>Math.min(count+1,this.lesson().hints.length));}
 revealSolution(){this.setSource(this.lesson().solution);this.message.set('Solution loaded. Run the challenge checks to see how it behaves.');this.runPreview();}
 resetLesson(){this.chooseLesson(this.lesson());}
 compile(){if(this.isCompiling())return;const generation=this.accountGeneration,owner=this.user()?.id,source=this.componentTs();this.isCompiling.set(true);this.compilationResult.set(null);this.compiledSource.set(source);this.compilerService.compile(source,this.templateHtml(),this.styleCss()||undefined).subscribe({next:result=>{if(generation!==this.accountGeneration||owner!==this.user()?.id)return;this.compilationResult.set(result);this.isCompiling.set(false);},error:error=>{if(generation!==this.accountGeneration||owner!==this.user()?.id)return;this.compilationResult.set(error);this.isCompiling.set(false);}});}
 private sendPreview(type:string,payload:Record<string,unknown>={}){if(!this.readyConsumed||!this.previewHtml())return;this.previewFrame?.nativeElement.contentWindow?.postMessage({type,channel:this.channel,runId:this.runId,...payload},'*');}
 toggleInspection(){this.inspectionEnabled.update(value=>!value);this.sendPreview('learning:inspect-mode',{enabled:this.inspectionEnabled()});if(!this.inspectionEnabled())this.inspection.set(null);}
 unpinInspection(){this.sendPreview('learning:unpin');}
 openMappedSource(){if(this.previewStale()){this.message.set('Run the latest source before highlighting it. The block shown belongs to the previous run.');return;}const block=this.inspectedBlock();if(block){this.sourceRange.set({startLine:block.startLine,endLine:block.endLine,startColumn:block.startColumn,endColumn:block.endColumn,start:block.start,end:block.end});this.mobileTab.set('editor');}}
 focusSource(range:{startLine:number;endLine:number;startColumn?:number;endColumn?:number;start?:number;end?:number},openEditor=false){
  if(!range||!Number.isFinite(range.startLine)||!Number.isFinite(range.endLine))return;
  const count=this.componentTs().split('\n').length,startLine=Math.max(1,Math.min(count,Math.floor(range.startLine))),endLine=Math.max(startLine,Math.min(count,Math.floor(range.endLine)));
  const start=typeof range.start==='number'&&Number.isInteger(range.start)&&range.start>=0&&range.start<=this.componentTs().length?range.start:undefined,end=typeof range.end==='number'&&Number.isInteger(range.end)&&range.end>=0&&range.end<=this.componentTs().length?range.end:undefined;
  this.sourceRange.set({startLine,endLine,startColumn:range.startColumn,endColumn:range.endColumn,start,end});
  if(!this.previewStale()){
   const candidates=this.inspectionBlocks().filter(block=>start!==undefined&&end!==undefined?(start===end?block.start<=start&&block.end>start:block.start<end&&block.end>start):block.startLine<=endLine&&block.endLine>=startLine).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
   if(candidates[0]){this.inspectionEnabled.set(true);this.sendPreview('learning:inspect-mode',{enabled:true});this.sendPreview('learning:focus-block',{blockId:candidates[0].id,pin:true});}
  }
  if(openEditor)this.mobileTab.set('editor');
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
  if(value===null){this.inspection.set(null);this.sourceRange.set(null);return;}if(!value||typeof value!=='object')return;
  const item=value as InspectionSelection;if(typeof item.tag!=='string'||typeof item.component!=='string'||typeof item.text!=='string')return;
  const block=this.inspectionBlocks().find(entry=>entry.id===item.blockId);
  const selection:InspectionSelection={blockId:block?.id||null,component:item.component.slice(0,100),tag:item.tag.slice(0,80),text:item.text.slice(0,1000),attributes:Array.isArray(item.attributes)?item.attributes.filter(entry=>entry&&typeof entry.name==='string'&&typeof entry.value==='string').slice(0,15).map(entry=>({name:entry.name.slice(0,80),value:entry.value.slice(0,250)})):[],values:this.values(item.values),locals:this.values(item.locals),pinned:item.pinned===true,reason:typeof item.reason==='string'?item.reason.slice(0,300):undefined};
  this.inspection.set(selection);if(block&&!this.previewStale())this.sourceRange.set({startLine:block.startLine,endLine:block.endLine,startColumn:block.startColumn,endColumn:block.endColumn,start:block.start,end:block.end});else this.sourceRange.set(null);
 }
 private receiveActivity(value:unknown){
  if(!value||typeof value!=='object')return;const item=value as InspectionActivity;if(!['event','render'].includes(item.kind)||typeof item.phase!=='string'||typeof item.eventName!=='string'||typeof item.handler!=='string')return;
  const changes=Array.isArray(item.changes)?item.changes.filter(entry=>entry&&typeof entry.name==='string'&&typeof entry.before==='string'&&typeof entry.after==='string').slice(0,15).map(entry=>({name:entry.name.slice(0,80),before:entry.before.slice(0,300),after:entry.after.slice(0,300)})):[];
  const activity:InspectionActivity={id:Number.isFinite(item.id)?item.id:Date.now(),kind:item.kind,phase:item.phase.slice(0,150),at:Number.isFinite(item.at)?item.at:Date.now(),blockId:typeof item.blockId==='string'?item.blockId.slice(0,100):null,eventName:item.eventName.slice(0,80),handler:item.handler.slice(0,350),changes};
  this.activities.update(items=>[activity,...items].slice(0,18));
 }
 private markComplete(){const generation=this.accountGeneration;const id=this.lesson().id;if(!this.completed().includes(id))this.completed.update(ids=>[...ids,id]);this.persist();if(this.user())void this.request('/api/learning/progress',{method:'PUT',body:JSON.stringify({completedLessonIds:this.completed()})}).catch(()=>{if(generation===this.accountGeneration)this.message.set('Completed in this tab; cloud sync failed. Run checks again when online to retry.');});}
 private restoreGuest(){
  this.stopPreview();this.currentExperimentId='';this.selectedLessonId.set(this.lessons[0].id);this.componentTs.set(this.lessons[0].source);this.title='My Angular experiment';this.completed.set([]);this.experiments.set([]);this.results.set([]);this.state.set({});this.changes.set([]);this.compilationResult.set(null);this.compiledSource.set('');this.previewSource.set('');this.previewError.set('');this.shareLink.set('');this.templateHtml.set('');this.styleCss.set('');
  try{const saved=JSON.parse(localStorage.getItem(localKey)||'{}');if(Array.isArray(saved.completed))this.completed.set(saved.completed.filter((id:unknown)=>typeof id==='string'&&this.lessons.some(lesson=>lesson.id===id)));if(Array.isArray(saved.experiments))this.experiments.set(saved.experiments.filter((item:Experiment)=>typeof item?.id==='string'&&typeof item?.source==='string'&&typeof item?.title==='string').slice(0,20));if(saved.draft&&typeof saved.draft.source==='string'&&saved.draft.source.length<=60000){this.componentTs.set(saved.draft.source);if(this.lessons.some(lesson=>lesson.id===saved.draft.lessonId))this.selectedLessonId.set(saved.draft.lessonId);this.title=saved.draft.title||this.title;}}catch{ /* Guest mode works without browser storage. */ }
 }
 private persist(){if(this.user())return;try{localStorage.setItem(localKey,JSON.stringify({completed:this.completed(),experiments:this.experiments().slice(0,20),draft:{source:this.componentTs().slice(0,60000),lessonId:this.selectedLessonId(),title:this.title.slice(0,120)}}));}catch{this.message.set('Browser storage is full or unavailable. Copy a share link to keep this experiment.');}}
 private async request(path:string,options:RequestInit={}){const response=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(10000),...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;}
 private clearShareAddress(){this.shareLink.set('');if(location.hash.startsWith('#experiment='))try{history.replaceState(null,'',location.pathname+location.search);}catch{ /* An unavailable history API does not expose account data. */ }}
 async loadAccount(){
  const generation=++this.accountGeneration;this.isCompiling.set(false);this.accountLoading.set(true);
  try{
   const session=await this.request('/api/auth/session');if(generation!==this.accountGeneration)return;
   if(!session.user){if(this.user()){this.user.set(null);this.restoreGuest();this.clearShareAddress();}return;}
   if(this.user()&&this.user()!.id!==session.user.id){this.restoreGuest();this.clearShareAddress();}
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
 loadExperiment(experiment:Experiment){this.clearShareAddress();this.currentExperimentId=experiment.id;this.title=experiment.title;this.componentTs.set(experiment.source);if(this.lessons.some(lesson=>lesson.id===experiment.lessonId))this.selectedLessonId.set(experiment.lessonId!);this.results.set([]);this.hintCount.set(0);this.persist();this.runPreview();this.message.set('Loaded '+experiment.title+'.');}
 async deleteExperiment(experiment:Experiment){try{if(this.user())await this.request('/api/learning/experiments/'+encodeURIComponent(experiment.id),{method:'DELETE'});this.experiments.update(items=>items.filter(item=>item.id!==experiment.id));if(this.currentExperimentId===experiment.id)this.currentExperimentId='';this.persist();this.message.set('Experiment removed.');}catch{this.message.set('Could not remove that experiment. Please retry.');}}
 async share(){try{const payload=JSON.stringify({v:1,title:this.title.slice(0,120),lessonId:this.selectedLessonId(),source:this.componentTs()});if(new TextEncoder().encode(payload).length>24000)throw new Error('This experiment is too large for a portable link. Save it to your library instead.');const bytes=new TextEncoder().encode(payload);const encoded=btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=location.origin+location.pathname+'#experiment='+encoded;this.shareLink.set(url);await navigator.clipboard?.writeText(url);this.message.set('Share link ready. It contains the code, so only share code you want others to see.');}catch(error){this.message.set(error instanceof Error?error.message:'Copy the link below to share.');}}
 private readShare(){if(!location.hash.startsWith('#experiment='))return;try{const raw=location.hash.slice(12);if(raw.length>40000)throw new Error();const decoded=atob(raw.replace(/-/g,'+').replace(/_/g,'/'));const data=JSON.parse(new TextDecoder().decode(Uint8Array.from(decoded,char=>char.charCodeAt(0))));if(data.v!==1||typeof data.source!=='string'||data.source.length>60000)throw new Error();this.componentTs.set(data.source);this.title=typeof data.title==='string'?data.title.slice(0,120):'Shared experiment';if(this.lessons.some(lesson=>lesson.id===data.lessonId))this.selectedLessonId.set(data.lessonId);this.sharedImported=true;this.message.set('Shared experiment loaded. Review the code, then press Run preview when ready.');}catch{this.message.set('That share link could not be read. You can still start a lesson.');}}
 async signOut(){++this.accountGeneration;clearTimeout(this.draftTimer);this.accountLoading.set(false);this.saving.set(false);this.isCompiling.set(false);try{await this.request('/api/auth/logout',{method:'POST',body:'{}'});this.user.set(null);this.restoreGuest();this.clearShareAddress();this.message.set('Signed out. Your private library is hidden; guest work is restored.');}catch{this.message.set('Could not sign out. Please retry.');}}
}
