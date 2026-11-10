export function parseJson(text:string):unknown {
 try{return JSON.parse(text,(_key,value)=>{if(typeof value==='number'&&(!Number.isFinite(value)||(Number.isInteger(value)&&!Number.isSafeInteger(value))))throw new Error('This JSON contains a number JavaScript cannot preserve safely. Quote large IDs or numeric values to retain their digits.');return value;});}catch(error){throw new Error(error instanceof Error?error.message:'Invalid JSON');}
}
export function formatJson(text:string,minify=false):string{return JSON.stringify(parseJson(text),null,minify?undefined:2);}
export interface Change {path:string;kind:'added'|'removed'|'changed';before?:unknown;after?:unknown;}
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object';
export function diffJson(before:unknown,after:unknown,path='$'):Change[]{
 if(Object.is(before,after))return [];
 if(object(before)&&object(after)&&Array.isArray(before)===Array.isArray(after)){
  const keys=new Set([...Object.keys(before),...Object.keys(after)]),changes:Change[]=[];
  for(const key of keys){const next=Array.isArray(before)?`${path}[${key}]`:`${path}[${JSON.stringify(key)}]`;
   if(!Object.prototype.hasOwnProperty.call(after,key))changes.push({path:next,kind:'removed',before:before[key]});
   else if(!Object.prototype.hasOwnProperty.call(before,key))changes.push({path:next,kind:'added',after:after[key]});
   else changes.push(...diffJson(before[key],after[key],next));
  }return changes;
 }return [{path,kind:'changed',before,after}];
}
type Shape = {kind:'unknown'|'null'|'string'|'number'|'boolean'} | {kind:'array';items:Shape} | {kind:'object';fields:Map<string,{type:Shape;optional:boolean}>} | {kind:'union';members:Shape[]};
function infer(value:unknown):Shape {
 if(value===null)return {kind:'null'};
 if(Array.isArray(value))return {kind:'array',items:value.length?value.map(infer).reduce(merge):{kind:'unknown'}};
 if(typeof value==='object')return {kind:'object',fields:new Map(Object.entries(value as Record<string,unknown>).map(([key,item])=>[key,{type:infer(item),optional:false}]))};
 return {kind:typeof value as 'string'|'number'|'boolean'};
}
function signature(shape:Shape):string{return render(shape,0);}
function merge(a:Shape,b:Shape):Shape {
 if(a.kind==='unknown')return b;if(b.kind==='unknown')return a;
 if(a.kind==='object'&&b.kind==='object'){
  const fields=new Map<string,{type:Shape;optional:boolean}>();
  for(const key of new Set([...a.fields.keys(),...b.fields.keys()])){
   const left=a.fields.get(key),right=b.fields.get(key),present=left||right;if(!present)continue;fields.set(key,{type:left&&right?merge(left.type,right.type):present.type,optional:!left||!right||!!left?.optional||!!right?.optional});
  }return {kind:'object',fields};
 }
 if(a.kind==='array'&&b.kind==='array')return {kind:'array',items:merge(a.items,b.items)};
 if(signature(a)===signature(b))return a;
 const members=[...(a.kind==='union'?a.members:[a]),...(b.kind==='union'?b.members:[b])],unique:Shape[]=[];
 for(const member of members)if(!unique.some(existing=>signature(existing)===signature(member)))unique.push(member);
 return {kind:'union',members:unique};
}
function render(shape:Shape,level:number):string {
 if(shape.kind==='array'){const item=render(shape.items,level);return shape.items.kind==='union'?`(${item})[]`:`${item}[]`;}
 if(shape.kind==='union')return shape.members.map(member=>render(member,level)).join(' | ');
 if(shape.kind==='object'){
  if(!shape.fields.size)return 'Record<string, unknown>';
  return '{\n'+[...shape.fields.entries()].map(([key,value])=>'  '.repeat(level+1)+(/^[A-Za-z_$][\w$]*$/.test(key)?key:JSON.stringify(key))+(value.optional?'?':'')+': '+render(value.type,level+1)+';').join('\n')+'\n'+'  '.repeat(level)+'}';
 }return shape.kind;
}
export function jsonToTypescript(text:string,name='Root'):string {
 if(!/^[A-Za-z_$][\w$]*$/.test(name)||['string','number','boolean','null','undefined','any','unknown','never','type','interface','class','export','default','function','const','let','var','new','return','import','extends','implements','public','private','static','true','false','this','void','object','symbol','bigint','keyof','typeof','readonly','enum','namespace','declare','await','yield','in','instanceof','if','else','break','case','catch','continue','debugger','delete','do','finally','for','switch','throw','try','while','with','super','package','protected','abstract','as','asserts','any','satisfies','infer','is','unique','using'].includes(name))throw new Error('Choose a TypeScript identifier such as Root or ApiResponse.');
 return `export type ${name} = ${render(infer(parseJson(text)),0)};\n`;
}
export function timestamp(input:string,unit:'seconds'|'milliseconds'|'auto'='auto'):{iso:string;seconds:number;milliseconds:number;utc:string;local:string}{
 const text=input.trim();if(!text)throw new Error('Enter an epoch timestamp or an ISO date.');let date:Date;
 if(/^[+-]?\d+(?:\.\d+)?$/.test(text)){const number=Number(text),milliseconds=unit==='seconds'?number*1000:unit==='milliseconds'?number:Math.abs(number)<1e11?number*1000:number;date=new Date(milliseconds);}
 else {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(text))throw new Error('Use an epoch number or an ISO date with an explicit timezone, e.g. 2026-11-10T12:00:00Z.');
  date=new Date(text);
  const part=text.match(/^(\d{4})-(\d\d)-(\d\d)/);if(!part)throw new Error('Invalid ISO date.');const year=+part[1],month=+part[2],day=+part[3];const days=new Date(Date.UTC(year,month,0)).getUTCDate();if(month<1||month>12||day<1||day>days)throw new Error('That calendar date does not exist.');
 }
 if(!Number.isFinite(date.getTime()))throw new Error('That timestamp is outside JavaScript’s supported date range.');
 return {iso:date.toISOString(),seconds:date.getTime()/1000,milliseconds:date.getTime(),utc:date.toUTCString(),local:date.toLocaleString()};
}
export function inspectUrl(text:string):URL {
 let url:URL;try{url=new URL(text);}catch{throw new Error('Enter a complete URL, including its scheme, e.g. https://example.com/path?q=hello.');}
 return url;
}
export function editQuery(text:string,pairs:[string,string][]):string{const url=inspectUrl(text);url.search='';for(const [key,value]of pairs)url.searchParams.append(key,value);return url.href;}
