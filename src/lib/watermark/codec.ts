import { keystreamBits } from './prng';
import { crc32 } from './math';

export const MESSAGE_LEN = 207;
export const RS_PARITY = 48;
export const CODEWORD_LEN = MESSAGE_LEN + RS_PARITY;
export const TILE_BITS = 2048;
export const SYNC_BITS = 128;

const SYNC_BYTES = (() => {
  const bits = keystreamBits('picnook-sync-v1', SYNC_BITS);
  const bytes = new Uint8Array(SYNC_BITS / 8);
  for (let i = 0; i < bits.length; i += 1) {
    bytes[i >> 3] |= bits[i] << (7 - (i & 7));
  }
  return bytes;
})();

const MAGIC_0 = 0x50;
const MAGIC_1 = 0x57;
const VERSION = 1;
const FLAG_TEXT = 1;
const FLAG_LOGO = 2;
const HEADER_OFFSET = SYNC_BITS / 8;
const CRC_OFFSET = HEADER_OFFSET + 8;
const DATA_OFFSET = CRC_OFFSET + 4;

export interface LogoData {
  width: number;
  height: number;
  bits: Uint8Array;
}

export interface PayloadInput {
  text: string;
  logo?: LogoData;
}

export interface DecodedPayload {
  text: string;
  logo?: LogoData;
}

export function syncBytes(): Uint8Array {
  return SYNC_BYTES.slice();
}

export function messageCapacity(): number {
  return MESSAGE_LEN - DATA_OFFSET;
}

export function packPayload(input: PayloadInput): Uint8Array {
  const msg = new Uint8Array(MESSAGE_LEN);
  msg.set(SYNC_BYTES, 0);
  msg[HEADER_OFFSET] = MAGIC_0;
  msg[HEADER_OFFSET + 1] = MAGIC_1;
  msg[HEADER_OFFSET + 2] = VERSION;
  const textBytes = new TextEncoder().encode(input.text);
  const logo = input.logo;
  let flags = 0;
  if (textBytes.length > 0) flags |= FLAG_TEXT;
  if (logo && logo.width > 0 && logo.height > 0) flags |= FLAG_LOGO;
  msg[HEADER_OFFSET + 3] = flags;
  msg[HEADER_OFFSET + 4] = (textBytes.length >> 8) & 0xff;
  msg[HEADER_OFFSET + 5] = textBytes.length & 0xff;
  msg[HEADER_OFFSET + 6] = logo ? logo.width & 0xff : 0;
  msg[HEADER_OFFSET + 7] = logo ? logo.height & 0xff : 0;
  let cursor = DATA_OFFSET;
  if (logo && logo.bits.length > 0) {
    msg.set(logo.bits.subarray(0, messageCapacity()), cursor);
    cursor += logo.bits.length;
  }
  msg.set(textBytes.subarray(0, MESSAGE_LEN - cursor), cursor);
  const crc = crc32(msg.subarray(HEADER_OFFSET));
  msg[CRC_OFFSET] = (crc >>> 24) & 0xff;
  msg[CRC_OFFSET + 1] = (crc >>> 16) & 0xff;
  msg[CRC_OFFSET + 2] = (crc >>> 8) & 0xff;
  msg[CRC_OFFSET + 3] = crc & 0xff;
  return msg;
}

export function unpackPayload(msg: Uint8Array): DecodedPayload | null {
  if (msg.length < MESSAGE_LEN) return null;
  if (msg[HEADER_OFFSET] !== MAGIC_0 || msg[HEADER_OFFSET + 1] !== MAGIC_1) return null;
  const scratch = msg.slice();
  scratch[CRC_OFFSET] = 0;
  scratch[CRC_OFFSET + 1] = 0;
  scratch[CRC_OFFSET + 2] = 0;
  scratch[CRC_OFFSET + 3] = 0;
  const expected = crc32(scratch.subarray(HEADER_OFFSET));
  const actual =
    ((msg[CRC_OFFSET] << 24) |
      (msg[CRC_OFFSET + 1] << 16) |
      (msg[CRC_OFFSET + 2] << 8) |
      msg[CRC_OFFSET + 3]) >>>
    0;
  if (expected !== actual) return null;
  const flags = msg[HEADER_OFFSET + 3];
  const textLen = (msg[HEADER_OFFSET + 4] << 8) | msg[HEADER_OFFSET + 5];
  const logoW = msg[HEADER_OFFSET + 6];
  const logoH = msg[HEADER_OFFSET + 7];
  let cursor = DATA_OFFSET;
  let logo: LogoData | undefined;
  if (flags & FLAG_LOGO && logoW > 0 && logoH > 0) {
    const logoBytes = Math.ceil((logoW * logoH) / 8);
    logo = { width: logoW, height: logoH, bits: msg.slice(cursor, cursor + logoBytes) };
    cursor += logoBytes;
  }
  let text = '';
  if (flags & FLAG_TEXT && textLen > 0) {
    const slice = msg.slice(cursor, cursor + textLen);
    text = new TextDecoder().decode(slice);
  }
  return { text, logo };
}

export function bytesToBits(bytes: Uint8Array, bitCount: number, out: Uint8Array): void {
  for (let i = 0; i < bitCount; i += 1) {
    out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
}

export function bitsToBytes(bits: Uint8Array, byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount * 8; i += 1) {
    if (bits[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bytes;
}

export function logoToBits(width: number, height: number, pixels: Uint8Array): LogoData {
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  for (let i = 0; i < width * height; i += 1) {
    if (pixels[i]) bits[i >> 3] |= 1 << (7 - (i & 7));
  }
  return { width, height, bits };
}
