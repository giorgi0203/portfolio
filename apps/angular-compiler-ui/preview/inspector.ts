import * as core from '@angular/core';
import type {InspectionActivity, InspectionSelection} from '../src/app/inspection-types';
import type {MappedBlock} from './source-map';

type Sender=(type:string,data:Record<string,unknown>)=>void;
const clean=(value:string,size=500)=>value.replace(/\s+/g,' ').trim().slice(0,size);

/** Avoid user getters and toJSON hooks while showing ordinary component/loop data. */
function safeValue(value:unknown,depth=0,seen=new WeakSet<object>()):unknown {
  if(value===null||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string')return value.slice(0,400);
  if(typeof value==='undefined')return 'undefined';
  if(typeof value==='bigint')return value.toString()+'n';
  if(typeof value==='function')return '[function]';
  if(typeof value!=='object'||value instanceof Node)return '[unavailable]';
  if(value instanceof core.EventEmitter||value instanceof core.OutputEmitterRef)return '[Angular output]';
  if(depth>=3)return '[…]';
  if(seen.has(value))return '[circular]';seen.add(value);
  const descriptors=Object.getOwnPropertyDescriptors(value),entries=Object.entries(descriptors).filter(([key,descriptor])=>key!=='length'&&!key.startsWith('ɵ')&&'value' in descriptor).slice(0,12);
  if(Array.isArray(value))return entries.filter(([key])=>/^\d+$/.test(key)).map(([,descriptor])=>safeValue(descriptor.value,depth+1,seen));
  return Object.fromEntries(entries.map(([key,descriptor])=>[key,safeValue(descriptor.value,depth+1,seen)]));
}
export function componentState(instance:unknown):Record<string,string> {
  if(!instance||typeof instance!=='object')return {};
  const result:Record<string,string>={};
  for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(instance)).slice(0,40)){
    if(name.startsWith('_')||name.startsWith('ɵ')||!('value' in descriptor))continue;
    try{
      const value=descriptor.value;
      if(typeof value==='function'&&!core.isSignal(value))continue;
      result[name.slice(0,80)]=JSON.stringify(safeValue(core.isSignal(value)?value():value)).slice(0,500);
    }catch{result[name.slice(0,80)]='[unavailable]';}
  }
  return result;
}

export class PreviewInspector {
  private enabled=true;
  private pinned=false;
  private selected:Element|null=null;
  private selectedId:string|null=null;
  private blocks=new Map<string,MappedBlock>();
  private overlay:HTMLDivElement;
  private serial=0;
  private lastHover=0;
  private lastEvent:{blockId:string|null;eventName:string;handler:string}|null=null;
  constructor(private mount:Element,private send:Sender){
    this.overlay=document.createElement('div');this.overlay.setAttribute('data-lab-overlay','');
    this.overlay.style.cssText='display:none;position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #4e925f;background:rgba(116,172,88,.09);box-shadow:0 0 0 1px white;box-sizing:border-box;border-radius:3px';
    document.body.append(this.overlay);
    document.addEventListener('pointerover',this.hover,true);document.addEventListener('pointermove',this.move,true);document.addEventListener('focusin',this.focus,true);
    document.addEventListener('click',this.click,true);document.addEventListener('input',this.event,true);document.addEventListener('change',this.event,true);document.addEventListener('keydown',this.key,true);
    window.addEventListener('scroll',this.position,true);window.addEventListener('resize',this.position);
  }
  reset(blocks:MappedBlock[]){this.blocks=new Map(blocks.map(block=>[block.id,block]));this.selected=null;this.selectedId=null;this.pinned=false;this.lastEvent=null;this.serial=0;this.hide();this.send('learning:inspect',{selection:null});}
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled){this.pinned=false;this.selected=null;this.selectedId=null;this.hide();this.send('learning:inspect',{selection:null});}}
  unpin(){this.pinned=false;this.refresh();}
  focusBlock(id:string,pin=true){
    if(!this.blocks.has(id))return;this.enabled=true;this.pinned=pin;this.selectedId=id;
    this.selected=this.mount.querySelector<Element>(`[data-lab-node="${id}"]`);
    if(this.selected)this.selected.scrollIntoView({block:'nearest',inline:'nearest'});
    this.refresh();
  }
  private element(target:EventTarget|null){if(!(target instanceof Element)||target===this.mount||!this.mount.contains(target))return null;return target.closest<Element>('[data-lab-node]')||target;}
  private select(element:Element,pin:boolean){if(!this.mount.contains(element))return;const id=element.getAttribute('data-lab-node');this.selected=element;this.selectedId=id&&this.blocks.has(id)?id:null;this.pinned=pin;this.refresh();}
  private hover=(event:Event)=>{if(this.enabled&&!this.pinned){const element=this.element(event.target);if(element)this.select(element,false);}};
  private move=(event:Event)=>{if(performance.now()-this.lastHover<100)return;this.lastHover=performance.now();this.hover(event);};
  private focus=(event:Event)=>{if(this.enabled&&!this.pinned){const element=this.element(event.target);if(element)this.select(element,false);}};
  private click=(event:Event)=>{const element=this.element(event.target);if(this.enabled&&element)this.select(element,!(this.selected===element&&this.pinned));this.event(event);};
  private event=(event:Event)=>{
    const element=this.element(event.target);if(!element||!this.mount.contains(element))return;
    const block=this.blocks.get(element.getAttribute('data-lab-node')||'');
    this.lastEvent={blockId:block?.id||null,eventName:event.type,handler:block?.bindings.filter(binding=>(binding.kind==='event'||binding.kind==='two-way')&&binding.name===event.type).map(binding=>binding.expression).join('; ').slice(0,500)||''};
    this.activity('event','Browser event dispatched',[]);
  };
  private key=(event:KeyboardEvent)=>{if(event.key==='Escape')this.unpin();};
  private hide(){this.overlay.style.display='none';}
  private position=()=>{
    if(!this.enabled||!this.selected?.isConnected){this.hide();return;}
    const rect=this.selected.getBoundingClientRect();this.overlay.style.display=rect.width&&rect.height?'block':'none';
    Object.assign(this.overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',outlineColor:this.pinned?'#b17732':'#4e925f'});
  };
  private selection():InspectionSelection|null {
    const block=this.selectedId?this.blocks.get(this.selectedId):undefined;
    const element=this.selected;
    if(!block&&!element)return null;
    if(!element?.isConnected)return {blockId:block?.id||null,component:block?.component||'Unmapped component',tag:block?.tag||'element',text:'',attributes:[],values:{},locals:{},pinned:this.pinned,reason:'This source block has no rendered instance right now. A condition may be false or a list empty.'};
    let values:Record<string,string>={},reason:string|undefined=block?(block.outerLocalsOmitted?'Only the nearest loop scope is available here; outer loop aliases are intentionally omitted.':undefined):'This element’s template is not statically mapped. No exact source position is claimed.';const locals:Record<string,string>={};
    try{
      const debug=core.getDebugNode(element) as core.DebugElement|null;
      const context=debug?.context as Record<string,unknown>|undefined;
      const instance=debug?.componentInstance;
      const owner=context&&context.constructor?.name===block?.component?context:instance;
      values=componentState(owner);
      if(context&&context!==owner){
        for(const [name,key] of Object.entries(block?.localNames||{}).slice(0,20)){
          if(!key.startsWith('$')&&!['index','count','first','last','even','odd'].includes(key))continue;
          try{const value=context[key];if(value!==undefined)locals[name]=JSON.stringify(safeValue(value)).slice(0,500);}catch{ /* Scope metadata is optional. */ }
        }
      }
      if(!debug)reason='Angular debug context is unavailable for this element; rendered values are still shown.';
    }catch{reason='Angular scope is unavailable for this element; rendered values are still shown.';}
    const attributes=Array.from(element.attributes).filter(attribute=>!attribute.name.startsWith('data-lab-')&&!attribute.name.startsWith('_ng')).slice(0,16).map(attribute=>({name:attribute.name.slice(0,80),value:attribute.value.slice(0,300)}));
    if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement)attributes.push({name:'current value',value:element.value.slice(0,300)});
    return {blockId:block?.id||null,component:block?.component||'Unmapped component',tag:block?.tag||element.tagName.toLowerCase(),text:clean(element.textContent||'',700),attributes,values,locals,pinned:this.pinned,...(reason?{reason}:{})};
  }
  refresh(){this.position();if(this.selectedId||this.selected)this.send('learning:inspect',{selection:this.selection()});}
  rendered(changes:Array<{name:string;before:string;after:string}>,mutated:boolean){
    this.refresh();if(mutated)this.activity('render','Angular DOM bindings refreshed',changes);
  }
  private activity(kind:InspectionActivity['kind'],phase:string,changes:InspectionActivity['changes']){
    const activity:InspectionActivity={id:++this.serial,kind,phase,at:Date.now(),blockId:this.lastEvent?.blockId||null,eventName:this.lastEvent?.eventName||'',handler:this.lastEvent?.handler||'',changes:changes.slice(0,20)};
    this.send('learning:activity',{activity});
  }
}
