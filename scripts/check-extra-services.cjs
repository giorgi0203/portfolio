const assert = require('node:assert/strict');
const fs = require('node:fs');
const urls = {
  compiler: process.env.COMPILER_URL || 'http://127.0.0.1:3401',
  example: process.env.EXAMPLE_URL || 'http://127.0.0.1:3411',
  gateway: process.env.GATEWAY_URL || 'http://127.0.0.1:3421',
  api: process.env.CATALOG_URL || 'http://127.0.0.1:3431',
};
async function get(url, options) {
  return fetch(url, { signal: AbortSignal.timeout(20000), ...options });
}
async function compile(input) {
  const response = await get(urls.compiler + '/api/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  return { status: response.status, body: await response.json() };
}
async function mcp(base) {
  let session, id = 0;
  async function rpc(method, params, notification = false) {
    const response = await get(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session, 'MCP-Protocol-Version': '2025-03-26' } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: ++id }), method, ...(params ? { params } : {}) }) });
    assert.ok(response.ok, method + ' returned ' + response.status);
    session = response.headers.get('mcp-session-id') || session;
    const text = await response.text();
    if (notification) return;
    const payload = text.startsWith('event:') ? text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => message.id === id) : JSON.parse(text);
    assert.ok(payload && !payload.error, method + ' RPC error');
    return payload.result;
  }
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'giorgi-deployment-check', version: '1.0' } });
  assert.ok(session, 'MCP must retain the initialized session');
  await rpc('notifications/initialized', undefined, true);
  assert.equal((await rpc('tools/list')).tools.length, 3);
  assert.match((await rpc('tools/call', { name: 'calculate', arguments: { operation: 'add', a: 2, b: 3 } })).content[0].text, /= 5$/);
  assert.equal((await rpc('tools/call', { name: 'calculate', arguments: { operation: 'divide', a: 2, b: 0 } })).isError, true);
  const projects = await rpc('tools/call', { name: 'list_nx_projects', arguments: {} });
  assert.ok(!projects.isError);
  assert.match(projects.content[0].text, /angular-compiler-ui/);
  assert.match((await rpc('tools/call', { name: 'get_datetime', arguments: { format: 'iso' } })).content[0].text, /iso: \d{4}-/);
  assert.equal((await rpc('resources/list')).resources.length, 2);
  const pkg = await rpc('resources/read', { uri: 'project://package.json' });
  assert.equal(JSON.parse(pkg.contents[0].text).name, 'portfolio');
  assert.equal((await rpc('prompts/list')).prompts.length, 2);
  assert.match((await rpc('prompts/get', { name: 'summarize', arguments: { text: 'A short demo', maxWords: '10' } })).messages[0].content.text, /10 words/);
  assert.equal((await get(base, { method: 'DELETE', headers: { 'mcp-session-id': session } })).status, 200);
  assert.equal((await get(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'mcp-session-id': session, Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }) })).status, 404);
  console.log('PASS MCP initialize, reused session, tools, resources, prompts and session deletion:', new URL(base).hostname);
}
(async () => {
  assert.equal((await (await get(urls.compiler + '/health')).json()).status, 'healthy');
  const result = await compile({ componentTs: 'title = "Hello";', templateHtml: '<h1>{{ title }}</h1>' });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true, JSON.stringify(result.body.diagnostics));
  assert.ok(result.body.files.some(file => file.content.includes('ɵɵdefineComponent')));
  console.log('PASS real Angular AOT compilation');
  if (!process.env.SMOKE_ONLY) {
    const external = await compile({ componentTs: 'import {Component} from "@angular/core"; @Component({selector:"app-demo",standalone:true,templateUrl:"./demo.component.html",styleUrl:"./demo.component.css"}) export class ExampleComponent {title="External";}', templateHtml: '<h1>{{title}}</h1>', styleCss: 'h1 {color:red}' });
    assert.equal(external.body.ok, true, JSON.stringify(external.body.diagnostics));
    assert.equal((await compile({ componentTs: 'title = ;', templateHtml: '<h1>{{title}}</h1>' })).body.ok, false);
    assert.equal((await compile({ componentTs: 'title="test";', templateHtml: 42 })).body.ok, false);
    assert.equal((await compile({ componentTs: 'x'.repeat(210 * 1024), templateHtml: 'test' })).status, 413);
    const fixture = '/tmp/giorgi-compiler-private-fixture.html', sentinel = 'PRIVATE-COMPILER-FIXTURE-DO-NOT-READ';
    fs.writeFileSync(fixture, sentinel);
    try {
      const denied = await compile({ componentTs: `import {Component} from "@angular/core"; @Component({selector:"app-demo",standalone:true,templateUrl:${JSON.stringify(fixture)}}) export class DemoComponent {}`, templateHtml: '' });
      assert.equal(denied.body.ok, false);
      assert.ok(!JSON.stringify(denied.body).includes(sentinel));
    } finally { fs.unlinkSync(fixture); }
    const pair = await Promise.all([compile({ componentTs: 'title="first";', templateHtml: '{{title}}' }), compile({ componentTs: 'title="second";', templateHtml: '{{title}}' })]);
    assert.deepEqual(pair.map(r => r.status).sort(), [200, 429]);
    console.log('PASS external templates/styles, invalid input, size limit, file isolation and compilation concurrency');
  }
  assert.equal((await (await get(urls.gateway + '/health')).json()).gateway, 'ok');
  await mcp(urls.example + '/mcp');
  await mcp(urls.gateway + '/mcp/example');
  assert.equal((await get(urls.gateway + '/mcp/missing')).status, 404);
  const projects = await (await get(urls.api + '/api/projects')).json();
  assert.equal(projects.length, 6);
  assert.ok(projects.every(project => project.liveUrl && project.githubUrl));
  assert.equal((await get(urls.api + '/api/docs')).status, 200);
  assert.equal((await get(urls.api + '/docs-assets/swagger-ui-bundle.js')).status, 200);
  assert.equal((await get(urls.api + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 410);
  console.log('PASS real project catalog, local API documentation assets and retired fake contact endpoint');
})().catch(error => { console.error(error); process.exitCode = 1; });
