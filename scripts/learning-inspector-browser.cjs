/** Real rendered Angular inspection and real AOT output; one compile request per run. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { learningLessons } = require('../apps/angular-compiler-ui/src/app/lessons.ts');

async function localHarness() {
  const repo = path.resolve(__dirname, '..');
  const root = path.join(repo, 'dist/apps/angular-compiler-ui/browser');
  const log = fs.openSync('/tmp/learning-inspector-servers.log', 'w');
  const compiler = spawn('node', ['dist/apps/angular-compiler-api/main.js'], { cwd: repo, env: { ...process.env, HOST: '127.0.0.1', PORT: '4391', COMPILER_NODE_MODULES: path.join(repo, 'node_modules') }, stdio: ['ignore', log, log] });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await fetch('http://127.0.0.1:4391/health')).ok) break; } catch {}
      if (attempt === 50 || compiler.exitCode !== null) throw new Error('Local compiler did not start; inspect /tmp/learning-inspector-servers.log');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/api/auth/session' || pathname === '/api/analytics/event') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(pathname.includes('session') ? { user: null } : { ok: true })); return; }
      if (pathname === '/health' || pathname === '/api/compile') {
        const upstream = http.request({ hostname: '127.0.0.1', port: 4391, path: request.url, method: request.method, headers: { ...request.headers, host: '127.0.0.1:4391', origin: 'http://127.0.0.1:4200' } }, reply => { response.writeHead(reply.statusCode, reply.headers); reply.pipe(response); });
        upstream.on('error', () => { response.writeHead(502); response.end('Local compiler unavailable'); }); request.pipe(upstream); return;
      }
      if (pathname.startsWith('/api/')) { response.writeHead(404); response.end('{}'); return; }
      let file = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(404); response.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(response);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4392, '127.0.0.1', resolve); });
    return { url: 'http://127.0.0.1:4392/', async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if(compiler.exitCode===null){compiler.kill(); await new Promise(resolve => compiler.once('exit', resolve));} fs.closeSync(log); } };
  } catch (error) { compiler.kill(); fs.closeSync(log); throw error; }
}

(async () => {
  const harness = process.env.LAB_URL ? null : await localHarness();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1680, height: 1100 }, extraHTTPHeaders: { DNT: '1' } });
    await context.addInitScript(() => {
      window.__labInspectionPackets = [];
      window.addEventListener('message', event => {
        if (event.origin === 'null' && event.source===document.querySelector('iframe[title="Live Angular preview"]')?.contentWindow && ['learning:inspection-map', 'learning:inspect', 'learning:activity'].includes(event.data?.type)) {
          window.__labInspectionPackets.push(event.data);
          window.__labInspectionPackets = window.__labInspectionPackets.slice(-240);
        }
      });
    });
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.LAB_URL || harness.url, { waitUntil: 'domcontentloaded' });
    await page.locator('app-code-editor .monaco-editor').waitFor();
    await page.locator('app-compiler-explorer').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'From template to instructions', exact: true }).waitFor();
    const preview = () => page.frameLocator('iframe[title="Live Angular preview"]');
    const editor = source => page.evaluate(value => window.monaco.editor.getModels().find(model => model.getLanguageId() === 'typescript').setValue(value), source);
    const lastPacket = type => page.evaluate(type => [...window.__labInspectionPackets].reverse().find(packet => packet.type === type), type);
    const run = async source => {
      const previous = await lastPacket('learning:inspection-map');
      await editor(source);
      await page.getByRole('button', { name: /Run preview$/ }).click();
      await page.waitForFunction(previous => window.__labInspectionPackets.some(packet => packet.type === 'learning:inspection-map' && packet.runId > previous), previous?.runId ?? -1);
      await preview().locator('app-demo').waitFor();
      return (await lastPacket('learning:inspection-map')).blocks;
    };
    const currentSelection = () => page.evaluate(() => [...window.__labInspectionPackets].reverse().find(packet => packet.type === 'learning:inspect')?.selection);
    const waitSelection = block => page.waitForFunction(block => [...window.__labInspectionPackets].reverse().find(packet => packet.type === 'learning:inspect')?.selection?.blockId === block, block);

    // Hover never executes the event expression; clicking still invokes the real Angular handler.
    const signals = learningLessons.find(lesson => lesson.id === 'signals').solution;
    const blocks = await run(signals);
    const increment = blocks.find(block => block.tag === 'button' && block.bindings.some(binding => binding.expression.includes('count.update')));
    assert.ok(increment, 'Button must map to the actual Angular event binding');
    assert.equal(increment.start, signals.indexOf('<button id="increment"'));
    assert.equal(increment.source, signals.slice(increment.start, increment.end));
    await preview().locator('#increment').hover(); await waitSelection(increment.id);
    await preview().getByText('Count: 0', { exact: true }).waitFor();
    assert.equal((await currentSelection()).values.count, '0');
    await page.locator('.learning-source-highlight').first().waitFor();
    await preview().locator('#increment').click();
    await preview().getByText('Count: 1', { exact: true }).waitFor();
    await page.waitForFunction(() => { const selection = [...window.__labInspectionPackets].reverse().find(packet => packet.type === 'learning:inspect')?.selection; return selection?.pinned && selection.values.count === '1' && selection.values.doubled === '2'; });
    await preview().locator('h2').hover();
    assert.equal((await currentSelection()).blockId, increment.id, 'Hover must not replace a pinned selection');
    await page.getByRole('region', { name: 'Angular activity', exact: true }).waitFor();
    await page.waitForFunction(() => window.__labInspectionPackets.some(packet => packet.type === 'learning:activity' && packet.activity?.kind === 'event' && packet.activity?.eventName === 'click' && packet.activity?.handler.includes('count.update')));
    await page.waitForFunction(() => window.__labInspectionPackets.some(packet => packet.type === 'learning:activity' && packet.activity?.kind === 'render'));
    await page.getByRole('button', { name: 'Unpin selection', exact: true }).click();
    console.log('PASS exact source block, non-evaluating hover, live values, pinned selection and real event/render activity');

    // Hold the one real compiler reply so edits made while compiling are accurately labelled stale.
    let releaseReply, compileRequest, compiledResponse, compileFailure;
    const actualReply = new Promise(resolve => { compileRequest = resolve; });
    await page.route('**/api/compile', async route => {
      try {
        const response = await route.fetch(), body = await response.body();
        compiledResponse={status:response.status(),body:JSON.parse(body)};
        const release=new Promise(resolve => { releaseReply = resolve; });
        compileRequest();await release;
        await route.fulfill({ response, body });
      } catch(error) { compileFailure=error;compileRequest();await route.abort().catch(()=>undefined); }
    });
    await page.getByRole('button', { name: 'Compile AOT', exact: true }).click();
    await actualReply;
    if(compileFailure)throw compileFailure;
    if(compiledResponse.status!==200||!compiledResponse.body.ok){releaseReply();throw new Error('Actual AOT failed: '+JSON.stringify(compiledResponse));}
    await editor('// New edit after compilation began.\n\n'+signals);
    await page.locator('.stale-preview').waitFor();
    await preview().locator('h2').hover();
    await page.locator('[data-testid="inspection-range"]').waitFor();
    assert.equal(await page.locator('[data-testid="inspection-range"]').isDisabled(),true);
    await page.locator('.learning-source-highlight').waitFor({state:'detached'});
    releaseReply();
    await page.locator('app-compiler-explorer .stale-output').waitFor();
    await editor(signals);
    await page.locator('app-compiler-explorer .stale-output').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Annotated', exact: true }).click();
    await page.locator('app-compiler-explorer .compiler-comment').first().waitFor();
    assert.match(await page.locator('app-compiler-explorer .generated-code').innerText(), /ɵɵdefineComponent/);
    await page.locator('app-compiler-explorer .instruction-list button[data-instruction*="Interpolate"]').first().click();
    assert.match(await page.locator('app-compiler-explorer .instruction-explanation').innerText(), /text|binding|interpolat/i);
    await page.getByRole('button', { name: 'Show related source', exact: true }).click();
    await page.getByText('Approximate source match', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Raw', exact: true }).click();
    await page.locator('app-compiler-explorer .compiler-comment').first().waitFor({state:'detached'});
    assert.equal(await page.locator('app-compiler-explorer .compiler-comment').count(), 0);
    console.log('PASS real AOT output, annotations, source link, raw view and edited-during-compile stale labelling');

    // Repeated nodes share a template range but must expose each real row's context.
    const list = learningLessons.find(lesson => lesson.id === 'lists').solution;
    const listBlocks = await run(list);
    const strong = listBlocks.find(block => block.tag === 'strong' && block.bindings.some(binding => binding.expression.includes('task.title')));
    assert.ok(strong);
    await preview().locator('#task-2 strong').hover(); await waitSelection(strong.id);
    let selection = await currentSelection();
    const localObjects = Object.values(selection.locals).map(value => { try { return JSON.parse(value); } catch { return null; } });
    assert.ok(localObjects.some(value => value && !Array.isArray(value) && value.id === 2 && value.title === 'Try something strange'), 'Row context must contain the actual second task, not only the whole root array');
    assert.equal(strong.source, list.slice(strong.start, strong.end));
    await preview().locator('#reverse').click();
    await page.getByRole('button', { name: 'Unpin selection', exact: true }).click();
    await preview().locator('#task-1 strong').hover(); await waitSelection(strong.id);
    selection = await currentSelection();
    assert.ok(Object.values(selection.locals).some(value => value === '2'), 'Loop index must reflect the rendered position after reorder');

    const communication = learningLessons.find(lesson => lesson.id === 'communication').solution;
    const childBlocks = await run(communication);
    const child = childBlocks.find(block => block.component === 'StepperComponent' && block.tag === 'button');
    assert.ok(child); await preview().locator('#child-add').hover(); await waitSelection(child.id);
    assert.equal((await currentSelection()).values.amount, '2', 'Child input must show the actual parent-supplied value rather than its class default');
    assert.equal(child.source, communication.slice(child.start, child.end));
    await preview().locator('#child-add').click(); await preview().getByText('Total: 2', { exact: true }).waitFor();
    console.log('PASS repeated-row context, reordered index and actual child-component input scope');

    // Cooked string-template offsets must map back to escaped original TS source accurately.
    const literal = String.raw`import { Component } from '@angular/core';
@Component({selector:'app-demo',standalone:true,template:'<h2>Literal\nline</h2><button id="literal" (click)="count=count+1">{{count}}</button>'})
export class DemoComponent {count=0;}`;
    const literalBlocks = await run(literal);
    const literalBlock = literalBlocks.find(block => block.tag === 'button'); assert.ok(literalBlock);
    assert.equal(literalBlock.start, literal.indexOf('<button'));
    assert.equal(literalBlock.source, literal.slice(literalBlock.start, literalBlock.end));
    await preview().locator('#literal').hover(); await waitSelection(literalBlock.id);
    assert.equal((await currentSelection()).values.count, '0');
    // Select a real source location in Monaco and verify it focuses its rendered block.
    const literalHeading=literalBlocks.find(block=>block.tag==='h2');
    await preview().locator('h2').hover();await waitSelection(literalHeading.id);
    await page.evaluate(block => {const editor=window.monaco.editor.getEditors().find(editor => editor.getModel()?.getLanguageId() === 'typescript');editor.focus();editor.setSelection({ startLineNumber: block.startLine, startColumn: block.startColumn, endLineNumber: block.endLine, endColumn: block.endColumn }, 'keyboard');}, literalBlock);
    await waitSelection(literalBlock.id);
    assert.equal((await currentSelection()).pinned,true,'Source selection must deliberately focus the matching preview block');
    const nested = `import { Component } from '@angular/core';
@Component({selector:'app-demo',standalone:true,template: \`@for(group of groups;track group.name;let gi=$index){ @for(item of group.items;track item.label;let position=$index){<p [id]="item.label">{{group.name}} {{item.label}}</p>} }\`})
export class DemoComponent {groups=[{name:'Outer group',items:[{label:'Inner-one'},{label:'Inner-two'}]}];}`;
    const nestedBlocks = await run(nested), nestedBlock=nestedBlocks.find(block=>block.tag==='p'); assert.ok(nestedBlock);
    await preview().locator('#Inner-two').hover(); await waitSelection(nestedBlock.id);
    const nestedSelection=await currentSelection();
    const inner=Object.values(nestedSelection.locals).map(value=>{try{return JSON.parse(value);}catch{return null;}}).find(value=>value&&typeof value==='object'&&value.label==='Inner-two');
    assert.ok(inner,'Nearest nested row must expose its actual item');
    assert.ok(!Object.hasOwn(nestedSelection.locals,'group')&&!Object.hasOwn(nestedSelection.locals,'gi'),'Outer scope must not be falsely read from the inner context');
    assert.match(nestedSelection.reason||'',/outer/i);
    const unmapped=`import { Component } from '@angular/core'; @Component({selector:'app-demo',standalone:true,template:['<button id="unmapped" (click)="count=count+1">','Value {{count}}','</button>'].join('')}) export class DemoComponent {count=0;}`;
    await run(unmapped);await preview().locator('#unmapped').hover();
    await page.waitForFunction(()=>{const selection=[...window.__labInspectionPackets].reverse().find(packet=>packet.type==='learning:inspect')?.selection;return selection?.blockId===null&&selection?.tag==='button';});
    assert.match((await currentSelection()).reason,/not statically mapped|no exact source/i);
    await preview().getByText('Value 0',{exact:true}).waitFor();
    console.log('PASS nested-scope limits and explicitly unmapped computed templates');
    await page.screenshot({ path: '/tmp/learning-inspector-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Compiler', exact: true }).click();
    await page.locator('app-compiler-explorer').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/learning-inspector-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS escaped literal mapping, source-to-preview focus and mobile compiler access');
  } finally { await browser.close(); if (harness) await harness.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
