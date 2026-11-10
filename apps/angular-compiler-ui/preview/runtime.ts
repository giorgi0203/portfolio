import '@angular/compiler';
import * as core from '@angular/core';
import * as common from '@angular/common';
import * as forms from '@angular/forms';
import * as browser from '@angular/platform-browser';
import * as rxjs from 'rxjs';
import * as ts from 'typescript';

type Check={label:string;kind:'text'|'click-text'|'fill-text';selector:string;value?:string;expected:string};
type Config={channel:string;parentOrigin:string};
const config=(window as unknown as {__LEARNING_PREVIEW__:Config}).__LEARNING_PREVIEW__;
let application:core.ApplicationRef|undefined,observer:MutationObserver|undefined,runId=0;
let lastState:Record<string,string>={},batches=0;
const modules:Record<string,unknown>={'@angular/core':core,'@angular/common':common,'@angular/forms':forms,'@angular/platform-browser':browser,rxjs};
function send(type:string,data:Record<string,unknown>={}){window.parent.postMessage({channel:config.channel,type,runId,...data},config.parentOrigin);}
function state(){
 const instance=application?.components[0]?.instance;
 if(!instance)return;
 const next:Record<string,string>={};
 for(const [key,value] of Object.entries(instance).slice(0,30)){
  if(key.startsWith('_')||key.startsWith('ɵ'))continue;
  try{
   const current=core.isSignal(value)?value():value;
   if(typeof current==='function'||current instanceof Node)continue;
   const text=JSON.stringify(current);
   if(text!==undefined)next[key]=text.slice(0,500);
  }catch{ /* A user getter does not prevent the other state values from appearing. */ }
 }
 const changes=Object.keys(next).filter(key=>next[key]!==lastState[key]).map(key=>({name:key,before:lastState[key]??'—',after:next[key]}));
 lastState=next;
 send('learning:state',{state:next,changes,batches});
}
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(source:string,checks:Check[]){
 observer?.disconnect();application?.destroy();application=undefined;
 lastState={};batches=0;
 const mount=document.querySelector('#mount')!;mount.replaceChildren();
 try{
  if(source.length>60000)throw new Error('Keep experiments below 60 KB.');
  const output=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true,emitDecoratorMetadata:false,useDefineForClassFields:false}});
  const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw new Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  const exports:Record<string,unknown>={},module={exports};
  const require=(name:string)=>{if(!Object.prototype.hasOwnProperty.call(modules,name))throw new Error('Preview imports support Angular core/common/forms/platform-browser and rxjs.');return modules[name];};
  new Function('require','exports','module',output.outputText)(require,exports,module);
  const candidates=Object.values(module.exports) as Array<core.Type<unknown>&{ɵcmp?:{selectors:string[][]}}>;
  const root=(module.exports['DemoComponent']||candidates.find(value=>value?.ɵcmp)) as core.Type<unknown>&{ɵcmp?:{selectors:string[][]}};
  if(!root?.ɵcmp)throw new Error('Export a standalone @Component class, preferably DemoComponent.');
  const selector=root.ɵcmp.selectors?.[0]?.[0]||'learning-demo';
  mount.append(document.createElement(selector));
  application=await browser.bootstrapApplication(root,{providers:[core.provideZonelessChangeDetection()]});
  await application.whenStable();
  observer=new MutationObserver(()=>{batches++;state();});observer.observe(mount,{subtree:true,childList:true,characterData:true,attributes:true});
  state();send('learning:rendered');
  const results=[];
  for(const check of checks.slice(0,12)){
   let passed=false,actual='';
   const element=(check.selector==='body'?mount:mount.querySelector(check.selector)) as HTMLElement|null;
   if(element){
    if(check.kind==='click-text'){element.click();await pause(100);await application.whenStable();}
    if(check.kind==='fill-text'){
     (element as HTMLInputElement).value=check.value||'';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));await pause(100);await application.whenStable();
    }
    actual=(check.kind==='text'?element.textContent:mount.textContent)?.replace(/\s+/g,' ').trim()||'';
    passed=actual.includes(check.expected);
   }else actual='Element not found: '+check.selector;
   results.push({label:check.label,passed,actual:actual.slice(0,400)});
  }
  if(checks.length)send('learning:checked',{results,passed:results.every(result=>result.passed)});
 }catch(error){send('learning:error',{message:error instanceof Error?error.message:String(error)});}
}
document.addEventListener('click',()=>setTimeout(state,50));document.addEventListener('input',()=>setTimeout(state,50));
window.addEventListener('message',event=>{
 if(event.source!==window.parent||event.origin!==config.parentOrigin||event.data?.channel!==config.channel)return;
 if(event.data.type==='learning:run'&&typeof event.data.source==='string'){
  runId=event.data.runId;void run(event.data.source,Array.isArray(event.data.checks)?event.data.checks:[]);
 }
});
window.addEventListener('error',event=>send('learning:error',{message:event.message}));
window.addEventListener('unhandledrejection',event=>send('learning:error',{message:String(event.reason?.message||event.reason)}));
send('learning:ready');
