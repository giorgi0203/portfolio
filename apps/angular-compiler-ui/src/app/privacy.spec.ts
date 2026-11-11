import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { App } from './app';
import { CompilerApiService, type CompilationOutcome } from './services/compiler-api.service';
interface Bridge {channel:string;runId:number;onMessage:(event:MessageEvent)=>void;}
const localKey='giorgi-learning-v1';
const owner={id:'owner-a',name:'Owner A',email:'a@example.invalid'};
const other={id:'owner-b',name:'Owner B',email:'b@example.invalid'};
const experiment={id:'private-a',title:'Private A',source:'const PRIVATE_SOURCE_A = "hidden";',lessonId:'signals',updatedAt:'2026-11-10T00:00:00Z'};
const json=(data:unknown)=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
function deferred<T>(){let resolve:(value:T)=>void=()=>{throw new Error('Missing deferred resolver');};const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
describe('Learning Lab private state and preview boundary',()=>{
 let app:App|undefined,compilation:Subject<CompilationOutcome>;
 beforeEach(()=>{localStorage.clear();history.replaceState(null,'',location.pathname);compilation=new Subject();TestBed.configureTestingModule({providers:[{provide:CompilerApiService,useValue:{healthCheck:()=>of(true),compile:()=>compilation}}]});});
 afterEach(()=>{app?.ngOnDestroy();vi.unstubAllGlobals();localStorage.clear();history.replaceState(null,'',location.pathname);});
 const create=()=>TestBed.runInInjectionContext(()=>new App());
 it('loads a portable shared program without automatically executing it',async()=>{
  const payload=JSON.stringify({v:1,title:'Untrusted shared program',source:'while (true) {}'});
  history.replaceState(null,'','#experiment='+btoa(payload));
  vi.stubGlobal('fetch',vi.fn(async()=>json({user:null,ok:true})));
  app=create();app.ngOnInit();await new Promise(resolve=>setTimeout(resolve,30));
  expect(app.componentTs()).toBe('while (true) {}');expect(app.previewStatus()).toBe('idle');expect(app.previewHtml()).toBeNull();
 });
 it('accepts one ready handshake and sends only the source captured when Run was pressed',()=>{
  app=create();const frame={postMessage:vi.fn()} as unknown as Window;
  app.previewFrame=new ElementRef({contentWindow:frame} as HTMLIFrameElement);
  app.setSource('const captured = "run snapshot";');app.runPreview();const bridge=app as unknown as Bridge;
  const channel=bridge.channel;
  app.setSource('const PRIVATE_NEW_EDIT = "not run";');
  const event=new MessageEvent('message',{origin:'null',source:frame,data:{type:'learning:ready',channel}});
  bridge.onMessage(event);bridge.onMessage(event);
  expect(frame.postMessage).toHaveBeenCalledTimes(1);
  expect(frame.postMessage).toHaveBeenCalledWith(expect.objectContaining({source:'const captured = "run snapshot";'}),'*');
  expect(JSON.stringify(vi.mocked(frame.postMessage).mock.calls)).not.toContain('PRIVATE_NEW_EDIT');
 });
 it('ignores forged sources, origins and stale preview channels',()=>{
  app=create();const frame={postMessage:vi.fn()} as unknown as Window;
  app.previewFrame=new ElementRef({contentWindow:frame} as HTMLIFrameElement);app.runPreview();const bridge=app as unknown as Bridge,channel=bridge.channel;
  for(const event of [new MessageEvent('message',{origin:'https://attacker.invalid',source:frame,data:{type:'learning:ready',channel}}),new MessageEvent('message',{origin:'null',source:window,data:{type:'learning:ready',channel}}),new MessageEvent('message',{origin:'null',source:frame,data:{type:'learning:ready',channel:'old-channel'}})])bridge.onMessage(event);
  app.stopPreview();bridge.onMessage(new MessageEvent('message',{origin:'null',source:frame,data:{type:'learning:ready',channel}}));
  expect(frame.postMessage).not.toHaveBeenCalled();
 });
 it('does not merge guest progress into an account or persist its private experiment on logout',async()=>{
  const draft='const guestDraft = true;';localStorage.setItem(localKey,JSON.stringify({completed:['signals'],experiments:[],draft:{source:draft,title:'Guest draft',lessonId:'signals'}}));
  const requests:{path:string;method:string}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(path:string,options?:RequestInit)=>{requests.push({path,method:options?.method||'GET'});if(path==='/api/auth/session')return json({user:owner});if(path==='/api/learning/experiments')return json({experiments:[experiment]});if(path==='/api/learning/progress')return json({progress:{completedLessonIds:[]}});return json({ok:true});}));
  app=create();await app.loadAccount();expect(app.completed()).toEqual([]);expect(requests.some(request=>request.path==='/api/learning/progress'&&request.method==='PUT')).toBe(false);
  app.loadExperiment(experiment);app.setSource('const PRIVATE_LATEST = true;');await new Promise(resolve=>setTimeout(resolve,330));
  expect(localStorage.getItem(localKey)).not.toContain('PRIVATE_');
  await app.signOut();expect(app.user()).toBeNull();expect(app.experiments()).toEqual([]);expect(app.componentTs()).toBe(draft);expect(localStorage.getItem(localKey)).not.toContain('PRIVATE_');
 });
 it('does not restore a private library from a request that finishes after logout',async()=>{
  const library=deferred<Response>();
  const fetcher=vi.fn(async(path:string)=>path==='/api/auth/session'?json({user:owner}):path==='/api/learning/experiments'?library.promise:path==='/api/learning/progress'?json({progress:{completedLessonIds:['signals']}}):json({ok:true}));vi.stubGlobal('fetch',fetcher);
  app=create();const loading=app.loadAccount();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/api/learning/experiments',expect.anything()));
  await app.signOut();library.resolve(json({experiments:[experiment]}));await loading;
  expect(app.user()).toBeNull();expect(app.experiments()).toEqual([]);expect(app.componentTs()).not.toContain('PRIVATE_SOURCE_A');
 });
 it('ignores stale account A data after switching to account B',async()=>{
  const oldLibrary=deferred<Response>();let session=0;
  const fetcher=vi.fn(async(path:string)=>{if(path==='/api/auth/session')return json({user:++session===1?owner:other});if(path==='/api/learning/experiments')return session===1?oldLibrary.promise:json({experiments:[]});if(path==='/api/learning/progress')return json({progress:{completedLessonIds:[]}});return json({ok:true});});vi.stubGlobal('fetch',fetcher);
  app=create();const first=app.loadAccount();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledWith('/api/learning/experiments',expect.anything()));await app.loadAccount();oldLibrary.resolve(json({experiments:[experiment]}));await first;
  expect(app.user()?.id).toBe(other.id);expect(app.experiments()).toEqual([]);expect(app.componentTs()).not.toContain('PRIVATE_SOURCE_A');
 });
 it('does not repopulate private compiled output after logout',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>json({ok:true})));app=create();app.user.set(owner);app.componentTs.set(experiment.source);app.compile();await app.signOut();
  compilation.next({success:true,files:[{path:'component.js',content:'PRIVATE_COMPILED_SOURCE'}],compiledCode:'PRIVATE_COMPILED_SOURCE',diagnostics:[]});
  expect(app.compilationResult()).toBeNull();expect(app.isCompiling()).toBe(false);
 });
});
