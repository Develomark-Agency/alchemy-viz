/**
 * Reads values written by V8's ValueSerializer, the format workerd uses for
 * Durable Object storage (`ctx.storage.put`). Bun runs on JavaScriptCore, so
 * `node:v8`'s `deserialize` can't read them; this covers the structured-clone
 * types storage can hold.
 *
 * Format reference: v8/src/objects/value-serializer.cc.
 */

const decoder = new TextDecoder();
const latin1 = new TextDecoder("latin1");
const utf16 = new TextDecoder("utf-16le");

/** A value V8 wrote that this reader doesn't decode (a host object, a WASM module, ...). */
export class Unsupported {
  constructor(readonly tag: string) {}
  toJSON() {
    return `[unsupported V8 value '${this.tag}']`;
  }
}

class Reader {
  pos = 0;
  version = 15;
  readonly refs: unknown[] = [];
  readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  byte() {
    if(this.pos >= this.bytes.length) throw new Error("Unexpected end of V8 data");
    return this.bytes[this.pos++]!;
  }

  peek() {
    return this.bytes[this.pos];
  }

  varint() {
    let result = 0;
    let shift = 0;
    for(;;) {
      const b = this.byte();
      result += (b & 0x7f) * 2 ** shift;
      if(!(b & 0x80)) return result;
      shift += 7;
    }
  }

  zigzag() {
    const n = this.varint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }

  double() {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  take(n: number) {
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  skipPadding() {
    while(this.peek() === 0x00) this.pos++;
  }
}

function readBigInt(r: Reader) {
  const bitfield = r.varint();
  const negative = bitfield & 1;
  const bytes = r.take(Math.floor(bitfield / 2));
  let n = 0n;
  for(let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]!);
  return negative ? -n : n;
}

function readString(r: Reader, tag: number): string {
  const len = r.varint();
  const bytes = r.take(len);
  if(tag === 0x22) return latin1.decode(bytes); // '"' one-byte
  if(tag === 0x63) return utf16.decode(bytes); // 'c' two-byte
  return decoder.decode(bytes); // 'S' utf-8
}

const TYPED: Record<string, (b: ArrayBuffer, o: number, l: number) => unknown> = {
  B: (b, o, l) => new Uint8Array(b, o, l),
  b: (b, o, l) => new Int8Array(b, o, l),
  C: (b, o, l) => new Uint8ClampedArray(b, o, l),
  W: (b, o, l) => new Uint16Array(b.slice(o, o + l)),
  w: (b, o, l) => new Int16Array(b.slice(o, o + l)),
  D: (b, o, l) => new Uint32Array(b.slice(o, o + l)),
  d: (b, o, l) => new Int32Array(b.slice(o, o + l)),
  f: (b, o, l) => new Float32Array(b.slice(o, o + l)),
  F: (b, o, l) => new Float64Array(b.slice(o, o + l)),
  q: (b, o, l) => new BigInt64Array(b.slice(o, o + l)),
  Q: (b, o, l) => new BigUint64Array(b.slice(o, o + l)),
  "?": (b, o, l) => new DataView(b, o, l)
};

function readValue(r: Reader): unknown {
  r.skipPadding();
  const tag = r.byte();
  const c = String.fromCharCode(tag);
  switch(c) {
    case "_":
      return undefined;
    case "0":
      return null;
    case "T":
      return true;
    case "F":
      return false;
    case "I":
      return r.zigzag();
    case "U":
      return r.varint();
    case "N":
      return r.double();
    case "Z":
      return readBigInt(r);
    case "\"":
    case "c":
    case "S":
      return readString(r, tag);
    case "^":
      return r.refs[r.varint()];
    case "o": {
      const obj: Record<string, unknown> = {};
      r.refs.push(obj);
      readProperties(r, obj, 0x7b); // '{'
      r.varint();
      return obj;
    }
    case "A": {
      const length = r.varint();
      const arr: unknown[] = Array.from({ length });
      r.refs.push(arr);
      for(let i = 0; i < length; i++) {
        r.skipPadding();
        if(r.peek() === 0x2d) { // '-' hole
          r.pos++;
          continue;
        }
        arr[i] = readValue(r);
      }
      readProperties(r, arr as never, 0x24); // '$'
      r.varint();
      r.varint();
      return arr;
    }
    case "a": {
      const arr: unknown[] = Array.from({ length: r.varint() });
      r.refs.push(arr);
      readProperties(r, arr as never, 0x40); // '@'
      r.varint();
      r.varint();
      return arr;
    }
    case "D": {
      const date = new Date(r.double());
      r.refs.push(date);
      return date;
    }
    case "y":
    case "x":
    case "n":
    case "z":
    case "s": {
      const boxed = c === "y" ? true : c === "x" ? false : c === "n" ? r.double() : c === "z" ? readBigInt(r) : readString(r, r.byte());
      r.refs.push(boxed);
      return boxed;
    }
    case "R": {
      const source = readString(r, r.byte());
      const bits = r.varint();
      const flags = ["g", "i", "m", "y", "u", "s", "d", "v"].filter((_, i) => bits & (1 << i)).join("");
      let re: RegExp | string;
      try {
        re = new RegExp(source, flags);
      } catch {
        re = `/${source}/${flags}`;
      }
      r.refs.push(re);
      return re;
    }
    case ";": {
      const map = new Map();
      r.refs.push(map);
      for(;;) {
        r.skipPadding();
        if(r.peek() === 0x3a) { // ':'
          r.pos++;
          r.varint();
          return map;
        }
        const k = readValue(r);
        map.set(k, readValue(r));
      }
    }
    case "'": {
      const set = new Set();
      r.refs.push(set);
      for(;;) {
        r.skipPadding();
        if(r.peek() === 0x2c) { // ','
          r.pos++;
          r.varint();
          return set;
        }
        set.add(readValue(r));
      }
    }
    case "B": {
      const len = r.varint();
      const copy = r.take(len).slice();
      const buffer = copy.buffer;
      r.refs.push(buffer);
      if(r.peek() === 0x56) return readView(r, buffer); // 'V'
      return buffer;
    }
    case "V":
      return readView(r, new ArrayBuffer(0));
    case "r": {
      const err: { name: string, message?: string, stack?: string } = { name: "Error" };
      r.refs.push(err);
      for(;;) {
        const t = String.fromCharCode(r.byte());
        if(t === ".") return Object.assign(new Error(err.message), err);
        if(t === "E") err.name = "EvalError";
        else if(t === "R") err.name = "RangeError";
        else if(t === "F") err.name = "ReferenceError";
        else if(t === "S") err.name = "SyntaxError";
        else if(t === "T") err.name = "TypeError";
        else if(t === "U") err.name = "URIError";
        else if(t === "m") err.message = readValue(r) as string;
        else if(t === "s") err.stack = readValue(r) as string;
        else if(t === "c") readValue(r);
        else throw new Error(`Unknown error field '${t}'`);
      }
    }
    default:
      throw new Unsupported(c);
  }
}

function readView(r: Reader, buffer: ArrayBuffer) {
  r.byte(); // 'V'
  const sub = String.fromCharCode(r.byte());
  const offset = r.varint();
  const length = r.varint();
  // Version 14+ writes view flags after the length.
  if(r.version >= 14) r.varint();
  const make = TYPED[sub];
  const view = make ? make(buffer, offset, length) : new Unsupported(`V${sub}`);
  r.refs.push(view);
  return view;
}

function readProperties(r: Reader, target: Record<string, unknown>, end: number) {
  for(;;) {
    r.skipPadding();
    if(r.peek() === end) {
      r.pos++;
      return;
    }
    const key = readValue(r);
    target[String(key)] = readValue(r);
  }
}

/** Decodes one V8-serialized value. Throws on data it can't read. */
export function deserializeV8(bytes: Uint8Array): unknown {
  const r = new Reader(bytes);
  if(r.peek() === 0xff) {
    r.pos++;
    r.version = r.varint();
  }
  return readValue(r);
}
