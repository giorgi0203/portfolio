import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Monitor} from './monitor.mjs';

export async function startServer({host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT)||3350,dataDir=process.env.HEALTH_DATA_DIR,monitor,publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public'),startMonitoring=true}={}){
  const tracker=monitor||new Monitor({dataDir,release:process.env.HEALTH_RELEASE||''});await tracker.load();if(startMonitoring)tracker.start();
  let snapshotCache=null,snapshotAt=0;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');reply(405,{error:'Only read-only status requests are available.'});return;}
    let pathname;try{pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);}catch{reply(400,{error:'Invalid path'});return;}
    if(pathname==='/health'){reply(200,{status:'ok',service:'giorgi-site-health'});return;}
    if(pathname==='/api/status'){if(!snapshotCache||Date.now()-snapshotAt>5000){snapshotCache=tracker.snapshot();snapshotAt=Date.now();}reply(200,snapshotCache);return;}
    if(pathname.startsWith('/api/')){reply(404,{error:'Not found'});return;}
    const local=path.resolve(publicDir,'.'+(pathname==='/'?'/index.html':pathname));
    if(local!==publicDir&&!local.startsWith(publicDir+path.sep)){reply(404,{error:'Not found'});return;}
    try{const data=await readFile(local);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(local)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':path.extname(local)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:data);}
    catch{reply(404,{error:'Not found'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {server,monitor:tracker,close:async()=>{tracker.stop();await new Promise(resolve=>server.close(resolve));}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startServer().then(({server,close})=>{console.log('Site Health ready on loopback port '+server.address().port);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close().then(()=>process.exit(0)));}).catch(()=>{console.error('Site Health could not start.');process.exitCode=1;});
}
