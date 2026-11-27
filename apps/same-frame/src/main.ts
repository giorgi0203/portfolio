import './style.css';
import { capturePhoto, exportGif, exportSlider, readPhoto, releasePhoto, type Photo } from './media';

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing control ' + id);
  return element as T;
}
const stage = el('stage');
const video = el<HTMLVideoElement>('camera');
const beforeImage = el<HTMLImageElement>('original-image');
const afterImage = el<HTMLImageElement>('new-image');
const originalFile = el<HTMLInputElement>('original-file');
const newFile = el<HTMLInputElement>('new-file');
const compare = el<HTMLInputElement>('compare');
const blend = el<HTMLInputElement>('blend');
const status = el('status');
const sampleThen = '/sample-then.jpg', sampleNow = '/sample-now.jpg';
let original: Photo | null = null, newer: Photo | null = null;
let stream: MediaStream | null = null;
let facing: 'user'|'environment' = 'environment';
let generation = 0, cameraRequest = 0, pendingCamera = false, exporting = false;

function stopCamera() {
  cameraRequest++;
  pendingCamera = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
}
function begin() {
  generation++;
  exporting = false;
  stopCamera();
  status.textContent = '';
  return generation;
}
function dispose(photo: Photo | null) { if (photo) releasePhoto(photo); }
function setPhoto(side: 'original'|'newer', photo: Photo|null) {
  if (side === 'original') { dispose(original); original = photo; }
  else { dispose(newer); newer = photo; }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.';
}
function slider() {
  stage.style.setProperty('--split', compare.value + '%');
  compare.setAttribute('aria-valuetext',compare.value + '% original photo');
}
function overlay() {
  el('blend-value').textContent = blend.value + '%';
  beforeImage.style.opacity = stream ? String(Number(blend.value) / 100) : '1';
}
function update() {
  const intro = !original, aligning = !!original && !newer, complete = !!original && !!newer;
  el('step-title').innerHTML = intro ? 'Line up a <em>memory.</em>' : aligning ? 'Recreate the <em>frame.</em>' : 'Then <em>&amp;</em> now.';
  el('instruction').textContent = intro ? 'Choose an old photo, line it up with your camera, and see what changed.'
    : aligning ? 'Use the original as a guide over your camera, or choose a newer photo from this device.'
    : 'Slide between the photos. Save a GIF or an interactive comparison that opens in a browser.';
  el('intro-controls').hidden = !intro;
  el('align-controls').hidden = !aligning;
  el('export-controls').hidden = !complete;
  el('reset').hidden = intro;
  el('camera-idle').hidden = !!stream;
  el('camera-active').hidden = !stream;
  el<HTMLButtonElement>('start-camera').disabled = pendingCamera;
  el('start-camera').textContent = pendingCamera ? 'Opening camera…' : 'Open camera';
  for (const id of ['save-gif','save-slider']) el<HTMLButtonElement>(id).disabled = exporting;
  beforeImage.src = original?.url ?? sampleThen;
  if (!aligning) afterImage.src = newer?.url ?? sampleNow;
  else afterImage.removeAttribute('src');
  afterImage.hidden = aligning;
  video.hidden = !stream;
  stage.classList.toggle('align', aligning);
  const ratio = original ? original.width / original.height : 1;
  stage.parentElement?.style.setProperty('--ratio', String(ratio));
  for (const id of ['compare','divider','now-label']) el(id).hidden = aligning;
  el('then-label').textContent = aligning ? (stream ? 'Original overlay' : 'Original') : 'Then';
  el('photo-caption').textContent = intro ? 'Tbilisi · illustrated example' : aligning ? 'Original frame' : 'Photo pair';
  el('gesture').textContent = aligning ? (stream ? 'Live camera' : 'Ready to align') : 'Drag to compare ↔';
  overlay();slider();
}
async function loadFile(side:'original'|'newer', file:File) {
  const id = begin(), frame = side === 'newer' ? original : null;
  if (side === 'newer' && !frame) return;
  update();
  status.textContent = 'Preparing photo…';
  try {
    const photo = await readPhoto(file, frame ?? undefined);
    if (generation !== id) { dispose(photo); return; }
    if (side === 'original') setPhoto('newer',null);
    setPhoto(side,photo);
    compare.value='50';
    status.textContent='';
    update();
    el('step-title').focus({preventScroll:true});
  } catch(e) { if (generation === id) status.textContent=message(e); }
}
async function useExample() {
  const id=begin();
  status.textContent='Preparing example…';
  const files = await Promise.allSettled([sampleThen,sampleNow].map(async path => {
    const response=await fetch(path);
    if (!response.ok) throw new Error('The example could not load. You can still choose your own photo.');
    return readPhoto(new File([await response.blob()], 'example.jpg', {type:'image/jpeg'}));
  }));
  if (id!==generation || files.some(item=>item.status==='rejected')) {
    for(const item of files) if(item.status==='fulfilled')dispose(item.value);
    if(id===generation)status.textContent='The example could not load. Try choosing your own photo.';
    return;
  }
  const [first,second]=files;
  if(first.status==='fulfilled'&&second.status==='fulfilled'){
    setPhoto('original',first.value);setPhoto('newer',second.value);status.textContent='';
    update();el('step-title').focus({preventScroll:true});
  }
}
async function openCamera() {
  if (!original || newer) return;
  stopCamera();
  const id=cameraRequest;
  pendingCamera=true;status.textContent='';update();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Choose a newer photo instead.');
    const acquired = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1440}}});
    if(cameraRequest!==id || document.hidden){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;
    video.srcObject=stream;
    video.classList.toggle('mirrored',(stream.getVideoTracks()[0]?.getSettings().facingMode ?? facing)==='user');
    await video.play();
    if(cameraRequest!==id)return;
    update();el('capture').focus({preventScroll:true});
    acquired.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stream===acquired){stopCamera();update();status.textContent='Camera disconnected. Reopen it or choose a photo.';}},{once:true});
  } catch(e) {
    if(cameraRequest!==id)return;
    stopCamera();
    status.textContent=e instanceof DOMException ? 'Could not open the camera. Allow camera access or choose a newer photo.' : message(e);
  } finally { if(id===cameraRequest)pendingCamera=false;update(); }
}
async function shoot() {
  if(!stream || !original)return;
  const id=cameraRequest;
  try {
    const photo=await capturePhoto(video,original,video.classList.contains('mirrored'));
    if(id!==cameraRequest){dispose(photo);return;}
    begin();setPhoto('newer',photo);compare.value='50';update();el('step-title').focus({preventScroll:true});
  } catch(e){if(id===cameraRequest)status.textContent=message(e);}
}
async function save(kind:'gif'|'slider') {
  if(!original || !newer || exporting)return;
  const id=generation;
  exporting=true;update();status.textContent=kind==='gif'?'Encoding GIF…':'Preparing comparison…';
  try {
    const blob=await (kind==='gif'?exportGif(original,newer):exportSlider(original,newer,Number(compare.value)));
    if(id!==generation)return;
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download='same-frame.'+(kind==='gif'?'gif':'html');document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='Download ready.';
  } catch(e){if(id===generation)status.textContent=message(e);}
  finally {if(id===generation){exporting=false;update();}}
}
el('choose-original').onclick=()=>originalFile.click();
el('choose-new').onclick=()=>newFile.click();
originalFile.onchange=()=>{const file=originalFile.files?.[0];originalFile.value='';if(file)void loadFile('original',file);};
newFile.onchange=()=>{const file=newFile.files?.[0];newFile.value='';if(file)void loadFile('newer',file);};
el('demo').onclick=()=>void useExample();
el('start-camera').onclick=()=>void openCamera();
el('flip-camera').onclick=()=>{facing=video.classList.contains('mirrored')?'environment':'user';void openCamera();};
el('stop-camera').onclick=()=>{stopCamera();update();el('start-camera').focus();};
el('capture').onclick=()=>void shoot();
el('retake').onclick=()=>{begin();setPhoto('newer',null);update();el('step-title').focus({preventScroll:true});};
el('reset').onclick=()=>{begin();setPhoto('original',null);setPhoto('newer',null);compare.value='50';update();el('choose-original').focus();};
el('save-slider').onclick=()=>void save('slider');
el('save-gif').onclick=()=>void save('gif');
compare.oninput=slider;blend.oninput=overlay;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(stream||pendingCamera)){stopCamera();update();}});
window.addEventListener('pagehide',()=>{stopCamera();});
window.addEventListener('pageshow',()=>update());
update();
