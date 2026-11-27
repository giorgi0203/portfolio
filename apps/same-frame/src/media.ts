/** Photos returned by this module are normalized JPEGs held by this browser tab. */
export interface Photo {
  url: string;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_PIXELS = 64_000_000;
const PHOTO_EDGE = 1920;
const GIF_EDGE = 720;
const localImages = new WeakMap<Photo, Blob>();
const unsupported = 'Choose a JPEG, PNG or WebP photo.';
const damaged = 'This photo could not be read. Try another JPEG, PNG or WebP.';

export function fitSize(size: Size, longestEdge: number): Size {
  const scale = Math.min(1, longestEdge / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/** Equivalent to centered object-fit: cover, including when the camera is landscape on a portrait screen. */
export function coverCrop(source: Size, frame: Size) {
  const scale = Math.max(frame.width / source.width, frame.height / source.height);
  const width = frame.width / scale;
  const height = frame.height / scale;
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height };
}

/** Read sizes before handing a file to an image decoder; extensions and OS-reported MIME types can be wrong. */
export function inspectPhotoHeader(bytes: Uint8Array): Size & { type: string } {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number, value: string) =>
    [...value].every((character, i) => bytes[offset + i] === character.charCodeAt(0));
  let width = 0, height = 0, type = '';

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    type = 'image/jpeg';
    let pos = 2;
    while (pos + 3 < bytes.length && bytes[pos] === 0xff) {
      while (bytes[pos] === 0xff) pos++;
      const marker = bytes[pos++];
      if (marker === 0xda || marker === 0xd9 || pos + 2 > bytes.length) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = data.getUint16(pos);
      if (length < 2 || pos + length > bytes.length) break;
      // JPEG SOF markers carry the pixel dimensions. DHT, JPG and DAC use other segment layouts.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
        height = data.getUint16(pos + 3);
        width = data.getUint16(pos + 5);
        break;
      }
      pos += length;
    }
  } else if (bytes.length >= 24 && tag(0, '\x89PNG\r\n\x1a\n') && tag(12, 'IHDR')) {
    type = 'image/png';
    width = data.getUint32(16);
    height = data.getUint32(20);
  } else if (bytes.length >= 30 && tag(0, 'RIFF') && tag(8, 'WEBP')) {
    type = 'image/webp';
    if (tag(12, 'VP8X')) {
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536;
    } else if (tag(12, 'VP8L') && bytes[20] === 0x2f) {
      const packed = data.getUint32(21, true);
      width = 1 + (packed & 0x3fff);
      height = 1 + ((packed >>> 14) & 0x3fff);
    } else if (tag(12, 'VP8 ') && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = data.getUint16(26, true) & 0x3fff;
      height = data.getUint16(28, true) & 0x3fff;
    }
  } else {
    throw new Error(unsupported);
  }

  if (!width || !height) throw new Error(damaged);
  if (width * height > MAX_PIXELS) throw new Error('Choose a photo of 64 megapixels or less.');
  return { width, height, type };
}

function makeCanvas(size: Size) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('This browser could not prepare the photo.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.width, size.height);
  return { canvas, ctx };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error(damaged);
  }
  return image;
}

function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, source: Size, frame: Size) {
  const crop = coverCrop(source, frame);
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, frame.width, frame.height);
}

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('This browser could not save the photo.'));
    }, 'image/jpeg', 0.9);
  });
}

async function normalize(image: CanvasImageSource, source: Size, frame: Size, mirrored: boolean): Promise<Photo> {
  const size = fitSize(frame, PHOTO_EDGE);
  const { canvas, ctx } = makeCanvas(size);
  if (mirrored) {
    ctx.translate(size.width, 0);
    ctx.scale(-1, 1);
  }
  drawCover(ctx, image, source, size);
  const blob = await jpegBlob(canvas);
  const photo = { ...size, url: URL.createObjectURL(blob) };
  localImages.set(photo, blob);
  return photo;
}

export async function readPhoto(file: File, frame?: Size): Promise<Photo> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a photo smaller than 32 MB.');
  const { type } = inspectPhotoHeader(new Uint8Array(await file.arrayBuffer()));
  const url = URL.createObjectURL(file.slice(0, file.size, type));
  try {
    const image = await loadImage(url);
    // Modern image decoders apply EXIF orientation before reporting the intrinsic size or drawing.
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    if (!size.width || !size.height || size.width * size.height > MAX_PIXELS) throw new Error(damaged);
    return await normalize(image, size, frame ?? size, false);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function capturePhoto(video: HTMLVideoElement, frame: Size, mirrored = false): Promise<Photo> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error('The camera is warming up. Try the shutter again in a moment.');
  }
  return normalize(video, { width: video.videoWidth, height: video.videoHeight }, frame, mirrored);
}

export function releasePhoto(photo: Photo) {
  URL.revokeObjectURL(photo.url);
  localImages.delete(photo);
}

function requireLocalPhoto(photo: Photo) {
  if (!photo.url.startsWith('blob:')) throw new Error('Choose a photo from this device.');
}

function embeddedJpeg(photo: Photo): Promise<string> {
  const blob = localImages.get(photo);
  if (!blob) throw new Error('Choose a photo from this device.');
  // Reuse the normalized pixels and strip source metadata only once.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The interactive comparison could not be saved.'));
    reader.readAsDataURL(blob);
  });
}

export async function exportSlider(before: Photo, after: Photo, position = 50): Promise<Blob> {
  const [oldImage, newImage] = await Promise.all([embeddedJpeg(before), embeddedJpeg(after)]);
  const split = Number.isFinite(position) ? Math.round(Math.max(0, Math.min(position, 100))) : 50;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Same Frame · Then and now</title>
<style>*{box-sizing:border-box}body{margin:0;background:#181b18;color:#faf6e9;font:16px/1.45 system-ui,sans-serif}
main{width:min(100%,64rem);margin:0 auto;padding:1.25rem}h1{font:normal 2rem/1.1 Georgia,serif;margin:0 0 1rem}
figure{position:relative;margin:0 auto;aspect-ratio:${before.width}/${before.height};max-width:min(100%,calc(70vh * ${before.width} / ${before.height}));background:#222;overflow:hidden;cursor:ew-resize;touch-action:pan-y}
img{position:absolute;width:100%;height:100%;inset:0;object-fit:cover;pointer-events:none}
.then{clip-path:inset(0 calc(100% - var(--split)) 0 0)}.rule{position:absolute;left:var(--split);inset-block:0;border-left:2px solid white;pointer-events:none}
label{display:block;margin:1rem 0 .25rem}input{width:100%;accent-color:#eac17a}footer{display:flex;justify-content:space-between}</style></head>
<body><main><h1>Same Frame</h1><figure id="photos" style="--split:${split}%">
<img src="${newImage}" alt="Recreated photo"><img class="then" src="${oldImage}" alt="Original photo"><span class="rule"></span>
</figure><label for="split">Drag across the photos or use the slider to compare</label>
<input id="split" type="range" min="0" max="100" value="${split}" aria-valuetext="${split}% original photo">
<footer><span>Then</span><span>Now</span></footer></main>
<script>
const range=document.getElementById('split'),figure=document.getElementById('photos');
function reveal(){figure.style.setProperty('--split',range.value+'%');range.setAttribute('aria-valuetext',range.value+'% original photo')}
function drag(e){const bounds=figure.getBoundingClientRect();range.value=String(100*(e.clientX-bounds.left)/bounds.width);reveal()}
range.addEventListener('input',reveal);
figure.addEventListener('pointerdown',e=>{if(e.button===0){figure.setPointerCapture(e.pointerId);drag(e)}});
figure.addEventListener('pointermove',e=>{if(figure.hasPointerCapture(e.pointerId))drag(e)});
</script>
</body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

async function framePixels(photo: Photo, frame: Size): Promise<Uint8ClampedArray> {
  requireLocalPhoto(photo);
  const image = await loadImage(photo.url);
  const { ctx } = makeCanvas(frame);
  drawCover(ctx, image, photo, frame);
  return ctx.getImageData(0, 0, frame.width, frame.height).data;
}

export async function exportGif(before: Photo, after: Photo): Promise<Blob> {
  const size = fitSize(before, GIF_EDGE);
  const frames = await Promise.all([framePixels(before, size), framePixels(after, size)]);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' });
    const fail = () => {
      worker.terminate();
      reject(new Error('The GIF could not be created. Try again or save the interactive comparison.'));
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      worker.terminate();
      resolve(new Blob([event.data], { type: 'image/gif' }));
    };
    worker.postMessage({ ...size, frames }, frames.map(frame => frame.buffer));
  });
}
