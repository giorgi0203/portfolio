import * as core from '@angular/core';
import type {InspectionActivity, InspectionChange, InspectionSelection, RecordedDomChange} from '../src/app/inspection-types';
import type {MappedBlock} from './source-map';

type Sender=(type:string,data:Record<string,unknown>)=>void;
const clean=(value:string,size=500)=>value.replace(/\s+/g,' ').trim().slice(0,size);

function describeNodes(nodes:NodeList):string {
  const names:string[]=[];
  for(let i=0;i<Math.min(nodes.length,4);i++){
    const node=nodes[i];
    names.push(node instanceof Element?`<${node.localName}>`:node.nodeName.toLowerCase());
  }
  if(nodes.length>4)names.push('…');
  return names.join(', ');
}

/** Pair the first oldValue for each field in the batch with its final browser value. */
function domChange(record:MutationRecord,element:Element,seen:Map<Node,Set<string>>):InspectionChange|null {
  if(record.type==='childList')return {
    name:'Child nodes',
    before:record.removedNodes.length?'Removed '+describeNodes(record.removedNodes):'None removed',
    after:record.addedNodes.length?'Added '+describeNodes(record.addedNodes):'None added'
  };
  const attr=record.attributeName;
  if(attr?.startsWith('data-lab-')||attr?.startsWith('_ng'))return null;
  if(!attr&&record.target.nodeType!==Node.TEXT_NODE)return null;
  const field=attr?`${record.attributeNamespace??''}:${attr}`:'text';
  let fields=seen.get(record.target);
  if(fields?.has(field))return null;
  if(!fields){fields=new Set();seen.set(record.target,fields);}
  fields.add(field);
  const after=attr?element.getAttributeNS(record.attributeNamespace,attr):record.target.nodeValue;
  if(record.oldValue===after)return null;
  return {
    name:attr?'@'+attr:'Text',
    before:record.oldValue?.slice(0,400)??'(absent)',
    after:after?.slice(0,400)??'(absent)'
  };
}

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
  private followSource=false;
  private requestedIndex=1;
  private domChanges=new WeakMap<Element,InspectionChange>();
  constructor(private mount:Element,private send:Sender,private readRootState:()=>Record<string,string>=()=>({})){
    this.overlay=document.createElement('div');this.overlay.setAttribute('data-lab-overlay','');
    this.overlay.style.cssText='display:none;position:fixed;pointer-events:none;z-index:2147483647;outline:2px solid #4e925f;background:rgba(116,172,88,.09);box-shadow:0 0 0 1px white;box-sizing:border-box;border-radius:3px';
    document.body.append(this.overlay);
    document.addEventListener('pointerover',this.hover,true);document.addEventListener('pointermove',this.move,true);document.addEventListener('focusin',this.focus,true);
    document.addEventListener('click',this.click,true);document.addEventListener('input',this.event,true);document.addEventListener('change',this.event,true);document.addEventListener('keydown',this.key,true);
    window.addEventListener('scroll',this.position,true);window.addEventListener('resize',this.position);
  }
  reset(blocks:MappedBlock[]){
    this.blocks=new Map(blocks.map(block=>[block.id,block]));
    this.domChanges=new WeakMap();
    this.serial=0;
    this.clearFocus();
  }
  clearFocus(){
    this.pinned=false;this.selected=null;this.selectedId=null;this.followSource=false;
    this.hide();this.send('learning:inspect',{selection:null});
  }
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.clearFocus();}
  unpin(){this.pinned=false;this.refresh();}
  private instances(id:string){
    return Array.from(this.mount.querySelectorAll<Element>(`[data-lab-node="${id}"]`));
  }
  focusBlock(id:string,pin=true,instanceIndex?:number){
    if(!this.blocks.has(id))return;
    const instances=this.instances(id);
    const existingPosition=this.selected?instances.indexOf(this.selected)+1:0;
    this.requestedIndex=instanceIndex!==undefined && Number.isInteger(instanceIndex) && instanceIndex>0
      ?instanceIndex:Math.max(1,existingPosition);
    this.followSource=true;
    this.enabled=true;
    this.pinned=pin;
    this.selectedId=id;
    this.selected=instances[this.requestedIndex-1]??null;
    // Keep the main editor in place when the source selection changes.
    const scrollOptions={block:'nearest',inline:'nearest',container:'nearest'} as const;
    this.selected?.scrollIntoView?.(scrollOptions);
    this.refresh();
  }
  private element(target:EventTarget|null){return target instanceof Element && target!==this.mount && this.mount.contains(target)?target:null;}
  private select(element:Element,pin:boolean){
    if(!this.mount.contains(element)||(element===this.selected&&pin===this.pinned))return;
    const id=element.getAttribute('data-lab-node');
    this.followSource=false;this.selected=element;this.selectedId=id&&this.blocks.has(id)?id:null;this.pinned=pin;this.refresh();
  }
  private hover=(event:Event)=>{if(this.enabled&&!this.pinned){const element=this.element(event.target);if(element)this.select(element,false);}};
  private move=(event:Event)=>{if(performance.now()-this.lastHover<100)return;this.lastHover=performance.now();this.hover(event);};
  private focus=(event:Event)=>{if(this.enabled&&!this.pinned){const element=this.element(event.target);if(element)this.select(element,false);}};
  private click=(event:Event)=>{const element=this.element(event.target);if(this.enabled&&element)this.select(element,!(this.selected===element&&this.pinned));this.event(event);};
  private event=(event:Event)=>{
    const element=this.element(event.target);if(!element||!this.mount.contains(element))return;
    const block=this.blocks.get(element.getAttribute('data-lab-node')||'');
    const handler=block?.bindings.filter(binding=>(binding.kind==='event'||binding.kind==='two-way')&&binding.name===event.type).map(binding=>binding.expression).join('; ').slice(0,500)||'';
    this.activity('event','Browser event dispatched',this.readRootState(),{blockId:block?.id??null,eventName:event.type,handler});
  };
  private key=(event:KeyboardEvent)=>{if(event.key==='Escape')this.unpin();};
  private hide(){this.overlay.style.display='none';}
  private position=()=>{
    if(!this.enabled||!this.selected?.isConnected){this.hide();return;}
    const rect=this.selected.getBoundingClientRect();this.overlay.style.display=rect.width&&rect.height?'block':'none';
    Object.assign(this.overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',outlineColor:this.pinned?'#b17732':'#4e925f'});
  };
  private selection(instances:Element[]):InspectionSelection|null {
    const block=this.selectedId?this.blocks.get(this.selectedId):undefined;
    const element=this.selected;
    const origin=this.followSource?'workspace':'preview';
    if(!block&&!element)return null;
    if(!element||!this.mount.contains(element))return {blockId:block?.id||null,component:block?.component||'Unmapped component',tag:block?.tag||'element',text:'',attributes:[],values:{},locals:{},pinned:this.pinned,origin,instanceIndex:0,instanceCount:instances.length,reason:instances.length?'The selected instance is no longer rendered. Select a visible instance to inspect its values.':'This source block has no rendered instance right now. A condition may be false or a list empty.'};
    let values:Record<string,string>={},reason:string|undefined=block?(block.outerLocalsOmitted?'Only the nearest loop scope is available here; outer loop aliases are intentionally omitted.':undefined):'This element’s template is not statically mapped. No exact source position is claimed.';const locals:Record<string,string>={};
    try{
      // DebugElement.context and .componentInstance prefer the child on a component host.
      // A binding on the host belongs to the component that declared it in its template.
      const ng=(window as Window & Partial<core.ɵGlobalDevModeUtils>).ng;
      const owner=ng?.getOwningComponent<object>(element);
      const ownerMatches=block && owner && Object.getPrototypeOf(owner)?.constructor?.name===block.component;
      if(ownerMatches)values=componentState(owner);
      const context=ownerMatches?ng?.getContext<Record<string,unknown>>(element):null;
      if(context&&context!==owner){
        for(const [name,key] of Object.entries(block?.localNames||{}).slice(0,20)){
          if(!key.startsWith('$')&&!['index','count','first','last','even','odd'].includes(key))continue;
          try{const value=context[key];if(value!==undefined)locals[name]=JSON.stringify(safeValue(value)).slice(0,500);}catch{ /* Scope metadata is optional. */ }
        }
      }
      if(block&&!ownerMatches)reason='The declaring component could not be identified. Rendered values are still shown.';
    }catch{reason='Angular scope is unavailable for this element; rendered values are still shown.';}
    const attributes=Array.from(element.attributes).filter(attribute=>!attribute.name.startsWith('data-lab-')&&!attribute.name.startsWith('_ng')).slice(0,16).map(attribute=>({name:attribute.name.slice(0,80),value:attribute.value.slice(0,300)}));
    if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement||element instanceof HTMLSelectElement)attributes.push({name:'current value',value:element.value.slice(0,300)});
    return {blockId:block?.id||null,component:block?.component||'Unmapped component',tag:block?.tag||element.tagName.toLowerCase(),text:clean(element.textContent||'',700),attributes,values,locals,pinned:this.pinned,origin,
      ...(block?{instanceIndex:instances.indexOf(element)+1,instanceCount:instances.length}:{}),lastDomChange:this.domChanges.get(element),...(reason?{reason}:{})};
  }
  refresh(){
    if(!this.selectedId&&!this.selected)return;
    const instances=this.selectedId?this.instances(this.selectedId):[];
    if(this.followSource && (!this.selected||!this.mount.contains(this.selected)))this.selected=instances[this.requestedIndex-1]??null;
    this.position();
    this.send('learning:inspect',{selection:this.selection(instances)});
  }
  initial(state:Record<string,string>){this.activity('initial','Initial component state',state);}
  rendered(changes:InspectionChange[],records:MutationRecord[],angularRendered=false,state:Record<string,string>={}){
    const domChanges:RecordedDomChange[]=[];
    let domChangeCount=0;
    const seen=new Map<Node,Set<string>>();
    const blockIds=new Set<string|null>();
    for(const record of records){
      const target=record.target;
      const element=target instanceof Element?target:target.parentElement;
      if(!element||!this.mount.contains(element))continue;
      const change=domChange(record,element,seen);
      if(!change)continue;
      this.domChanges.set(element,change);
      const id=element.getAttribute('data-lab-node');
      const blockId=id&&this.blocks.has(id)?id:null;
      blockIds.add(blockId);
      domChangeCount++;
      if(domChanges.length<20)domChanges.push({...change,tag:element.localName,blockId});
    }
    this.refresh();
    if(angularRendered||records.length){
      const phase=angularRendered?'Angular render pass completed':'Preview DOM changed';
      this.activity('render',phase,state,{changes,domChanges,domChangeCount,blockId:blockIds.size===1?[...blockIds][0]:null});
    }else if(changes.length){
      this.activity('state','Component values changed',state,{changes});
    }
  }
  private activity(kind:InspectionActivity['kind'],phase:string,state:Record<string,string>,
    details:Partial<Pick<InspectionActivity,'blockId'|'handler'|'eventName'|'changes'|'domChanges'|'domChangeCount'>>={}){
    const activity:InspectionActivity={
      id:++this.serial,kind,phase,at:Date.now(),state,eventName:'',handler:'',blockId:null,changes:[],domChanges:[],domChangeCount:0,...details,
    };
    this.send('learning:activity',{activity});
  }
}
