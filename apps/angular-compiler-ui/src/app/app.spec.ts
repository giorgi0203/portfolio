import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { App } from './app';
import { CompilerApiService, type CompilationOutcome } from './services/compiler-api.service';
describe('Compiler actions',()=>{
 let response:Subject<CompilationOutcome>,app:App,calls:number;
 beforeEach(()=>{response=new Subject();calls=0;TestBed.configureTestingModule({providers:[{provide:CompilerApiService,useValue:{healthCheck:()=>of(true),compile:()=>{calls++;return response;}}}]});app=TestBed.runInInjectionContext(()=>new App());});
 afterEach(()=>{app.ngOnDestroy();vi.unstubAllGlobals();});
 it('keeps the active lesson when an earlier manual compile finishes later',async()=>{
  app.compile();
  const lesson=app.lessons[1];
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
   source:lesson.source,files:[{path:'lesson.js',content:'lesson output'}],diagnostics:[],
  }))));
  app.chooseLesson(lesson);
  response.next({success:true,files:[],compiledCode:'obsolete output',diagnostics:[]});
  await vi.waitFor(()=>expect(app.compilationResult()).toMatchObject({compiledCode:'lesson output'}));
  expect(app.compiledSource()).toBe(lesson.source);
 });
 it('releases live state and the current selection when the preview is stopped',()=>{
  app.batches.set(5);app.state.set({count:'2'});app.changes.set([{name:'count',before:'1',after:'2'}]);
  app.previewError.set('old error');app.stopPreview();
  expect(app.previewStatus()).toBe('idle');expect(app.state()).toEqual({});expect(app.changes()).toEqual([]);
  expect(app.batches()).toBe(0);expect(app.previewError()).toBe('');
 });
 it('shows progress and ignores duplicate compilation clicks until completion',()=>{app.compile();app.compile();expect(app.isCompiling()).toBe(true);expect(calls).toBe(1);response.next({success:true,files:[],compiledCode:'',diagnostics:[]});expect(app.isCompiling()).toBe(false);expect(app.compilationResult()?.success).toBe(true);});
 it('stops the loader and retains diagnostics after a network failure',()=>{app.compile();response.error({success:false,diagnostics:[{message:'Unavailable',category:'error'}],errorMessage:'Unavailable'});expect(app.isCompiling()).toBe(false);expect(app.compilationResult()?.diagnostics[0].message).toBe('Unavailable');});
});
