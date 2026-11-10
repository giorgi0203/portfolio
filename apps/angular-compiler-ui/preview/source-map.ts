import * as ts from 'typescript';
import {parseTemplate,TmplAstElement,TmplAstBoundText,TmplAstForLoopBlock,TmplAstIfBlockBranch,TmplAstSwitchBlockCase,TmplAstTemplate} from '@angular/compiler';
import type {InspectionBinding, InspectionBlock} from '../src/app/inspection-types';

type Span={start:{offset:number};end:{offset:number}};
type Expression={source?:string;name?:string;value?:string};
type TemplateNode={name?:string;tagName?:string;sourceSpan?:Span;startSourceSpan?:Span;children?:TemplateNode[];branches?:TemplateNode[];cases?:TemplateNode[];empty?:TemplateNode;placeholder?:TemplateNode;loading?:TemplateNode;error?:TemplateNode;expression?:Expression;item?:{name:string};contextVariables?:Array<{name:string;value:string}>;variables?:Array<{name:string;value:string}>;attributes?:unknown[];inputs?:Array<{name:string;value:Expression;type?:number}>;outputs?:Array<{name:string;handler:Expression;type?:number}>;value?:Expression};
export interface MappedBlock extends InspectionBlock {localNames:Record<string,string>;outerLocalsOmitted?:boolean}
export interface InstrumentedSource {source:string;blocks:MappedBlock[];truncated:boolean;unmappedComponents:string[]}

/** Decode a TS string literal while retaining an exact cooked-index -> original source index map. */
function literalOffsets(raw:string,start:number,text:string):number[]|null {
  const offsets:number[]=[];let decoded='';
  const append=(value:string,index:number)=>{decoded+=value;for(let p=0;p<value.length;p++)offsets.push(start+index);};
  for(let index=0;index<raw.length;){
    const at=index;let char=raw[index++];
    if(char==='\\'){
      const escaped=raw[index++];
      if(escaped==='\n')continue;
      if(escaped==='\r'){if(raw[index]==='\n')index++;continue;}
      if(escaped==='u'){
        if(raw[index]==='{'){const end=raw.indexOf('}',index);if(end<0)return null;const code=Number.parseInt(raw.slice(index+1,end),16);if(!Number.isFinite(code)||code>0x10ffff)return null;char=String.fromCodePoint(code);index=end+1;}
        else{const digits=raw.slice(index,index+4);if(!/^[\da-f]{4}$/i.test(digits))return null;char=String.fromCharCode(Number.parseInt(digits,16));index+=4;}
      }else if(escaped==='x'){const digits=raw.slice(index,index+2);if(!/^[\da-f]{2}$/i.test(digits))return null;char=String.fromCharCode(Number.parseInt(digits,16));index+=2;}
      else{const escapes:Record<string,string>={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'};char=escapes[escaped]??escaped;}
    }else if(char==='\r'){if(raw[index]==='\n')index++;char='\n';}
    append(char,at);
  }
  offsets.push(start+raw.length);
  return decoded===text?offsets:null;
}

export function instrumentSource(source:string):InstrumentedSource {
  const file=ts.createSourceFile('demo.component.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const componentNames=new Set<string>(),namespaceNames=new Set<string>();
  for(const statement of file.statements){
    if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.moduleSpecifier.text!=='@angular/core')continue;
    const bindings=statement.importClause?.namedBindings;
    if(bindings&&ts.isNamespaceImport(bindings))namespaceNames.add(bindings.name.text);
    if(bindings&&ts.isNamedImports(bindings))for(const binding of bindings.elements)if((binding.propertyName?.text||binding.name.text)==='Component')componentNames.add(binding.name.text);
  }
  const blocks:MappedBlock[]=[],edits:Array<{start:number;end:number;text:string}>=[],unmappedComponents:string[]=[];
  let componentIndex=0,truncated=false,budget=0;
  const visit=(node:ts.Node)=>{
    if(ts.isClassDeclaration(node)){
      const component=node.name?.text||'Anonymous component';
      for(const decorator of ts.canHaveDecorators(node)?ts.getDecorators(node)||[]:[]){
        if(!ts.isCallExpression(decorator.expression))continue;
        const called=decorator.expression.expression;
        const angularComponent=ts.isIdentifier(called)?componentNames.has(called.text):ts.isPropertyAccessExpression(called)&&ts.isIdentifier(called.expression)&&namespaceNames.has(called.expression.text)&&called.name.text==='Component';
        if(!angularComponent)continue;
        const object=decorator.expression.arguments[0];if(!object||!ts.isObjectLiteralExpression(object))continue;
        const template=object.properties.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(file).replace(/['"]/g,'')==='template');
        if(!template||!ts.isPropertyAssignment(template))continue;
        const literal=template.initializer,componentId=componentIndex++;
        if(!ts.isStringLiteral(literal)&&!ts.isNoSubstitutionTemplateLiteral(literal)){unmappedComponents.push(component);continue;}
        const rawStart=literal.getStart(file)+1,rawEnd=literal.getEnd()-1;
        const positions=literalOffsets(source.slice(rawStart,rawEnd),rawStart,literal.text);
        if(!positions){unmappedComponents.push(component);continue;}
        const parsed=parseTemplate(literal.text,component,{preserveWhitespaces:true});
        if(parsed.errors?.length){unmappedComponents.push(component);continue;}
        const insertions:Array<{at:number;text:string}>=[];let nodeIndex=0;
        const walk=(nodes:TemplateNode[],controls:string[],locals:Record<string,string>,depth=0)=>{
          for(const child of nodes){
            const kind=child instanceof TmplAstElement?'Element':child instanceof TmplAstForLoopBlock?'ForLoopBlock':child instanceof TmplAstIfBlockBranch?'IfBlockBranch':child instanceof TmplAstSwitchBlockCase?'SwitchBlockCase':child instanceof TmplAstTemplate?'Template':'';let nextControls=controls,nextLocals=locals,nextDepth=depth;
            if(kind==='ForLoopBlock'){
              const expression=child.expression?.source||'';
              nextControls=[...controls,`@for (${child.item?.name||'item'} of ${expression})`.slice(0,220)];
              nextLocals=child.item?{[child.item.name]:'$implicit'}:{};nextDepth=depth+1;
              for(const variable of child.contextVariables||[])nextLocals[variable.name]=variable.value;
            }else if(kind==='IfBlockBranch')nextControls=[...controls,child.expression?.source?`@if (${child.expression.source})`.slice(0,220):'@else'];
            else if(kind==='SwitchBlockCase')nextControls=[...controls,`@case (${child.expression?.source||'default'})`.slice(0,220)];
            else if(kind==='Template'&&child.variables){
              nextLocals=child.variables.length?{}:locals;if(child.variables.length)nextDepth=depth+1;for(const variable of child.variables)nextLocals[variable.name]=variable.value;
              const header=child.startSourceSpan?literal.text.slice(child.startSourceSpan.start.offset,child.startSourceSpan.end.offset):'';
              const structural=header.match(/\*[\w]+\s*=\s*(["'])(.*?)\1/);if(structural)nextControls=[...controls,structural[0].slice(0,220)];
            }
            if(kind==='Element'&&child.name&&child.sourceSpan&&child.startSourceSpan&&!['ng-container','ng-template','ng-content'].includes(child.name)){
              const start=positions[child.sourceSpan.start.offset],end=positions[child.sourceSpan.end.offset];
              const first=file.getLineAndCharacterOfPosition(start),last=file.getLineAndCharacterOfPosition(end);
              const bindings:InspectionBinding[]=[];
              for(const input of child.inputs||[])bindings.push({kind:'property',name:input.name,expression:String(input.value?.source||'').slice(0,400)});
              for(const output of child.outputs||[])bindings.push({kind:output.name.endsWith('Change')?'two-way':'event',name:output.name,expression:String(output.handler?.source||'').slice(0,400)});
              for(const content of child.children||[])if(content instanceof TmplAstBoundText)bindings.push({kind:'text',name:'text',expression:String(content.value?.source||'').slice(0,400)});
              const block:MappedBlock={id:`lab-${componentId}-${nodeIndex++}`,component,tag:child.name,start,end,startLine:first.line+1,endLine:last.line+1,startColumn:first.character+1,endColumn:last.character+1,source:source.slice(start,end).slice(0,1200),bindings:bindings.slice(0,16),controls:nextControls.slice(-6),localNames:nextLocals,outerLocalsOmitted:nextDepth>1};
              const size=JSON.stringify(block).length;
              if(blocks.length>=180||budget+size>220000){truncated=true;}else{
                blocks.push(block);budget+=size;
                const opening=child.startSourceSpan.start.offset;
                const tag=literal.text.slice(opening).match(/^<[^\s/>]+/);
                if(tag)insertions.push({at:opening+tag[0].length,text:` data-lab-node="${block.id}"`});
              }
            }
            if(child.children)walk(child.children,nextControls,nextLocals,nextDepth);
            if(child.branches)walk(child.branches,nextControls,nextLocals,nextDepth);
            if(child.cases)walk(child.cases,nextControls,nextLocals,nextDepth);
            if(child.empty)walk([child.empty],[...nextControls,'@empty'],locals,depth);
            for(const branch of [child.placeholder,child.loading,child.error])if(branch)walk([branch],nextControls,nextLocals,nextDepth);
          }
        };
        walk(parsed.nodes as unknown as TemplateNode[],[],{});
        let instrumented=literal.text;
        for(const insertion of insertions.sort((a,b)=>b.at-a.at))instrumented=instrumented.slice(0,insertion.at)+insertion.text+instrumented.slice(insertion.at);
        edits.push({start:literal.getStart(file),end:literal.getEnd(),text:JSON.stringify(instrumented)});
      }
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
  let instrumented=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))instrumented=instrumented.slice(0,edit.start)+edit.text+instrumented.slice(edit.end);
  return {source:instrumented,blocks,truncated,unmappedComponents};
}
