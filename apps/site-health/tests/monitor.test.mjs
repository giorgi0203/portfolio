import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import https from 'node:https';
import {Monitor,probe,SERVICES} from '../server/monitor.mjs';
import {startServer} from '../server/server.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'giorgi-health-tests-'));
after(()=>rm(directory,{recursive:true,force:true}));
const service={host:'example.test',name:'Test',description:'Test service',path:'/health'};
const good={available:true,httpStatus:200,latencyMs:120,tlsExpiresAt:Date.now()+90*86400000,error:'ok'};

test('production targets are an exact first-party allowlist without retired MCP or user URLs',()=>{
  assert.equal(SERVICES.length,8);assert.ok(SERVICES.every(item=>item.host==='giorgi.app'||/^(smart-todolist|auth|hls-player|angular-compiler|toolbox|status|api)\.giorgi\.app$/.test(item.host)));assert.equal(SERVICES.find(item=>item.host==='status.giorgi.app').path,'/health');
});
test('unknown is not fabricated uptime; retained observations survive a restart',async()=>{
  let now=Date.now();const dataDir=path.join(directory,'history');const monitor=new Monitor({dataDir,services:[service],now:()=>now,check:async()=>good});
  assert.equal(monitor.snapshot().services[0].day.uptime,null);assert.equal(monitor.snapshot().services[0].status,'unknown');
  await monitor.cycle();assert.equal(monitor.snapshot().services[0].day.uptime,100);assert.equal(monitor.snapshot().services[0].day.checks,1);assert.equal(monitor.snapshot().services[0].historyDay.at(-1).checks,1);
  const restored=new Monitor({dataDir,services:[service],now:()=>now});await restored.load();assert.equal(restored.snapshot().services[0].day.checks,1);assert.equal(restored.snapshot().services[0].latencyMs,120);
  now+=8*86400000;assert.equal(restored.snapshot().services[0].week.checks,0);
});
test('records outage/recovery and warnings using actual samples, with separate day/week windows',async()=>{
  let now=Date.now();const monitor=new Monitor({services:[service],now:()=>now});
  monitor.record(service,good);now+=60000;monitor.record(service,{available:false,error:'timeout'});
  assert.equal(monitor.snapshot().services[0].status,'down');assert.equal(monitor.snapshot().services[0].day.uptime,50);assert.equal(monitor.incidents.length,1);assert.equal(monitor.incidents[0].resolvedAt,null);
  now+=60000;monitor.record(service,good);assert.equal(monitor.snapshot().services[0].day.uptime,66.67);assert.equal(monitor.incidents[0].resolvedAt,now);
  now+=60000;monitor.record(service,{...good,latencyMs:2200});assert.equal(monitor.snapshot().services[0].status,'degraded');assert.equal(monitor.incidents.at(-1).kind,'degraded');
  now+=2*86400000;assert.equal(monitor.snapshot().services[0].day.checks,0);assert.equal(monitor.snapshot().services[0].week.checks,4);assert.equal(monitor.snapshot().services[0].stale,true);
});
test('checks at most two services concurrently and never overlaps cycles',async()=>{
  let pending=0,maximum=0,finish;const gate=new Promise(resolve=>finish=resolve);
  const monitor=new Monitor({services:Array.from({length:8},(_,index)=>({...service,host:'service'+index+'.test'})),check:async()=>{pending++;maximum=Math.max(maximum,pending);await gate;pending--;return good;}});
  const cycle=monitor.cycle();await new Promise(resolve=>setImmediate(resolve));assert.equal(await monitor.cycle(),false);finish();await cycle;assert.equal(maximum,2);assert.equal(monitor.snapshot().services.every(item=>item.day.checks===1),true);
});
test('history and incidents are bounded and corrupted history does not crash the service',async()=>{
  let now=Date.now();const monitor=new Monitor({services:[service],now:()=>now});
  for(let index=0;index<10200;index++){now+=60000;monitor.record(service,index%2?good:{available:false,error:'timeout'});}
  assert.ok(monitor.samples[service.host].length<=10080);assert.ok(monitor.incidents.length<=200);
  const dataDir=path.join(directory,'corrupt');await import('node:fs/promises').then(fs=>fs.mkdir(dataDir));await writeFile(path.join(dataDir,'history.json'),'not json');const broken=new Monitor({dataDir,services:[service]});await broken.load();assert.equal(broken.snapshot().services[0].status,'unknown');assert.equal(broken.snapshot().historyPersistent,false);
});
test('HTTP API is read-only and cannot be used as an arbitrary URL checker',async()=>{
  let calls=0;const monitor=new Monitor({services:[service],check:async()=>{calls++;return good;}});await monitor.cycle();
  const app=await startServer({monitor,host:'127.0.0.1',port:0,startMonitoring:false,publicDir:directory});
  try{const base='http://127.0.0.1:'+app.server.address().port;
    const response=await fetch(base+'/api/status?url=http://127.0.0.1/secret');assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.services.length,1);assert.equal(payload.services[0].host,service.host);assert.equal(calls,1);assert.ok(!JSON.stringify(payload).includes(directory));
    assert.equal((await fetch(base+'/api/check',{method:'POST',body:'{}'})).status,405);assert.equal((await fetch(base+'/api/status',{method:'POST'})).status,405);assert.equal((await fetch(base+'/health')).status,200);
  }finally{await app.close();}
});

test('TLS probe verifies SNI and dates, exposes real expiry, and handles unsuccessful HTTP statuses',async()=>{
  const caKey=path.join(directory,'ca.key'),caCert=path.join(directory,'ca.crt');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',caCert,'-days','2','-subj','/CN=Giorgi Health Test CA'],{stdio:'ignore'});
  const leafKey=path.join(directory,'leaf.key'),csr=path.join(directory,'leaf.csr'),valid=path.join(directory,'valid.crt'),expired=path.join(directory,'expired.crt'),extensions=path.join(directory,'extensions.cnf');
  await writeFile(extensions,'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
  execFileSync('openssl',['req','-new','-newkey','rsa:2048','-nodes','-keyout',leafKey,'-out',csr,'-subj','/CN=localhost'],{stdio:'ignore'});
  execFileSync('openssl',['x509','-req','-in',csr,'-CA',caCert,'-CAkey',caKey,'-CAcreateserial','-out',valid,'-days','1','-extfile',extensions],{stdio:'ignore'});
  const caConfig=path.join(directory,'ca.cnf');await mkdir(path.join(directory,'newcerts'));await writeFile(path.join(directory,'index.txt'),'');await writeFile(path.join(directory,'serial'),'10\n');
  await writeFile(caConfig,`[ca]\ndefault_ca=test\n[test]\ndatabase=${directory}/index.txt\nserial=${directory}/serial\nnew_certs_dir=${directory}/newcerts\nprivate_key=${caKey}\ncertificate=${caCert}\ndefault_md=sha256\ndefault_days=1\npolicy=policy_any\n[policy_any]\ncommonName=supplied\n[server]\nsubjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n`);
  execFileSync('openssl',['ca','-batch','-config',caConfig,'-in',csr,'-out',expired,'-startdate','20200101000000Z','-enddate','20200102000000Z','-extensions','server'],{stdio:'ignore'});
  const ca=await readFile(caCert),key=await readFile(leafKey);let status=200;
  for(const [certificate,expected] of [[valid,true],[expired,false]]){
    const server=https.createServer({key,cert:await readFile(certificate)},(req,res)=>{if(req.url==='/slow')return;res.writeHead(status);res.end('fixture');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const target={host:'localhost',port:server.address().port,path:'/health'};
      const observation=await probe(target,{ca,timeoutMs:1500});assert.equal(observation.available,expected);
      if(expected){assert.equal((await probe({...target,path:'/slow'},{ca,timeoutMs:200})).error,'timeout');assert.equal((await probe(target,{timeoutMs:1500})).available,false);assert.equal(observation.httpStatus,200);assert.ok(observation.tlsExpiresAt>Date.now());assert.equal(typeof observation.latencyMs,'number');status=503;assert.equal((await probe(target,{ca,timeoutMs:1500})).error,'http_error');status=200;assert.equal((await probe({...target,host:'127.0.0.1'},{ca,timeoutMs:1500})).available,false);}
      else assert.equal(observation.error,'invalid_certificate');
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
});
