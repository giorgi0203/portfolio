const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {learningLessons}=require('../apps/angular-compiler-ui/src/app/lessons.ts');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1050},extraHTTPHeaders:{DNT:'1'}});
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.LAB_URL||'http://127.0.0.1:3392/';
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{level:1}).waitFor();
  await page.locator('app-code-editor .monaco-editor').waitFor();
  const selectLesson=async index=>{await page.getByRole('navigation',{name:'Learning lessons'}).getByRole('button').nth(index).click();await page.frameLocator('iframe[title="Live Angular preview"]').locator('app-demo').waitFor();};
  const updateSource=async source=>{await page.evaluate(value=>{const model=window.monaco.editor.getModels().find(model=>model.getLanguageId()==='typescript');model.setValue(value);},source);};
  for(let index=0;index<learningLessons.length;index++){
   const lesson=learningLessons[index];await selectLesson(index);
   await page.getByRole('button',{name:'Check challenge',exact:true}).click();
   await page.waitForFunction(count=>document.querySelectorAll('.check-results li').length===count&&document.querySelectorAll('.check-results li:not(.passed)').length>0,lesson.checks.length);
   await updateSource(lesson.solution);
   await page.getByRole('button',{name:'Check challenge',exact:true}).click();
   await page.waitForFunction(count=>document.querySelectorAll('.check-results li').length===count&&document.querySelectorAll('.check-results li.passed').length===count,lesson.checks.length);
   console.log('PASS real browser challenge starter fails and solution passes:',lesson.id);
  }
  assert.equal(await page.locator('iframe[title="Live Angular preview"]').getAttribute('sandbox'),'allow-scripts');
  assert.match(await page.locator('.state-values').innerText(),/count/);
  await page.getByLabel('Experiment name',{exact:true}).fill('My saved learning experiment');await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('.load-experiment').filter({hasText:'My saved learning experiment'}).waitFor();
  await page.getByRole('button',{name:'Share ↗',exact:true}).click();
  const link=await page.getByLabel('Portable experiment link',{exact:true}).inputValue();assert.match(link,/#experiment=/);
  await page.screenshot({path:'/tmp/learning-lab-desktop.png',fullPage:true});
  const shared=await context.newPage();shared.setDefaultTimeout(60000);await shared.goto(link,{waitUntil:'domcontentloaded'});await shared.getByRole('heading',{level:1}).waitFor();
  assert.equal(await shared.locator('iframe[title="Live Angular preview"]').count(),0,'Shared code must stay inert until explicitly run');
  await shared.getByRole('button',{name:'▶ Run preview',exact:true}).click();
  const preview=shared.frameLocator('iframe[title="Live Angular preview"]');await preview.getByRole('button',{name:'Child says: add 2',exact:true}).click();await preview.getByText('Total: 2',{exact:true}).waitFor();
  await shared.setViewportSize({width:390,height:844});await shared.getByRole('button',{name:'Learn',exact:true}).click();await shared.getByRole('button',{name:'Run challenge checks',exact:true}).waitFor();
  assert.ok(await shared.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shared.screenshot({path:'/tmp/learning-lab-mobile.png',fullPage:true});
  await shared.getByRole('button',{name:'Preview',exact:true}).click();await shared.getByRole('button',{name:'Stop preview',exact:true}).click();await shared.locator('iframe[title="Live Angular preview"]').waitFor({state:'detached'});
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS guest saves, portable share link, inert import, isolated preview, live reactivity, mobile panels and stop action');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
