const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function div(a: number, b: number): number {
  if (b === 0) throw new Error('rs division by zero');
  if (a === 0) return 0;
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

function pow(a: number, n: number): number {
  if (a === 0) return 0;
  const e = (((LOG[a] * n) % 255) + 255) % 255;
  return EXP[e];
}

function inverse(a: number): number {
  if (a === 0) throw new Error('rs inverse of zero');
  return EXP[255 - LOG[a]];
}

function polyScale(p: number[], x: number): number[] {
  return p.map((c) => mul(c, x));
}

function polyAdd(p: number[], q: number[]): number[] {
  const r = new Array<number>(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i += 1) r[i + r.length - p.length] = p[i];
  for (let i = 0; i < q.length; i += 1) r[i + r.length - q.length] ^= q[i];
  return r;
}

function polyMul(p: number[], q: number[]): number[] {
  const r = new Array<number>(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j += 1) {
    for (let i = 0; i < p.length; i += 1) {
      r[i + j] ^= mul(p[i], q[j]);
    }
  }
  return r;
}

function polyEval(poly: number[], x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i += 1) {
    y = mul(y, x) ^ poly[i];
  }
  return y;
}

function polyDiv(dividend: number[], divisor: number[]): [number[], number[]] {
  const out = dividend.slice();
  const sep = divisor.length - 1;
  for (let i = 0; i < dividend.length - sep; i += 1) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 1; j < divisor.length; j += 1) {
        if (divisor[j] !== 0) out[i + j] ^= mul(divisor[j], coef);
      }
    }
  }
  return [out.slice(0, out.length - sep), out.slice(out.length - sep)];
}

function generatorPoly(nsym: number): number[] {
  let g = [1];
  for (let i = 0; i < nsym; i += 1) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j += 1) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  const gen = generatorPoly(nsym);
  const out = new Uint8Array(data.length + nsym);
  out.set(data, 0);
  for (let i = 0; i < data.length; i += 1) {
    const coef = out[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) {
        out[i + j] ^= mul(gen[j], coef);
      }
    }
  }
  const result = new Uint8Array(data.length + nsym);
  result.set(data, 0);
  result.set(out.subarray(data.length), data.length);
  return result;
}

function calcSyndromes(msg: number[], nsym: number): number[] {
  const synd = [0];
  for (let i = 0; i < nsym; i += 1) {
    synd.push(polyEval(msg, EXP[i]));
  }
  return synd;
}

function findErrorLocator(synd: number[], nsym: number): number[] {
  let errLoc = [1];
  let oldLoc = [1];
  const syndShift = synd.length - nsym;
  for (let i = 0; i < nsym; i += 1) {
    const k = i + syndShift;
    let delta = synd[k];
    for (let j = 1; j < errLoc.length; j += 1) {
      delta ^= mul(errLoc[errLoc.length - 1 - j], synd[k - j]);
    }
    const oldExtended = oldLoc.concat([0]);
    oldLoc = oldExtended;
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, inverse(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length > 0 && errLoc[0] === 0) errLoc.shift();
  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) throw new Error('rs too many errors');
  return errLoc;
}

function findErrors(errLoc: number[], nmess: number): number[] {
  const errs = errLoc.length - 1;
  const errPos: number[] = [];
  for (let i = 0; i < nmess; i += 1) {
    if (polyEval(errLoc, EXP[i % 255]) === 0) {
      errPos.push(nmess - 1 - i);
    }
  }
  if (errPos.length !== errs) throw new Error('rs error positions mismatch');
  return errPos;
}

function findErrataLocator(coefPos: number[]): number[] {
  let eLoc = [1];
  for (const pos of coefPos) {
    eLoc = polyMul(eLoc, polyAdd([1], [pow(2, pos), 0]));
  }
  return eLoc;
}

function findErrorEvaluator(synd: number[], errLoc: number[], nsym: number): number[] {
  const divisor = [1].concat(new Array<number>(nsym + 1).fill(0));
  return polyDiv(polyMul(synd, errLoc), divisor)[1];
}

function correctErrata(msg: number[], synd: number[], errPos: number[]): number[] {
  const coefPos = errPos.map((p) => msg.length - 1 - p);
  const errLoc = findErrataLocator(coefPos);
  const reversedSynd = synd.slice().reverse();
  const errEval = findErrorEvaluator(reversedSynd, errLoc, errLoc.length - 1).reverse();
  const xPos: number[] = [];
  for (const pos of coefPos) {
    xPos.push(pow(2, -(255 - pos)));
  }
  const e = new Array<number>(msg.length).fill(0);
  for (let i = 0; i < xPos.length; i += 1) {
    const xiInv = inverse(xPos[i]);
    let errLocPrime = 1;
    for (let j = 0; j < xPos.length; j += 1) {
      if (j !== i) errLocPrime = mul(errLocPrime, 1 ^ mul(xiInv, xPos[j]));
    }
    let y = polyEval(errEval.slice().reverse(), xiInv);
    y = mul(pow(xPos[i], 1), y);
    e[errPos[i]] = div(y, errLocPrime);
  }
  return polyAdd(msg, e);
}

export function rsDecode(msg: Uint8Array, nsym: number): Uint8Array {
  if (msg.length > 255) throw new Error('rs message too long');
  let out = Array.from(msg);
  const synd = calcSyndromes(out, nsym);
  if (synd.every((s) => s === 0)) {
    return msg.slice(0, msg.length - nsym);
  }
  const errLoc = findErrorLocator(synd, nsym);
  const errPos = findErrors(errLoc.slice().reverse(), out.length);
  out = correctErrata(out, synd, errPos);
  const check = calcSyndromes(out, nsym);
  if (check.some((s) => s !== 0)) throw new Error('rs could not correct message');
  return Uint8Array.from(out.slice(0, out.length - nsym));
}
