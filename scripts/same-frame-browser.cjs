/** Verify public entry points, offline exports and a real MediaStream using Chromium's synthetic camera. */
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { promises: fs } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
  '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

async function serveBuild() {
  const root = path.resolve(__dirname, '../dist/apps/same-frame');
  await fs.access(path.join(root, 'index.html'));
  const contentTypes = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
    '.webp':'image/webp', '.jpeg':'image/jpeg', '.jpg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml' };
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise(r => server.close(r)) };
}

async function makePhotos(page) {
  const [original, recreation] = await page.evaluate(() => {
    function paint(width, height, bands, type='image/png') {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      for (const [color, start, end] of bands) {
        ctx.fillStyle = color; ctx.fillRect(Math.round(width * start), 0, Math.round(width * (end-start)), height);
      }
      return canvas.toDataURL(type).split(',')[1];
    }
    return [paint(480, 360, [['#d42020', 0, 1]], 'image/jpeg'),
      paint(1000, 500, [['#0011cc', 0, 0.25], ['#15b032', 0.25, 0.75], ['#ee9900', 0.75, 1]])];
  });
  // A phone JPEG stored in landscape with EXIF orientation 6 must become a portrait frame.
  const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  const raw = Buffer.from(original,'base64');
  return [
    {name:'private-camera.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([raw.subarray(0,2),exif,raw.subarray(2)])},
    {name:'recreation-private.png',mimeType:'image/png',buffer:Buffer.from(recreation,'base64')}
  ];
}

async function download(page, button, file, directory) {
  const pending = page.waitForEvent('download');
  await page.locator(button).click();
  const item = await pending;
  assert.equal(await item.failure(), null);
  assert.match(item.suggestedFilename(), new RegExp('\\.' + path.extname(file).slice(1) + '$','i'));
  const local = path.join(directory, file);
  await item.saveAs(local);
  return local;
}

async function checkSlider(browser, file) {
  const context = await browser.newContext({ offline:true });
  try {
    const page = await context.newPage();
    const remote = [];
    page.on('request', req => { if (/^https?:/.test(req.url())) remote.push(req.url()); });
    await page.setContent(await fs.readFile(file, 'utf8'));
    const slider = page.locator('input[type=range]');
    assert.equal(await slider.inputValue(), '26');
    assert.equal(await page.locator('img[src^="data:image/jpeg;base64,"]').count(), 2);
    for (const base64 of await page.locator('img').evaluateAll(images=>images.map(image=>image.src.split(',')[1]))) {
      assert.equal(Buffer.from(base64,'base64').includes(Buffer.from('Exif\0\0')), false, 'source EXIF removed');
    }
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
    await slider.focus(); await slider.press('End');
    assert.equal(await page.locator('figure').evaluate(figure => figure.style.getPropertyValue('--split')), '100%');
    await slider.press('Home');
    assert.equal(await page.locator('figure').evaluate(figure => figure.style.getPropertyValue('--split')), '0%');
    const frame=await page.locator('figure').boundingBox();
    await page.mouse.click(frame.x+frame.width/2,frame.y+frame.height/2);
    assert.ok(Math.abs(Number(await slider.inputValue())-50)<=1,'dragging the offline photo divider also updates the control');
    assert.deepEqual(remote, []);
  } finally { await context.close(); }
}

async function checkGif(page, file) {
  const bytes = await fs.readFile(file);
  assert.equal(bytes.subarray(0,6).toString('ascii'), 'GIF89a');
  assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')), 'GIF has a loop control extension');
  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
    const decoder = new ImageDecoder({ data:bytes, type:'image/gif' });
    await decoder.tracks.ready;
    const {frameCount, repetitionCount} = decoder.tracks.selectedTrack;
    const colors = [];
    for (let frameIndex=0; frameIndex<frameCount; frameIndex++) {
      const { image } = await decoder.decode({frameIndex});
      const canvas = document.createElement('canvas'); canvas.width=image.displayWidth; canvas.height=image.displayHeight;
      const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0);
      colors.push([...ctx.getImageData(1, canvas.height>>1, 1,1).data]); image.close();
    }
    decoder.close(); return {frameCount,infinite:repetitionCount===Infinity,colors};
  }, bytes.toString('base64'));
  assert.equal(result.frameCount,2); assert.equal(result.infinite,true);
  assert.ok(result.colors[0][0]>150 && result.colors[0][1]<90, 'first GIF frame contains the original');
  assert.ok(result.colors[1][1]>120 && result.colors[1][0]<90, 'second GIF frame uses the centered recreation crop');
  assert.equal(bytes.readUInt16LE(6)*4,bytes.readUInt16LE(8)*3);
}

async function main() {
  const harness = process.env.SAME_FRAME_URL ? null : await serveBuild();
  const url = process.env.SAME_FRAME_URL || harness.url;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'same-frame-check-'));
  const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',
    args:['--no-sandbox','--use-fake-device-for-media-stream'] });
  try {
    const context = await browser.newContext({ viewport:{width:1440,height:960}, permissions:['camera'], extraHTTPHeaders:{DNT:'1'} });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors=[], uploads=[];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('request', r=>{ if (['POST','PUT','PATCH'].includes(r.method()) && !r.url().includes('/analytics/')) uploads.push(r.url()); });
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.__frameTracks = [];
      navigator.mediaDevices.getUserMedia = async options => {
        const stream = await get(options);
        window.__frameTracks.push(...stream.getVideoTracks());
        if (window.__delayPermission) await new Promise(resolve => { window.__releasePermission = resolve; });
        return stream;
      };
    });
    await page.goto(url); await page.locator('#original-file').waitFor({state:'attached'});
    const [original, recreation] = await makePhotos(page);
    await page.waitForFunction(()=>[...document.images].every(image=>image.complete && image.naturalWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'same-frame-desktop.png'),fullPage:true});
    await page.locator('#demo').click();
    await page.locator('#save-gif').waitFor();
    await page.locator('#reset').click();
    await page.locator('#original-file').setInputFiles(original);
    await page.waitForFunction(()=>document.querySelector('#original-image').naturalWidth===360 && document.querySelector('#original-image').naturalHeight===480);
    await page.locator('#start-camera').click();
    await page.waitForFunction(() => window.__frameTracks.some(track=>track.readyState==='live') && document.querySelector('video')?.videoWidth);
    await page.locator('#blend').fill('38');
    await page.locator('#flip-camera').click();
    await page.waitForFunction(()=>window.__frameTracks.length===2 && window.__frameTracks[0].readyState==='ended' && window.__frameTracks[1].readyState==='live' && document.querySelector('video')?.readyState>=2);
    await page.locator('#stop-camera').click();
    await page.waitForFunction(()=>window.__frameTracks.every(track=>track.readyState==='ended'));
    await page.locator('#start-camera').click();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await page.locator('#capture').click();
    await page.locator('#compare').waitFor();
    await page.waitForFunction(()=>window.__frameTracks.length>=2 && window.__frameTracks.every(track=>track.readyState==='ended'));
    await page.locator('#retake').click();
    await page.locator('#new-file').setInputFiles(recreation);
    await page.locator('#compare').waitFor();
    await page.locator('#compare').fill('26');
    await page.locator('#compare').dispatchEvent('input');
    await checkGif(page, await download(page,'#save-gif','pair.gif',directory));
    await checkSlider(browser, await download(page,'#save-slider','pair.html',directory));
    await page.locator('#reset').click();
    await page.locator('#original-file').setInputFiles(original);
    await page.evaluate(()=>{window.__delayPermission=true;});
    await page.locator('#start-camera').click();
    await page.waitForFunction(()=>typeof window.__releasePermission==='function');
    await page.locator('#reset').click();
    await page.evaluate(()=>window.__releasePermission());
    await page.waitForFunction(()=>window.__frameTracks.every(track=>track.readyState==='ended'));
    await page.locator('#choose-original').waitFor();
    assert.deepEqual(uploads,[]);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS sample, file selection, camera stop/capture cleanup, center crop, two GIF frames and offline slider');

    const mobile = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, extraHTTPHeaders:{DNT:'1'}});
    const phone=await mobile.newPage();
    await phone.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Camera denied','NotAllowedError');};});
    await phone.goto(url);
    await phone.waitForFunction(()=>[...document.images].every(image=>image.complete && image.naturalWidth));
    await phone.screenshot({path:path.join(os.tmpdir(),'same-frame-mobile.png'),fullPage:true});
    await phone.locator('#original-file').setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('<svg></svg>')});
    await phone.waitForFunction(()=>/JPEG, PNG or WebP/i.test(document.querySelector('#status')?.textContent));
    await phone.locator('#original-file').setInputFiles(original);
    await phone.locator('#start-camera').click();
    await phone.waitForFunction(()=>/allow camera access|camera access is unavailable/i.test(document.querySelector('#status')?.textContent));
    await phone.locator('#new-file').setInputFiles(recreation);
    await phone.locator('#compare').waitFor();
    await phone.locator('#compare').focus(); await phone.locator('#compare').press('End');
    assert.equal(await phone.locator('#compare').inputValue(),'100');
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await mobile.close();
    console.log('PASS mobile camera denial, invalid upload recovery, upload fallback, accessible slider and width');
  } finally {
    await browser.close();
    await fs.rm(directory,{recursive:true,force:true});
    if(harness) await harness.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
