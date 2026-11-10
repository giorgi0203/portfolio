const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.setDefaultTimeout(60000);
    page.on('requestfailed',request=>console.log('REQUEST FAILED',new URL(request.url()).origin+new URL(request.url()).pathname,request.failure()?.errorText));
    page.on('response',response=>{if(response.status()>=400)console.log('HTTP',response.status(),new URL(response.url()).origin+new URL(response.url()).pathname);});
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.COMPILER_UI_URL || 'http://127.0.0.1:3440/', { waitUntil: 'domcontentloaded' });
    await page.getByText('Server Online', { exact: true }).waitFor();
    await page.locator('.input-panel .monaco-editor').first().waitFor();
    for (const name of ['Counter', 'List', 'Form']) {
      await page.getByRole('button', { name, exact: true }).click();
      const result=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/compile'&&response.request().method()==='POST');
      await page.getByRole('button', { name: '▶️ Compile', exact: true }).click();
      assert.equal((await (await result).json()).ok,true);
      await page.getByText('Success', { exact: true }).waitFor({ timeout: 20000 });
      await page.locator('.output-panel .monaco-editor').waitFor();
      await page.waitForFunction(example=>window.monaco.editor.getModels().some(model=>model.getLanguageId()==='javascript'&&model.getValue().includes('class '+example+'Component')),name);
    }
    await page.screenshot({ path: '/tmp/angular-compiler-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/angular-compiler-mobile.png', fullPage: true });
    await page.setViewportSize({ width:1440,height:1000 });
    const api=process.env.CATALOG_URL||'http://127.0.0.1:3431';
    await page.goto(api+'/api/docs',{waitUntil:'domcontentloaded'});
    await page.locator('.info .title').waitFor();
    const projects=page.locator('.opblock').filter({hasText:'/api/projects'});
    await projects.locator('.opblock-summary').click();
    await projects.getByRole('button',{name:'Try it out',exact:true}).click();
    const projectResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/projects');
    await projects.getByRole('button',{name:'Execute',exact:true}).click();
    assert.equal((await (await projectResponse).json()).length,6);
    for(const [url,title] of (process.env.MCP_DISABLED?[]:[[process.env.EXAMPLE_URL||'http://127.0.0.1:3411','Example MCP'],[process.env.GATEWAY_URL||'http://127.0.0.1:3421','MCP Gateway']])){
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      assert.match(await page.locator('#config').innerText(),/mcp/);
    }
    assert.deepEqual(errors, []);
    console.log('PASS Chrome editor loading, Counter/List/Form Ivy compilation, output editor, mobile layout and interactive API documentation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
