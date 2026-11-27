import { GIFEncoder, applyPalette, quantize } from 'gifenc';

interface EncodeRequest {
  width: number;
  height: number;
  frames: Uint8ClampedArray[];
}

// Quantization can take noticeable time on a phone. Keep it outside the UI thread.
self.onmessage = ({ data }: MessageEvent<EncodeRequest>) => {
  const gif = GIFEncoder();
  for (const rgba of data.frames) {
    const palette = quantize(rgba, 256);
    const pixels = applyPalette(rgba, palette);
    gif.writeFrame(pixels, data.width, data.height, { palette, delay: 1200, repeat: 0 });
  }
  gif.finish();
  const bytes = gif.bytes();
  self.postMessage(bytes.buffer, { transfer: [bytes.buffer] });
};
