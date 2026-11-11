const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  let app,base=process.env.HEALTH_URL;
  if(!base){
    const {Monitor,SERVICES}=await import(pathToFileURL(path.resolve('apps/site-health/server/monitor.mjs')).href);
    const {startServer}=await import(pathToFileURL(path.resolve('apps/site-health/server/server.mjs')).href);
    const end=Date.now();let clock=end;
    const monitor=new Monitor({services:SERVICES,now:()=>clock});
    SERVICES.forEach((service,index)=>{
      for(let point=0;point<45;point++){
        clock=end-(44-point)*120000-(index===3?400000:0);
        const down=index===1&&point>=40;
        monitor.record(service,{available:!down,httpStatus:down?503:200,latencyMs:down?null:110+(point*17+index*40)%500,tlsExpiresAt:end+(index===2?5:60)*86400000,error:down?'http_error':'ok'});
      }
    });clock=end;
    app=await startServer({monitor,port:0,startMonitoring:false,publicDir:path.resolve('dist/apps/site-health/public')});base='http://127.0.0.1:'+app.server.address().port;
  }
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1050}});
    const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'What’s running.',exact:true}).waitFor();
    await page.locator('.service').first().waitFor();assert.equal(await page.locator('.service').count(),8);
    await page.locator('button[data-action="select"][data-host="auth.giorgi.app"]').click();
    await page.getByRole('heading',{name:'Giorgi Account',exact:true}).waitFor();
    if(app)assert.ok(await page.locator('.response-chart').count()>0);
    await page.getByRole('button',{name:'7 days',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'7 days',exact:true}).getAttribute('aria-pressed'),'true');
    if(app){assert.ok(await page.getByText('5 days remaining',{exact:true}).isVisible());assert.ok(await page.locator('.incidents li').count()>0);assert.ok(await page.locator('.chart-empty').count()>0);}
    await page.getByRole('button',{name:'24 hours',exact:true}).click();
    await page.screenshot({path:'/tmp/site-health-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/site-health-mobile.png',fullPage:true});
    const overflow=await page.evaluate(()=>({fits:document.documentElement.scrollWidth<=innerWidth,wide:[...document.querySelectorAll('*')].filter(element=>element.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(element=>({tag:element.tagName,css:element.className}))}));
    assert.ok(overflow.fits,JSON.stringify(overflow.wide));
    await page.route('**/api/status',route=>route.abort('connectionfailed'));
    await page.getByRole('button',{name:'Refresh status',exact:true}).click();
    await page.getByRole('alert').waitFor();assert.equal(await page.locator('.service').count(),8);
    await page.unroute('**/api/status');
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByRole('alert').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('PASS Site Health: eight services, observation history, service selection, range, TLS expiry, incident UI, mobile, failed-fetch recovery');
  }finally{await browser.close();if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
