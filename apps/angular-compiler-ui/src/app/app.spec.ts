import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { App } from './app';
import { CompilerApiService, type CompilationOutcome } from './services/compiler-api.service';
describe('Compiler actions',()=>{
 let response:Subject<CompilationOutcome>,app:App,calls:number;
 beforeEach(()=>{response=new Subject();calls=0;TestBed.configureTestingModule({providers:[{provide:CompilerApiService,useValue:{healthCheck:()=>of(true),compile:()=>{calls++;return response;}}}]});app=TestBed.runInInjectionContext(()=>new App());});
 it('shows progress and ignores duplicate compilation clicks until completion',()=>{app.compile();app.compile();expect(app.isCompiling()).toBe(true);expect(calls).toBe(1);response.next({success:true,files:[],compiledCode:'',diagnostics:[]});expect(app.isCompiling()).toBe(false);expect(app.compilationResult()?.success).toBe(true);});
 it('stops the loader and retains diagnostics after a network failure',()=>{app.compile();response.error({success:false,diagnostics:[{message:'Unavailable',category:'error'}],errorMessage:'Unavailable'});expect(app.isCompiling()).toBe(false);expect(app.compilationResult()?.diagnostics[0].message).toBe('Unavailable');});
});
