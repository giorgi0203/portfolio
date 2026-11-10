/** Explanations describe emitted Angular instructions, never a simulated execution trace. */
export type CompilerPhase = 'creation' | 'update' | 'definition' | 'event' | 'helper';
export interface SourceMatch {startLine:number;endLine:number;startColumn:number;endColumn:number;start:number;end:number;reason:string;approximate:true;}
export interface CompilerInstruction {
  id:string;name:string;line:number;endLine:number;raw:string;phase:CompilerPhase;
  title:string;explanation:string;comment:string;bindings:string[];sourceMatch:SourceMatch|null;
}
export interface GeneratedLine {number:number;content:string;instructions:CompilerInstruction[];}
interface Description {title:string;explanation:string;comment:string;}
const descriptions:Record<string,Description>={
  defineComponent:{title:'Describe a component',explanation:'Angular records the selector, template function, dependencies, and binding counts in a component definition. This metadata tells the runtime how to create an instance and render its view.',comment:'Component metadata: the recipe Angular uses to render this component.'},
  defineDirective:{title:'Describe a directive',explanation:'This definition records a directive’s inputs, outputs, and behavior so Angular can attach it to matching elements.',comment:'Directive metadata and input/output wiring.'},
  domElementStart:{title:'Open a DOM element',explanation:'During view creation, Angular creates this element and makes it the current parent for the following instructions. The numeric index identifies a slot in this view, not a source-code line.',comment:'Create this element once for this view; following children belong inside it.'},
  elementStart:{title:'Open an element',explanation:'Angular creates an element at this view slot and resolves matching directives or child components. Following creation instructions add its children.',comment:'Create an element and attach matching directives/components.'},
  domElement:{title:'Create a DOM element',explanation:'Angular creates a leaf element without opening a nested child block. Its numeric index is a view slot.',comment:'Create a leaf DOM element in the current view.'},
  element:{title:'Create an element',explanation:'Angular creates this element and resolves matching directives or child components. A separate elementEnd instruction is unnecessary for this form.',comment:'Create an element without an open child block.'},
  domElementEnd:{title:'Close the element scope',explanation:'This ends the current element’s creation scope. Later elements become siblings rather than children of the element just closed.',comment:'Return to the parent element while building the view.'},
  elementEnd:{title:'Close the element scope',explanation:'Angular returns to the parent creation scope. This is a rendering instruction, not an HTML string operation.',comment:'Finish the current element’s children.'},
  text:{title:'Create a text node',explanation:'Angular creates a text-node slot. A literal may initialize it now; an interpolation instruction can update the same slot later.',comment:'Create a text node once; bindings may update its contents later.'},
  advance:{title:'Move to a view slot',explanation:'Angular moves the selected binding target forward before applying the next update. The number counts view slots; it is not a delay or a source line.',comment:'Select the view slot that the following update should target.'},
  listener:{title:'Connect a browser event',explanation:'Angular registers this event handler when the view is created. The function body runs when the event fires; hovering in the inspector does not call it.',comment:'Register the event handler now; execute its body only on that event.'},
  twoWayListener:{title:'Listen for the other half of two-way binding',explanation:'Angular listens for an output or change event and writes the new value back to component state. This complements the value sent to the control.',comment:'Write control changes back to the bound state.'},
  twoWayBindingSet:{title:'Write a two-way bound value',explanation:'This helper writes a value through a writable signal when possible. Generated code may fall back to a regular assignment for a plain property.',comment:'Update writable signal state, or use the generated assignment fallback.'},
  property:{title:'Update a property or input',explanation:'Angular evaluates this binding during an update and applies a changed value to the element property or directive/component input. Property updates differ from string attributes.',comment:'Evaluate this binding and update the property/input when it changes.'},
  twoWayProperty:{title:'Send state to a two-way bound control',explanation:'This sends the current component value into a control. The companion listener handles values coming back from the control.',comment:'Send the current state into the two-way bound input.'},
  attribute:{title:'Update an HTML attribute',explanation:'Angular updates the string attribute named here. Unlike a property binding, a null value generally removes the attribute.',comment:'Apply the current value to an HTML attribute.'},
  conditional:{title:'Choose a conditional view',explanation:'Angular evaluates which conditional branch should be displayed and creates or removes the corresponding embedded view. A selected template index of -1 means no branch is shown.',comment:'Keep the selected @if/@else view and remove the inactive view.'},
  conditionalCreate:{title:'Prepare a conditional view',explanation:'Angular declares a conditional embedded view that can be selected later during an update. Creating the declaration does not mean every branch is displayed.',comment:'Declare an @if branch that an update can choose later.'},
  template:{title:'Declare an embedded template',explanation:'Angular registers a template function for an embedded view. Structural directives or control-flow instructions decide when instances of it appear.',comment:'Register a reusable embedded-view template.'},
  repeaterCreate:{title:'Prepare a tracked list',explanation:'Angular sets up the item template and tracking function for @for. Tracking identifies which rendered views belong to which items when the collection changes.',comment:'Set up the @for item template and its identity/track function.'},
  repeater:{title:'Reconcile a list',explanation:'Angular compares the current collection with tracked item identities, then reuses, moves, creates, or removes item views as needed. Each repeated item has its own view context.',comment:'Reconcile collection items with their tracked views.'},
  repeaterTrackByIdentity:{title:'Track an item by identity',explanation:'This built-in tracking function uses the item itself as its identity. A custom track expression can instead use a stable field such as item.id.',comment:'Use the item identity as this repeated view’s tracking key.'},
  repeaterTrackByIndex:{title:'Track an item by position',explanation:'This built-in tracking function uses the item index. Reordering then associates identity with positions rather than a stable item field.',comment:'Use the item index as the repeated view’s identity.'},
  nextContext:{title:'Read an enclosing view’s context',explanation:'An embedded view can use this helper to reach the state of its parent view. This is why list-item or conditional templates can still read parent component values.',comment:'Get the enclosing view’s component or template context.'},
  getCurrentView:{title:'Capture the current view',explanation:'Angular captures the current view so an event handler can restore the correct rendering context when it runs later.',comment:'Remember which view owns this later event callback.'},
  restoreView:{title:'Restore a handler’s view context',explanation:'An event handler restores its owning view before reading template locals or parent state.',comment:'Restore the view context for this event callback.'},
  resetView:{title:'Finish a handler’s view context',explanation:'After a generated event handler finishes, Angular restores the surrounding view state and returns the handler result.',comment:'Finish the generated handler and restore its surrounding view.'},
  setClassMetadata:{title:'Keep development metadata',explanation:'Angular keeps decorator metadata for development tools and debugging. This is different from the live DOM update instructions.',comment:'Development/debugging metadata, separate from template updates.'},
  setClassDebugInfo:{title:'Keep source debugging metadata',explanation:'This records source/debugging information about the class. It helps development tools identify a component; it does not update a binding.',comment:'Attach development source information to the component.'},
};
function describe(name:string):Description {
  const original=name.replace(/^ɵɵ?/,'');
  const key=({domListener:'listener',domProperty:'property',domTemplate:'template'} as Record<string,string>)[original]||original;
  if(/^textInterpolate/.test(key))return {title:'Update interpolated text',explanation:'Angular evaluates the expressions in this interpolation during an update. It compares binding values and updates the selected text node when a value changes. Static text fragments stay part of the same interpolation.',comment:'Evaluate {{ … }} expressions and update this text node if values changed.'};
  if(/^propertyInterpolate/.test(key))return {title:'Interpolate a property',explanation:'Angular joins static text with current expression values, then writes the result to the selected property or input.',comment:'Build an interpolated property value from the current bindings.'};
  if(/^classProp|^classMap/.test(key))return {title:'Update CSS classes',explanation:'Angular applies the current class binding to the selected element. This controls presentation rather than creating another element.',comment:'Update the element’s bound CSS classes.'};
  if(/^styleProp|^styleMap/.test(key))return {title:'Update inline styles',explanation:'Angular applies current style values to the selected element. Values can include a compiled unit or sanitizer helper.',comment:'Update the selected element’s bound styles.'};
  if(/^pipeBind/.test(key))return {title:'Evaluate a pipe binding',explanation:'Angular passes current expression values through a pipe. Pure pipes can reuse their prior result when their inputs have not changed.',comment:'Evaluate the pipe for the current binding inputs.'};
  return descriptions[key]||{title:'Angular rendering helper',explanation:'This is an instruction found in the actual compiler output. Its exact behavior depends on its arguments and the surrounding template function; this explorer does not invent a runtime value for it.',comment:'Angular helper emitted by the compiler; inspect its arguments and surrounding function.'};
}

/** Mask literals/comments without changing offsets; generated instruction text in strings is not executable code. */
function maskJavaScript(source:string):string {
  const chars=source.split('');let index=0;
  while(index<source.length){
    const quote=source[index];
    if(quote==='"'||quote==="'"||quote==='`'){
      chars[index]=' ';index++;
      while(index<source.length){const char=source[index];if(char!=='\n')chars[index]=' ';if(char==='\\'){index++;if(index<source.length&&source[index]!=='\n')chars[index]=' ';index++;continue;}index++;if(char===quote)break;}
    }else if(source.slice(index,index+2)==='//'){
      while(index<source.length&&source[index]!=='\n')chars[index++]=' ';
    }else if(source.slice(index,index+2)==='/*'){
      chars[index++]=' ';chars[index++]=' ';
      while(index<source.length){if(source.slice(index,index+2)==='*/'){chars[index++]=' ';chars[index++]=' ';break;}if(source[index]!=='\n')chars[index]=' ';index++;}
    }else if(quote==='/'&&regexMayStart(source,index)){
      let cursor=index+1,characterClass=false,closed=false;
      while(cursor<source.length&&source[cursor]!=='\n'){
        const char=source[cursor];if(char==='\\'){cursor+=2;continue;}
        if(char==='[')characterClass=true;else if(char===']')characterClass=false;
        else if(char==='/'&&!characterClass){cursor++;while(/[a-z]/i.test(source[cursor]||''))cursor++;closed=true;break;}
        cursor++;
      }
      if(closed){while(index<cursor){if(source[index]!=='\n')chars[index]=' ';index++;}}else index++;
    }else index++;
  }
  return chars.join('');
}
function regexMayStart(source:string,index:number):boolean {
  const before=source.slice(0,index).trimEnd();
  if(!before||/[=([{,:;!?&|+\-*%^~<>]/.test(before[before.length-1])||/\b(?:return|throw|case|yield|await)\s*$/.test(before))return true;
  if(before.endsWith(')')){
    let depth=0;for(let cursor=before.length-1;cursor>=0;cursor--){if(before[cursor]===')')depth++;else if(before[cursor]==='('&&--depth===0)return /\b(?:if|while|for|with)\s*$/.test(before.slice(0,cursor));}
  }
  return false;
}
function closeBracket(mask:string,start:number,open:string,close:string):number {let depth=0;for(let i=start;i<mask.length;i++){if(mask[i]===open)depth++;if(mask[i]===close&&--depth===0)return i;}return mask.length-1;}
function sourceLine(source:string,index:number){return source.slice(0,index).split('\n').length;}
function matchSource(raw:string,name:string,source:string,bindings:string[]):SourceMatch|null {
  const key=name.replace(/^ɵɵ?/,'');
  let index=-1,end=-1,reason='';
  const interpolation=/\{\{([\s\S]*?)\}\}/g;
  if(/Interpolate/.test(key))for(const match of source.matchAll(interpolation)){
    if(bindings.some(binding=>new RegExp('\\b'+binding.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(match[1]))){index=(match.index??0);end=index+match[0].length;reason='An interpolation references the same component field as this emitted instruction.';break;}
  }
  if(index<0&&/listener/i.test(key)){
    const event=raw.match(/\(\s*(['"])([^'"]+)\1/);const attribute=/\([^)]*\)\s*=\s*(["'])([\s\S]*?)\1/g;
    for(const match of source.matchAll(attribute))if((event&&match[0].includes('('+event[2]+')'))||bindings.some(binding=>match[2].includes(binding))){index=(match.index??0);end=index+match[0].length;reason='The template event or handler name matches this generated listener.';break;}
  }
  if(index<0&&/property|attribute|class|style/i.test(key)){
    const attribute=/\[\(?[^\]]+\)?\]\s*=\s*(["'])([\s\S]*?)\1/g;
    for(const match of source.matchAll(attribute))if(bindings.some(binding=>new RegExp('\\b'+binding+'\\b').test(match[2]))){index=(match.index??0);end=index+match[0].length;reason='A template binding references the same component field.';break;}
  }
  if(index<0&&/conditional/.test(key)){const match=/@if\s*\(|\*ngIf\s*=/.exec(source);if(match){index=match.index;end=index+match[0].length;reason='This source contains a conditional template block.';}}
  if(index<0&&/repeater/.test(key)){const match=/@for\s*\(|\*ngFor\s*=/.exec(source);if(match){index=match.index;end=index+match[0].length;reason='This source contains a repeated template block.';}}
  if(index<0&&/^(?:dom)?element(?:Start)?$/i.test(key)){
    const tag=raw.match(/\(\s*\d+\s*,\s*(['"])([\w-]+)\1/);
    if(tag){const match=new RegExp('<'+tag[2]+'(?=[\\s>])','i').exec(source);if(match){index=match.index;end=source.indexOf('>',index)+1;reason='An element tag in the template matches this creation instruction. Repeated tags may have several matches.';}}
  }
  if(index<0)return null;
  return {startLine:sourceLine(source,index),endLine:sourceLine(source,Math.max(index,end)),startColumn:index-source.lastIndexOf('\n',index-1),endColumn:Math.max(index,end)-source.lastIndexOf('\n',Math.max(index,end)-1),start:index,end:Math.max(index,end),reason,approximate:true};
}
export function parseCompilerInstructions(code:string,source:string,path='component.js'):CompilerInstruction[]{
  const mask=maskJavaScript(code),ranges:Array<{start:number;end:number;phase:CompilerPhase}>=[];
  for(const match of mask.matchAll(/\bif\s*\(\s*[\w$]+\s*&\s*([12])\s*\)\s*\{/g)){
    const start=(match.index??0)+match[0].lastIndexOf('{');ranges.push({start,end:closeBracket(mask,start,'{','}'),phase:match[1]==='1'?'creation':'update'});
  }
  const eventBodies:Array<{start:number;end:number}>=[];
  for(const match of mask.matchAll(/ɵɵ(?:domListener|listener|twoWayListener)\s*\(/g)){
    const open=(match.index??0)+match[0].lastIndexOf('('),end=closeBracket(mask,open,'(',')');
    const callback=/\bfunction\b[^{}]*\{|=>\s*\{/.exec(mask.slice(open,end));
    if(callback){const start=open+callback.index+callback[0].lastIndexOf('{');eventBodies.push({start,end:closeBracket(mask,start,'{','}')});}
  }
  const instructions:CompilerInstruction[]=[];
  for(const match of mask.matchAll(/(?<![\w$])(ɵɵ?[A-Za-z_$][\w$]*)\s*\(/g)){
    const start=(match.index??0),open=start+match[0].lastIndexOf('('),end=closeBracket(mask,open,'(',')');
    const name=match[1],raw=code.slice(start,end+1),description=describe(name);
    const enclosing=ranges.filter(range=>range.start<start&&range.end>end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    const phase:CompilerPhase=eventBodies.some(body=>body.start<start&&body.end>end)?'event':enclosing?.phase||(/define|setClass/i.test(name)?'definition':'helper');
    const bindings=[...new Set([...raw.matchAll(/\bctx(?:_r\d+)?\.([A-Za-z_$][\w$]*)/g)].map(value=>value[1]))].slice(0,12);
    instructions.push({id:path+':'+start,name,line:sourceLine(code,start),endLine:sourceLine(code,end),raw,phase,...description,bindings,sourceMatch:matchSource(raw,name,source,bindings)});
    if(instructions.length>=500)break;
  }
  return instructions;
}
export function generatedLines(code:string,instructions:CompilerInstruction[]):GeneratedLine[]{return code.split('\n').slice(0,1800).map((content,index)=>({number:index+1,content,instructions:instructions.filter(instruction=>instruction.line===index+1)}));}
