import https from 'node:https';
import tls from 'node:tls';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

export const SERVICES=Object.freeze([
  {host:'giorgi.app',name:'Portfolio',description:'The home of all these little experiments.',path:'/'},
  {host:'smart-todolist.giorgi.app',name:'Smart Todo',description:'Projects, tasks, and an AI sidekick.',path:'/'},
  {host:'auth.giorgi.app',name:'Giorgi Account',description:'Shared sign-in and private analytics.',path:'/api/health'},
  {host:'hls-player.giorgi.app',name:'HLS Inspector',description:'Streaming playback and diagnostics.',path:'/'},
  {host:'angular-compiler.giorgi.app',name:'Angular Learning Lab',description:'A place to learn by changing real components.',path:'/health'},
  {host:'toolbox.giorgi.app',name:'Developer Toolbox',description:'Small browser tools for everyday development.',path:'/'},
  {host:'status.giorgi.app',name:'Site Health',description:'The monitor keeping an eye on these apps.',path:'/health'},
  {host:'api.giorgi.app',name:'Portfolio API',description:'The project catalog behind the experiments.',path:'/api/health'},
]);
const DAY=86400000,RETENTION=7*DAY,MAX_SAMPLES=10080,MAX_INCIDENTS=200;
const ERRORS=new Set(['ok','http_error','timeout','dns_error','tls_error','connection_error','invalid_certificate','probe_error']);
export function publicError(code){return ({http_error:'The service returned an unsuccessful HTTP status.',timeout:'The check exceeded its time limit.',dns_error:'The hostname could not be resolved.',tls_error:'The TLS connection could not be verified.',invalid_certificate:'The TLS certificate is invalid or expired.',connection_error:'The service did not accept the connection.',probe_error:'The check could not complete.'})[code]||null;}
function errorCode(error){
  if(error?.code==='ETIMEDOUT'||error?.code==='ABORT_ERR')return 'timeout';
  if(['ENOTFOUND','EAI_AGAIN'].includes(error?.code))return 'dns_error';
  if(['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error?.code))return 'invalid_certificate';
  if(String(error?.code||'').includes('TLS')||String(error?.code||'').includes('SSL'))return 'tls_error';
  return 'connection_error';
}

/** Internal probe only. HTTP callers cannot choose a hostname, port, path or CA. */
export async function probe(service,{timeoutMs=5000,now=Date.now,ca}={}){
  const started=performance.now();
  const hostname=service.host,port=service.port||443;
  try{
    const certificate=await new Promise((resolve,reject)=>{
      const socket=tls.connect({host:hostname,port,servername:hostname,rejectUnauthorized:true,...(ca?{ca}:{})});
      const timer=setTimeout(()=>socket.destroy(Object.assign(new Error('Timeout'),{code:'ETIMEDOUT'})),timeoutMs);
      socket.once('secureConnect',()=>{
        const cert=socket.getPeerCertificate();
        const expires=Date.parse(cert.valid_to),validFrom=Date.parse(cert.valid_from);
        clearTimeout(timer);socket.end();
        if(!Number.isFinite(expires)||!Number.isFinite(validFrom)||expires<=now()||validFrom>now())reject(Object.assign(new Error('Certificate invalid'),{code:'CERT_HAS_EXPIRED'}));
        else resolve({expiresAt:expires});
      });
      socket.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    const remaining=Math.max(1,timeoutMs-(performance.now()-started));
    const httpStarted=performance.now();
    const status=await new Promise((resolve,reject)=>{
      const request=https.request({hostname,port,path:service.path||'/',method:'GET',servername:hostname,rejectUnauthorized:true,...(ca?{ca}:{}),headers:{'User-Agent':'Giorgi-Status/1.0',Accept:'text/html, application/json'},agent:false},response=>{
        clearTimeout(timer);resolve(response.statusCode||0);response.destroy();
      });
      const timer=setTimeout(()=>request.destroy(Object.assign(new Error('Timeout'),{code:'ETIMEDOUT'})),remaining);
      request.once('error',error=>{clearTimeout(timer);reject(error);});request.end();
    });
    return {available:status>=200&&status<400,latencyMs:Math.round(performance.now()-httpStarted),httpStatus:status,tlsExpiresAt:certificate.expiresAt,error:status>=200&&status<400?'ok':'http_error'};
  }catch(error){return {available:false,latencyMs:null,httpStatus:null,tlsExpiresAt:null,error:errorCode(error)};}
}

function state(sample,now){
  if(!sample)return 'unknown';
  if(!sample[1])return 'down';
  if(sample[2]>2000||(sample[4]&&sample[4]-now<=14*DAY))return 'degraded';
  return 'up';
}
function validSample(row,now){
  return Array.isArray(row)&&row.length===6&&Number.isFinite(row[0])&&row[0]>=now-RETENTION&&row[0]<=now+5000&&[0,1].includes(row[1])&&(row[2]===null||(Number.isFinite(row[2])&&row[2]>=0&&row[2]<=60000))&&(row[3]===null||(Number.isInteger(row[3])&&row[3]>=100&&row[3]<=599))&&(row[4]===null||Number.isFinite(row[4]))&&ERRORS.has(row[5]);
}
function summary(samples,since){const selected=samples.filter(row=>row[0]>=since),up=selected.filter(row=>row[1]).length,latencies=selected.filter(row=>row[1]&&row[2]!==null).map(row=>row[2]);return {checks:selected.length,availableChecks:up,uptime:selected.length?Number((up/selected.length*100).toFixed(2)):null,averageMs:latencies.length?Math.round(latencies.reduce((sum,n)=>sum+n,0)/latencies.length):null};}
function buckets(samples,now,range){
  const count=96,width=range/count,start=now-range;
  const bins=Array.from({length:count},(_,index)=>({at:Math.round(start+index*width),checks:0,up:0,total:0,timed:0}));
  for(const row of samples){const index=Math.min(count-1,Math.floor((row[0]-start)/width));if(index<0||row[0]>now)continue;const bin=bins[index];bin.checks++;bin.up+=row[1];if(row[1]&&row[2]!==null){bin.total+=row[2];bin.timed++;}}
  return bins.map(bin=>({at:bin.at,checks:bin.checks,availableChecks:bin.up,averageMs:bin.timed?Math.round(bin.total/bin.timed):null}));
}

export class Monitor{
  constructor({dataDir,services=SERVICES,check=probe,now=Date.now,intervalMs=60000,release=''}={}){
    this.dataDir=dataDir;this.services=services;this.check=check;this.now=now;this.intervalMs=intervalMs;this.release=/^[a-f0-9]{7,40}$/i.test(release)?release.slice(0,12):null;
    this.samples=Object.fromEntries(services.map(service=>[service.host,[]]));this.incidents=[];this.running=false;this.lastCycleAt=null;this.nextCheckAt=null;this.persistenceAvailable=true;
  }
  async load(){
    if(!this.dataDir)return;
    try{
      const file=path.join(this.dataDir,'history.json');
      const info=JSON.parse(await readFile(file,'utf8'));
      if(info.version!==1)throw new Error('Unsupported history');
      for(const service of this.services){const rows=info.samples?.[service.host];if(Array.isArray(rows))this.samples[service.host]=rows.filter(row=>validSample(row,this.now())).sort((a,b)=>a[0]-b[0]).slice(-MAX_SAMPLES);}
      const hosts=new Set(this.services.map(service=>service.host));
      if(Array.isArray(info.incidents))this.incidents=info.incidents.filter(item=>item&&hosts.has(item.host)&&['down','degraded'].includes(item.kind)&&Number.isFinite(item.startedAt)&&item.startedAt>=0&&item.startedAt<=this.now()+5000&&(item.resolvedAt===null||(Number.isFinite(item.resolvedAt)&&item.resolvedAt>=item.startedAt&&item.resolvedAt>=this.now()-RETENTION&&item.resolvedAt<=this.now()+5000))&&typeof item.id==='string'&&item.id.length<120).slice(-MAX_INCIDENTS).map(item=>({id:item.id,host:item.host,kind:item.kind,startedAt:item.startedAt,resolvedAt:item.resolvedAt,error:ERRORS.has(item.error)?item.error:'probe_error'}));
    }catch(error){if(error.code!=='ENOENT'){this.persistenceAvailable=false;console.error('Health history could not be loaded; starting fresh.');}}
  }
  async save(){
    if(!this.dataDir)return;
    try{await mkdir(this.dataDir,{recursive:true,mode:0o700});const next=path.join(this.dataDir,'history.next');await writeFile(next,JSON.stringify({version:1,samples:this.samples,incidents:this.incidents}),{mode:0o600});await rename(next,path.join(this.dataDir,'history.json'));this.persistenceAvailable=true;}
    catch{this.persistenceAvailable=false;console.error('Health history could not be persisted.');}
  }
  record(service,result){
    const at=this.now(),rows=this.samples[service.host],previous=state(rows.at(-1),at);
    const row=[at,result.available?1:0,Number.isFinite(result.latencyMs)?Math.min(60000,Math.max(0,Math.round(result.latencyMs))):null,Number.isInteger(result.httpStatus)&&result.httpStatus>=100&&result.httpStatus<=599?result.httpStatus:null,Number.isFinite(result.tlsExpiresAt)?result.tlsExpiresAt:null,ERRORS.has(result.error)?result.error:'probe_error'];
    rows.push(row);this.samples[service.host]=rows.filter(sample=>sample[0]>=at-RETENTION).slice(-MAX_SAMPLES);
    const current=state(row,at);
    if(current!==previous){
      for(const incident of this.incidents)if(incident.host===service.host&&incident.resolvedAt===null)incident.resolvedAt=at;
      if(['down','degraded'].includes(current))this.incidents.push({id:service.host+'-'+at,host:service.host,kind:current,startedAt:at,resolvedAt:null,error:row[5]});
    }
    this.incidents=this.incidents.filter(incident=>incident.resolvedAt===null||incident.resolvedAt>=at-RETENTION).slice(-MAX_INCIDENTS);
  }
  async cycle(){
    if(this.running)return false;
    this.running=true;const cycleStartedAt=this.now();this.nextCheckAt=cycleStartedAt+this.intervalMs;let index=0;
    const worker=async()=>{while(index<this.services.length){const service=this.services[index++];let result;try{result=await this.check(service);}catch{result={available:false,error:'probe_error'};}this.record(service,result);}};
    try{await Promise.all([worker(),worker()]);this.lastCycleAt=this.now();await this.save();return true;}
    finally{this.running=false;}
  }
  start(){void this.cycle();this.timer=setInterval(()=>void this.cycle(),this.intervalMs);this.timer.unref();}
  stop(){clearInterval(this.timer);}
  snapshot(){
    const now=this.now();
    return {generatedAt:now,intervalSeconds:this.intervalMs/1000,lastCycleAt:this.lastCycleAt,nextCheckAt:this.nextCheckAt,checking:this.running,historyPersistent:this.persistenceAvailable,release:this.release,services:this.services.map(service=>{
      const rows=this.samples[service.host],last=rows.at(-1),status=state(last,now);
      return {host:service.host,name:service.name,description:service.description,status,lastCheckedAt:last?.[0]||null,stale:!last||now-last[0]>this.intervalMs*2.5,httpStatus:last?.[3]||null,latencyMs:last?.[2]??null,tlsExpiresAt:last?.[4]||null,tlsDaysRemaining:last?.[4]?Math.floor((last[4]-now)/DAY):null,message:last?publicError(last[5]):null,day:summary(rows,now-DAY),week:summary(rows,now-RETENTION),recent:rows.slice(-48).map(row=>({at:row[0],available:!!row[1],latencyMs:row[2]})),historyDay:buckets(rows,now,DAY),historyWeek:buckets(rows,now,RETENTION)};
    }),incidents:this.incidents.slice().reverse().map(incident=>({...incident,message:publicError(incident.error)}))};
  }
}
