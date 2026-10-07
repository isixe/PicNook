import { rsEncode, rsDecode } from './rs';
import {
  TILE_BITS,
  SYNC_BITS,
  packPayload,
  unpackPayload,
  bytesToBits,
  bitsToBytes,
  syncBytes,
  type LogoData,
  type PayloadInput,
  type DecodedPayload,
} from './codec';
import { keystreamBits, keyedUnit } from './prng';
import { dctCos, dctNorm, resizePlane } from './math';

export type { LogoData, DecodedPayload } from './codec';

const BLOCK = 8;
const TILE_W = 64;
const TILE_H = 32;
const MAX_ANALYSIS = 2000;
const MIN_ANALYSIS = 128;
const PILOT_PERIOD = 16;
const PILOT_AMPLITUDE = 4;
const PILOT_MIN_SCALE = 0.4;
const PILOT_MAX_SCALE = 2.5;

const COEFFS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 1],
  [1, 2],
];

function pilotPhase(password: string, index: number): number {
  return keyedUnit(`${password}:pilot`, index) * Math.PI * 2;
}

function pilotValue(password: string, x: number, y: number): number {
  const f = 1 / PILOT_PERIOD;
  const phi1 = pilotPhase(password, 0);
  const phi2 = pilotPhase(password, 1);
  const a1 = Math.PI * 2 * f * (x + y) + phi1;
  const a2 = Math.PI * 2 * f * (x - y) + phi2;
  return PILOT_AMPLITUDE * 0.5 * (Math.cos(a1) + Math.cos(a2));
}

export const STRENGTH_LEVELS: ReadonlyArray<{ delta: number; labelKey: string }> = [
  { delta: 10, labelKey: 'light' },
  { delta: 18, labelKey: 'medium' },
  { delta: 30, labelKey: 'strong' },
];

export function deltaFromStrength(strength: number): number {
  const clamped = Math.min(99, Math.max(0, strength));
  const idx = Math.min(
    STRENGTH_LEVELS.length - 1,
    Math.floor((clamped / 100) * STRENGTH_LEVELS.length),
  );
  return STRENGTH_LEVELS[idx].delta;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface EmbedOptions {
  password: string;
  strength: number;
  text: string;
  logo?: LogoData;
}

export interface DetectOptions {
  password: string;
  strength?: number;
  maxScaleSearch?: number;
  scales?: number[];
  phases?: Array<[number, number]>;
}

export interface DetectResult {
  found: boolean;
  text: string;
  logo?: LogoData;
  confidence: number;
  scale: number;
  phaseX: number;
  phaseY: number;
  shift: number;
}

function luminance(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return out;
}

function blockCoefficient(
  plane: Float32Array,
  width: number,
  x0: number,
  y0: number,
  u: number,
  v: number,
): number {
  const cu = new Float64Array(BLOCK);
  const cv = new Float64Array(BLOCK);
  for (let i = 0; i < BLOCK; i += 1) {
    cu[i] = dctCos(u, i);
    cv[i] = dctCos(v, i);
  }
  let sum = 0;
  for (let y = 0; y < BLOCK; y += 1) {
    const base = (y0 + y) * width + x0;
    for (let x = 0; x < BLOCK; x += 1) {
      sum += plane[base + x] * cu[x] * cv[y];
    }
  }
  return sum * dctNorm(u) * dctNorm(v);
}

function quantize(bit: number, coef: number, delta: number): number {
  let q = Math.round(coef / delta);
  if ((q & 1) !== (bit & 1)) {
    q += coef - q * delta > 0 ? 1 : -1;
  }
  return q * delta;
}

function buildCodewordBands(password: string, input: PayloadInput): Uint8Array {
  const message = packPayload(input);
  const codeword = rsEncode(message, 48);
  const bits = bitsToCodewordBits(codeword);
  const keystream = keystreamBits(`${password}:bits`, TILE_BITS);
  const band = new Uint8Array(TILE_BITS);
  for (let i = 0; i < TILE_BITS; i += 1) {
    band[i] = bits[i] ^ keystream[i];
  }
  return band;
}

function bitsToCodewordBits(codeword: Uint8Array): Uint8Array {
  const bits = new Uint8Array(TILE_BITS);
  bytesToBits(codeword, codeword.length * 8, bits);
  return bits;
}

function symbolOf(bit: number): number {
  return bit ? -1 : 1;
}

export function embed(image: RgbaImage, options: EmbedOptions): RgbaImage {
  const { width, height } = image;
  const delta = deltaFromStrength(options.strength);
  const band = buildCodewordBands(options.password, { text: options.text, logo: options.logo });
  const y = luminance(image.data, width, height);
  const modify = new Float32Array(width * height);

  const cols = Math.floor(width / BLOCK);
  const rows = Math.floor(height / BLOCK);
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      const tileIndex = ((by % TILE_H) * TILE_W + (bx % TILE_W)) % TILE_BITS;
      const bit = band[tileIndex];
      const x0 = bx * BLOCK;
      const y0 = by * BLOCK;
      for (let c = 0; c < COEFFS.length; c += 1) {
        const [u, v] = COEFFS[c];
        const coef = blockCoefficient(y, width, x0, y0, u, v);
        const diff = quantize(bit, coef, delta) - coef;
        if (diff === 0) continue;
        const nu = dctNorm(u);
        const nv = dctNorm(v);
        const cu = new Float64Array(BLOCK);
        const cv = new Float64Array(BLOCK);
        for (let i = 0; i < BLOCK; i += 1) {
          cu[i] = dctCos(u, i);
          cv[i] = dctCos(v, i);
        }
        for (let dy = 0; dy < BLOCK; dy += 1) {
          const rowBase = (y0 + dy) * width + x0;
          const cy = nv * cv[dy];
          for (let dx = 0; dx < BLOCK; dx += 1) {
            modify[rowBase + dx] += diff * nu * cu[dx] * cy;
          }
        }
      }
    }
  }

  const out = new Uint8ClampedArray(image.data);
  for (let yix = 0; yix < height; yix += 1) {
    for (let xix = 0; xix < width; xix += 1) {
      const idx = yix * width + xix;
      const p = idx * 4;
      const d = modify[idx] + pilotValue(options.password, xix, yix);
      out[p] = image.data[p] + d;
      out[p + 1] = image.data[p + 1] + d;
      out[p + 2] = image.data[p + 2] + d;
    }
  }
  return { width, height, data: out };
}

function buildCoefficientMap(
  plane: Float32Array,
  width: number,
  height: number,
  u: number,
  v: number,
): Float32Array {
  const cu = new Float64Array(BLOCK);
  const cv = new Float64Array(BLOCK);
  for (let i = 0; i < BLOCK; i += 1) {
    cu[i] = dctCos(u, i);
    cv[i] = dctCos(v, i);
  }
  const row = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const base = y * width;
    for (let x = 0; x < width; x += 1) {
      let s = 0;
      for (let dx = 0; dx < BLOCK; dx += 1) {
        const xx = x + dx;
        s += cu[dx] * plane[base + (xx < width ? xx : width - 1)];
      }
      row[base + x] = s;
    }
  }
  const out = new Float32Array(width * height);
  const scale = dctNorm(u) * dctNorm(v);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let s = 0;
      for (let dy = 0; dy < BLOCK; dy += 1) {
        const yy = y + dy;
        s += cv[dy] * row[(yy < height ? yy : height - 1) * width + x];
      }
      out[y * width + x] = s * scale;
    }
  }
  return out;
}

function pilotMagnitude(
  plane: Float32Array,
  width: number,
  height: number,
  fr: number,
  sign: number,
): number {
  const w = Math.PI * 2 * fr;
  let re = 0;
  let im = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const rowBase = y * width;
    const upBase = rowBase - width;
    const downBase = rowBase + width;
    const angY = w * sign * y;
    for (let x = 1; x < width - 1; x += 1) {
      const highPass =
        plane[rowBase + x] -
        (plane[rowBase + x - 1] +
          plane[rowBase + x + 1] +
          plane[upBase + x] +
          plane[downBase + x]) *
          0.25;
      const ang = w * x + angY;
      re += highPass * Math.cos(ang);
      im -= highPass * Math.sin(ang);
    }
  }
  return Math.sqrt(re * re + im * im);
}

function estimatePilotScale(plane: Float32Array, width: number, height: number): number {
  const longest = Math.max(width, height);
  const factor = Math.min(3, Math.max(1, Math.ceil(longest / 500)));
  let work = plane;
  let workW = width;
  let workH = height;
  if (factor > 1) {
    workW = Math.max(16, Math.round(width / factor));
    workH = Math.max(16, Math.round(height / factor));
    work = resizePlane(plane, width, height, workW, workH);
  }
  const magnitudeAt = (scale: number): number => {
    const fr = factor / PILOT_PERIOD / scale;
    if (fr > 0.45) return 0;
    return Math.max(
      pilotMagnitude(work, workW, workH, fr, 1),
      pilotMagnitude(work, workW, workH, fr, -1),
    );
  };
  let bestScale = 1;
  let bestMag = -1;
  for (let s = PILOT_MIN_SCALE; s <= PILOT_MAX_SCALE + 1e-9; s += 0.02) {
    const m = magnitudeAt(s);
    if (m > bestMag) {
      bestMag = m;
      bestScale = s;
    }
  }
  const left = magnitudeAt(bestScale - 0.02);
  const right = magnitudeAt(bestScale + 0.02);
  const denom = left - 2 * bestMag + right;
  let coarse = bestScale;
  if (Math.abs(denom) > 1e-9) {
    const offset = (0.5 * (left - right)) / denom;
    if (Math.abs(offset) <= 1) coarse = bestScale + offset * 0.02;
  }
  let fineScale = coarse;
  let fineMag = magnitudeAt(coarse);
  const step = 0.002;
  for (let s = coarse - 0.02; s <= coarse + 0.02 + 1e-9; s += step) {
    if (s < PILOT_MIN_SCALE) continue;
    const m = magnitudeAt(s);
    if (m > fineMag) {
      fineMag = m;
      fineScale = s;
    }
  }
  const fLeft = magnitudeAt(fineScale - step);
  const fRight = magnitudeAt(fineScale + step);
  const fDenom = fLeft - 2 * fineMag + fRight;
  if (Math.abs(fDenom) > 1e-9) {
    const offset = (0.5 * (fLeft - fRight)) / fDenom;
    if (Math.abs(offset) <= 1) return fineScale + offset * step;
  }
  return fineScale;
}

interface Candidate {
  score: number;
  scale: number;
  phaseX: number;
  phaseY: number;
  dx: number;
  dy: number;
  acc: Float32Array;
}

interface SyncRef {
  indices: Int32Array;
  values: Float32Array;
}

function syncReference(password: string): SyncRef {
  const keystream = keystreamBits(`${password}:bits`, TILE_BITS);
  const sync = syncBytes();
  const syncBits = new Uint8Array(SYNC_BITS);
  bytesToBits(sync, SYNC_BITS, syncBits);
  const indices = new Int32Array(SYNC_BITS);
  const values = new Float32Array(SYNC_BITS);
  for (let i = 0; i < SYNC_BITS; i += 1) {
    indices[i] = i;
    values[i] = symbolOf(syncBits[i] ^ keystream[i]);
  }
  return { indices, values };
}

function findShift(acc: Float32Array, ref: SyncRef): { dx: number; dy: number; score: number } {
  const { values } = ref;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < acc.length; i += 1) {
    const v = acc[i];
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / acc.length;
  const sigma = Math.sqrt(Math.max(sumSq / acc.length - mean * mean, 1e-9));
  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -Infinity;
  for (let dy = 0; dy < TILE_H; dy += 1) {
    let ty0 = -dy;
    if (ty0 < 0) ty0 += TILE_H;
    let ty1 = 1 - dy;
    if (ty1 < 0) ty1 += TILE_H;
    const row0 = ty0 * TILE_W;
    const row1 = ty1 * TILE_W;
    for (let dx = 0; dx < TILE_W; dx += 1) {
      let s = 0;
      for (let sx = 0; sx < TILE_W; sx += 1) {
        let tx = sx - dx;
        if (tx < 0) tx += TILE_W;
        s += values[sx] * acc[row0 + tx] + values[TILE_W + sx] * acc[row1 + tx];
      }
      if (s > bestScore) {
        bestScore = s;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }
  return { dx: bestDx, dy: bestDy, score: bestScore / (sigma * Math.sqrt(SYNC_BITS)) };
}

function accumulate(
  maps: Float32Array[],
  width: number,
  height: number,
  phaseX: number,
  phaseY: number,
  delta: number,
  acc: Float32Array,
): void {
  acc.fill(0);
  const cols = Math.floor((width - phaseX) / BLOCK);
  const rows = Math.floor((height - phaseY) / BLOCK);
  for (let by = 0; by < rows; by += 1) {
    const y0 = phaseY + by * BLOCK;
    for (let bx = 0; bx < cols; bx += 1) {
      const x0 = phaseX + bx * BLOCK;
      const tileIndex = ((by % TILE_H) * TILE_W + (bx % TILE_W)) % TILE_BITS;
      const pos = y0 * width + x0;
      let soft = 0;
      for (let c = 0; c < maps.length; c += 1) {
        soft += Math.cos((Math.PI * maps[c][pos]) / delta);
      }
      acc[tileIndex] += soft;
    }
  }
}

function decodeFromCandidate(candidate: Candidate, password: string): DecodedPayload | null {
  const keystream = keystreamBits(`${password}:bits`, TILE_BITS);
  const soft = new Float32Array(TILE_BITS);
  for (let sy = 0; sy < TILE_H; sy += 1) {
    const ty = (((sy - candidate.dy) % TILE_H) + TILE_H) % TILE_H;
    for (let sx = 0; sx < TILE_W; sx += 1) {
      const tx = (((sx - candidate.dx) % TILE_W) + TILE_W) % TILE_W;
      soft[sy * TILE_W + sx] = candidate.acc[ty * TILE_W + tx];
    }
  }
  const bits = new Uint8Array(TILE_BITS);
  for (let t = 0; t < TILE_BITS; t += 1) {
    bits[t] = (soft[t] < 0 ? 1 : 0) ^ keystream[t];
  }
  const codeword = bitsToBytes(bits, 255);
  let message: Uint8Array;
  try {
    message = rsDecode(codeword, 48);
  } catch {
    return null;
  }
  return unpackPayload(message);
}

function roundScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

interface ScaleSize {
  dstW: number;
  dstH: number;
}

export function detect(image: RgbaImage, options: DetectOptions): DetectResult {
  const { width, height } = image;
  const y = luminance(image.data, width, height);
  const levels =
    options.strength !== undefined
      ? [deltaFromStrength(options.strength)]
      : STRENGTH_LEVELS.map((l) => l.delta);
  const explicitScales = options.scales;
  const allPhases: Array<[number, number]> = options.phases ?? [];
  if (allPhases.length === 0) {
    for (let py = 0; py < BLOCK; py += 1) {
      for (let px = 0; px < BLOCK; px += 1) allPhases.push([px, py]);
    }
  }

  const sizeCache = new Map<number, ScaleSize | null>();
  const planeCache = new Map<number, Float32Array>();
  const mapCache = new Map<string, Float32Array>();

  const getSize = (scale: number): ScaleSize | null => {
    const key = roundScale(scale);
    const cached = sizeCache.get(key);
    if (cached !== undefined) return cached;
    const dstW = Math.round(width / key);
    const dstH = Math.round(height / key);
    let result: ScaleSize | null = null;
    if (
      dstW >= MIN_ANALYSIS &&
      dstH >= MIN_ANALYSIS &&
      dstW <= MAX_ANALYSIS &&
      dstH <= MAX_ANALYSIS
    ) {
      result = { dstW, dstH };
    }
    sizeCache.set(key, result);
    return result;
  };

  const getPlane = (scale: number, size: ScaleSize): Float32Array => {
    const key = roundScale(scale);
    const cached = planeCache.get(key);
    if (cached) return cached;
    const plane = key === 1 ? y : resizePlane(y, width, height, size.dstW, size.dstH);
    planeCache.set(key, plane);
    return plane;
  };

  const getMap = (scale: number, size: ScaleSize, ci: number): Float32Array => {
    const key = `${roundScale(scale)}:${ci}`;
    const cached = mapCache.get(key);
    if (cached) return cached;
    const plane = getPlane(scale, size);
    const [u, v] = COEFFS[ci];
    const map = buildCoefficientMap(plane, size.dstW, size.dstH, u, v);
    mapCache.set(key, map);
    return map;
  };

  const ref = syncReference(options.password);

  const evaluate = (
    scale: number,
    phases: Array<[number, number]>,
    subset?: readonly number[],
  ): Candidate[] => {
    const size = getSize(scale);
    if (!size) return [];
    const ciList = subset ?? COEFFS.map((_, i) => i);
    const maps = ciList.map((ci) => getMap(scale, size, ci));
    const out: Candidate[] = [];
    for (const delta of levels) {
      for (const [phaseX, phaseY] of phases) {
        const acc = new Float32Array(TILE_BITS);
        accumulate(maps, size.dstW, size.dstH, phaseX, phaseY, delta, acc);
        const { dx, dy, score } = findShift(acc, ref);
        out.push({ score, scale: roundScale(scale), phaseX, phaseY, dx, dy, acc });
      }
    }
    return out;
  };

  const candidates: Candidate[] = [];
  let scales: number[];
  if (explicitScales) {
    scales = explicitScales.map(roundScale);
  } else {
    const pilot = estimatePilotScale(y, width, height);
    const set = new Set<number>();
    for (let i = -3; i <= 3; i += 1) set.add(roundScale(pilot + i * 0.0015));
    set.add(1);
    scales = Array.from(set).filter((s) => s >= PILOT_MIN_SCALE);
  }
  for (const scale of scales) {
    candidates.push(...evaluate(scale, allPhases));
  }

  if (candidates.length === 0) {
    return { found: false, text: '', confidence: 0, scale: 1, phaseX: 0, phaseY: 0, shift: 0 };
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  for (const candidate of candidates) {
    const payload = decodeFromCandidate(candidate, options.password);
    if (payload) {
      return {
        found: true,
        text: payload.text,
        logo: payload.logo,
        confidence: candidate.score,
        scale: candidate.scale,
        phaseX: candidate.phaseX,
        phaseY: candidate.phaseY,
        shift: candidate.dy * TILE_W + candidate.dx,
      };
    }
  }

  return {
    found: false,
    text: '',
    confidence: best.score,
    scale: best.scale,
    phaseX: best.phaseX,
    phaseY: best.phaseY,
    shift: best.dy * TILE_W + best.dx,
  };
}
