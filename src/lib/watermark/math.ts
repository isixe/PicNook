const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const DCT_NORM = new Float64Array(8);
const DCT_COS = new Float64Array(64);
for (let u = 0; u < 8; u += 1) {
  DCT_NORM[u] = u === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
  for (let x = 0; x < 8; x += 1) {
    DCT_COS[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

export function dctNorm(u: number): number {
  return DCT_NORM[u];
}

export function dctCos(u: number, x: number): number {
  return DCT_COS[u * 8 + x];
}

export function dct2(block: ArrayLike<number>): Float64Array {
  const out = new Float64Array(64);
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) {
        const cv = DCT_NORM[v] * DCT_COS[v * 8 + y];
        for (let x = 0; x < 8; x += 1) {
          sum += block[y * 8 + x] * DCT_NORM[u] * DCT_COS[u * 8 + x] * cv;
        }
      }
      out[v * 8 + u] = sum;
    }
  }
  return out;
}

export function idct2(coeffs: ArrayLike<number>): Float64Array {
  const out = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let sum = 0;
      for (let v = 0; v < 8; v += 1) {
        const cv = DCT_NORM[v] * DCT_COS[v * 8 + y];
        for (let u = 0; u < 8; u += 1) {
          sum += coeffs[v * 8 + u] * DCT_NORM[u] * DCT_COS[u * 8 + x] * cv;
        }
      }
      out[y * 8 + x] = sum;
    }
  }
  return out;
}

export function rgbToYcbcr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

export function ycbcrToRgb(y: number, cb: number, cr: number): [number, number, number] {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [r, g, b];
}

export function resizePlane(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  if (srcW === dstW && srcH === dstH) {
    return src.slice();
  }
  const out = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let y = 0; y < dstH; y += 1) {
    const sy = Math.min(srcH - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < dstW; x += 1) {
      const sx = Math.min(srcW - 1, Math.max(0, (x + 0.5) * scaleX - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = sx - x0;
      const top = src[y0 * srcW + x0] * (1 - wx) + src[y0 * srcW + x1] * wx;
      const bottom = src[y1 * srcW + x0] * (1 - wx) + src[y1 * srcW + x1] * wx;
      out[y * dstW + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return out;
}
