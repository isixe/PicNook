export type Rng = () => number;

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const h = xmur3(seed);
  const rng = sfc32(h(), h(), h(), h());
  for (let i = 0; i < 16; i += 1) rng();
  return rng;
}

export function keystreamBits(seed: string, length: number): Uint8Array {
  const rng = createRng(`wm-bits:${seed}`);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = rng() < 0.5 ? 0 : 1;
  }
  return out;
}

export function keyedUnit(seed: string, index: number): number {
  const rng = createRng(`wm-unit:${seed}:${index}`);
  return rng();
}
