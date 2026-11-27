import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverCrop, fitSize, inspectPhotoHeader } from '../src/media.ts';

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set([137,80,78,71,13,10,26,10]);
  bytes.writeUInt32BE(13,8);
  bytes.write('IHDR',12);
  bytes.writeUInt32BE(width,16);
  bytes.writeUInt32BE(height,20);
  return bytes;
}

test('rejects disguised files, zero dimensions and images that exceed the decoding budget', () => {
  for (const bytes of [Buffer.from('<svg></svg>'), Buffer.from([0xff,0xd8,0xff,0xe1,0,1,0]), pngHeader(0,400)]) {
    assert.throws(() => inspectPhotoHeader(bytes));
  }
  assert.throws(() => inspectPhotoHeader(pngHeader(10_000,10_000)), /megapixels/);
  assert.deepEqual(inspectPhotoHeader(pngHeader(6000,8000)), {width:6000,height:8000,type:'image/png'});
});

test('reads actual JPEG and WebP dimensions independent of file extension', () => {
  const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x03,0x00,0xff,0xc2,0x00,0x08,0x08,0x01,0x00,0x00,0x80,0x01]);
  assert.deepEqual(inspectPhotoHeader(jpeg), {width:128,height:256,type:'image/jpeg'});
  for (const encoding of ['VP8X','VP8L','VP8 ']) {
    const webp = Buffer.alloc(30);
    webp.write('RIFF'); webp.write('WEBP',8); webp.write(encoding,12);
    if (encoding === 'VP8X') {
      webp.writeUIntLE(1599,24,3); webp.writeUIntLE(1199,27,3);
    } else if (encoding === 'VP8L') {
      webp[20]=0x2f; webp.writeUInt32LE(1599+(1199<<14),21);
    } else {
      webp.set([0x9d,0x01,0x2a],23); webp.writeUInt16LE(1600,26); webp.writeUInt16LE(1200,28);
    }
    assert.deepEqual(inspectPhotoHeader(webp), {width:1600,height:1200,type:'image/webp'});
  }
});

test('matches CSS center-cover cropping while fitting portrait, landscape and smaller sources', () => {
  assert.deepEqual(coverCrop({width:1600,height:900},{width:300,height:400}), {x:462.5,y:0,width:675,height:900});
  assert.deepEqual(coverCrop({width:900,height:1600},{width:400,height:300}), {x:0,y:462.5,width:900,height:675});
  assert.deepEqual(fitSize({width:6000,height:4000},1920), {width:1920,height:1280});
  assert.deepEqual(fitSize({width:123,height:45},1920), {width:123,height:45});
  assert.deepEqual(fitSize({width:32768,height:1},720), {width:720,height:1});
});
