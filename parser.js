/* JJS Studio parser — browser build of rbxl particle walk */
(function (root) {
'use strict';


class Buffer extends Uint8Array {
  static alloc(n) { return new Buffer(n); }
  static isBuffer(x) { return x instanceof Buffer || x instanceof Uint8Array; }
  static from(x, enc, len) {
    if (x instanceof Buffer) return x;
    if (x instanceof Uint8Array) return new Buffer(x);
    if (x instanceof ArrayBuffer) {
        if (typeof enc === 'number') return new Buffer(new Uint8Array(x, enc, len));
        return new Buffer(new Uint8Array(x));
      }
    if (typeof x === 'string') {
      if (enc === 'hex') {
        const out = new Buffer(x.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(x.slice(i * 2, i * 2 + 2), 16);
        return out;
      }
      if (enc === 'base64') {
        const bin = atob(x);
        const out = new Buffer(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      }
      return new Buffer(new TextEncoder().encode(x));
    }
    if (ArrayBuffer.isView(x)) return new Buffer(new Uint8Array(x.buffer, x.byteOffset, x.byteLength));
    if (Array.isArray(x)) return new Buffer(Uint8Array.from(x));
    return new Buffer(0);
  }
  static concat(list) {
    const parts = (list || []).map(function (p) {
      return p instanceof Uint8Array ? p : Buffer.from(p);
    });
    let n = 0;
    parts.forEach(function (p) { n += p.length; });
    const out = new Buffer(n);
    let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  slice(a, b) { return new Buffer(Uint8Array.prototype.slice.call(this, a, b)); }
  copy(dest, destStart, srcStart, srcEnd) {
    destStart = destStart || 0;
    srcStart = srcStart || 0;
    srcEnd = srcEnd == null ? this.length : srcEnd;
    const slice = this.subarray(srcStart, srcEnd);
    dest.set(slice, destStart);
    return slice.length;
  }
  toString(enc) {
    if (enc === 'hex') {
      let s = '';
      for (let i = 0; i < this.length; i++) s += this[i].toString(16).padStart(2, '0');
      return s;
    }
    if (enc === 'base64') {
      let bin = '';
      for (let i = 0; i < this.length; i++) bin += String.fromCharCode(this[i]);
      return btoa(bin);
    }
    if (enc === 'latin1' || enc === 'binary' || enc === 'ascii') {
      const chunk = 0x8000;
      let s = '';
      for (let i = 0; i < this.length; i += chunk) {
        s += String.fromCharCode.apply(null, this.subarray(i, i + chunk));
      }
      return s;
    }
    return new TextDecoder('utf-8').decode(this);
  }
  indexOf(needle, from) {
    const start = Math.max(0, from || 0);
    if (typeof needle === 'number') return Uint8Array.prototype.indexOf.call(this, needle, start);
    const n = needle instanceof Uint8Array ? needle : Buffer.from(needle);
    if (!n.length) return start;
    outer: for (let i = start; i <= this.length - n.length; i++) {
      for (let j = 0; j < n.length; j++) if (this[i + j] !== n[j]) continue outer;
      return i;
    }
    return -1;
  }
  readUInt8(off) { return this[off]; }
  readUInt32LE(off) {
    return (this[off] | (this[off + 1] << 8) | (this[off + 2] << 16) | (this[off + 3] << 24)) >>> 0;
  }
  readInt32LE(off) { return this.readUInt32LE(off) | 0; }
  readUInt32BE(off) {
    return ((this[off] << 24) | (this[off + 1] << 16) | (this[off + 2] << 8) | this[off + 3]) >>> 0;
  }
  readFloatLE(off) { return new DataView(this.buffer, this.byteOffset + off, 4).getFloat32(0, true); }
  readDoubleLE(off) { return new DataView(this.buffer, this.byteOffset + off, 8).getFloat64(0, true); }
}

let fzstd = root.fzstd || root.FZstd || null;
function sanitizeFilename(name) {
  return String(name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80);
}
function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<\/?\w+[^>]*>/g, '')
    .trim();
}
const zlib = {
  inflateSync: function (buf) {
    const u8 = buf instanceof Uint8Array ? buf : Buffer.from(buf);
    if (root.pako && typeof root.pako.inflate === 'function') {
      return Buffer.from(root.pako.inflate(u8));
    }
    throw new Error('zlib unavailable');
  }
};

function lz4Block(src, destLen) {
  const dest = Buffer.alloc(destLen);
  let ip = 0;
  let op = 0;
  try {
    while (ip < src.length && op < destLen) {
      const token = src[ip++];
      let lit = token >>> 4;
      if (lit === 15) {
        let s = 255;
        while (s === 255) {
          if (ip >= src.length) return null;
          s = src[ip++];
          lit += s;
        }
      }
      if (ip + lit > src.length || op + lit > destLen) return null;
      src.copy(dest, op, ip, ip + lit);
      ip += lit;
      op += lit;
      if (op === destLen) break;
      if (ip + 2 > src.length) return null;
      const offset = src[ip] | (src[ip + 1] << 8);
      ip += 2;
      if (!offset || offset > op) return null;
      let match = (token & 15) + 4;
      if ((token & 15) === 15) {
        let s = 255;
        while (s === 255) {
          if (ip >= src.length) return null;
          s = src[ip++];
          match += s;
        }
      }
      for (let i = 0; i < match && op < destLen; i++) {
        dest[op] = dest[op - offset];
        op++;
      }
    }
    return dest;
  } catch (e) {
    return null;
  }
}

function isXmlRbxl(buf) {
  const head = buf.slice(0, 64).toString('utf8');
  return head.indexOf('<roblox!') !== 0 && /<roblox[\s>]/i.test(head);
}

function listChunks(buf) {
  if (isXmlRbxl(buf) || buf.slice(0, 8).toString('latin1') !== '<roblox!') return [];
  const starts = [32, 26, 18, 24];
  let best = [];
  let bestOk = -1;
  for (let s = 0; s < starts.length; s++) {
    const chunks = [];
    let offset = starts[s];
    let ok = 0;
    while (offset + 16 <= buf.length) {
      const name = buf.slice(offset, offset + 4).toString('latin1').replace(/\0/g, '');
      const compSize = buf.readUInt32LE(offset + 4);
      const rawSize = buf.readUInt32LE(offset + 8);
      offset += 16;
      if (name === 'END') break;
      if (!/^[A-Z]{3,4}$/.test(name)) break;
      if (compSize > 80 * 1024 * 1024 || rawSize > 80 * 1024 * 1024) break;
      let payload = null;
      if (compSize === 0) {
        if (offset + rawSize > buf.length) break;
        payload = buf.slice(offset, offset + rawSize);
        offset += rawSize;
      } else {
        if (offset + compSize > buf.length) break;
        const packed = buf.slice(offset, offset + compSize);
        offset += compSize;
        payload = inflateChunk(packed, rawSize);
      }
      if (payload && payload.length) {
        chunks.push({ name: name, data: payload });
        if (name === 'INST' || name === 'PROP' || name === 'SSTR') ok++;
      }
    }
    if (ok > bestOk) {
      bestOk = ok;
      best = chunks;
    }
  }
  return best;
}

function expandRbxl(buf) {
  if (isXmlRbxl(buf)) return buf;
  const chunks = listChunks(buf);
  if (!chunks.length) return buf;
  return Buffer.concat([buf].concat(chunks.map(function (c) { return c.data; })));
}

function readLenString(buf, off) {
  if (off + 4 > buf.length) return null;
  const len = buf.readInt32LE(off);
  if (len < 0 || len > 12 * 1024 * 1024 || off + 4 + len > buf.length) return null;
  return { value: buf.slice(off + 4, off + 4 + len).toString('utf8'), offset: off + 4 + len };
}

function readStringArray(buf, off, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = readLenString(buf, off);
    if (!s) break;
    out.push(s.value);
    off = s.offset;
  }
  return out;
}

function idsInText(text) {
  const ids = [];
  const re = /(?:rbxassetid:\/\/|assetdelivery\.roblox\.com\/v1\/asset\/\?id=|www\.roblox\.com\/asset\/?\?id=|roblox\.com\/asset\/?\?id=)(\d{3,})/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    if (m[1] !== '0') ids.push(m[1]);
  }
  return ids;
}

function isZstd(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x28 && buf[1] === 0xb5 && buf[2] === 0x2f && buf[3] === 0xfd;
}

function fileLooksZstd(buf) {
  if (!buf || buf.length < 52) return false;
  const starts = [32, 26, 18, 24];
  for (let i = 0; i < starts.length; i++) {
    const off = starts[i] + 16;
    if (off + 4 <= buf.length && isZstd(buf.slice(off, off + 4))) return true;
  }
  return buf.indexOf(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])) !== -1;
}

function inflateChunk(packed, rawSize) {
  if (!packed || !packed.length) return packed;
  if (isZstd(packed)) {
    if (!fzstd || typeof fzstd.decompress !== 'function') return packed;
    try {
      const out = fzstd.decompress(packed);
      return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
    } catch (e) {
      console.error('[RBXL] zstd decompress failed', e && e.message);
    }
  }
  if (rawSize) {
    const lz = lz4Block(packed, rawSize);
    if (lz && lz.length) return lz;
  }
  return packed;
}

function typeFromContext(propName, className) {
  const p = String(propName || '').toLowerCase();
  const c = String(className || '').toLowerCase();
  if (p === 'soundid' || c === 'sound') return { type: 'Audio', typeId: 3 };
  if (p === 'animationid' || c === 'animation') return { type: 'Animation', typeId: 24 };
  if (p === 'meshid' || p === 'meshid0' || c === 'specialmesh' || c === 'filemesh') return { type: 'Mesh', typeId: 4 };
  if (p === 'shirttemplate') return { type: 'Shirt', typeId: 11 };
  if (p === 'pantstemplate') return { type: 'Pants', typeId: 12 };
  if (c === 'videoframe' || p === 'videoid') return { type: 'Video', typeId: 61 };
  if (p === 'textureid' || p === 'texture' || p === 'graphic' || p === 'image' || p.indexOf('skybox') === 0) {
    if (c === 'decal' || c === 'texture') return { type: 'Decal', typeId: 13 };
    return { type: 'Image', typeId: 1 };
  }
  if (c === 'soundeffect' || c === 'soundgroup') return { type: 'Audio', typeId: 3 };
  if (c === 'particleemitter' || p === 'texture') {
    if (c === 'particleemitter') return { type: 'Particle', typeId: 0 };
  }
  return { type: 'Content', typeId: 0 };
}

const EMISSION_DIR = ['Right', 'Top', 'Back', 'Left', 'Bottom', 'Front'];
const PE_SHAPE = ['Box', 'Sphere', 'Cylinder', 'Disc'];
const PE_SHAPE_INOUT = ['Outward', 'Inward', 'InAndOut'];
const PE_ORIENT = ['FacingCamera', 'FacingCameraWorldUp', 'VelocityParallel', 'VelocityPerpendicular'];
const PE_FLIP_LAYOUT = ['None', 'Grid2x2', 'Grid4x4', 'Grid8x8'];
const PE_FLIP_MODE = ['Loop', 'OneShot', 'PingPong', 'Random'];

function enumName(list, value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (list.indexOf(trimmed) !== -1) return trimmed;
    const n = Number(trimmed);
    if (Number.isFinite(n) && list[n]) return list[n];
    return fallback;
  }
  const n = Number(value);
  if (Number.isFinite(n) && list[n]) return list[n];
  return fallback;
}

function bodyPartFromName(name) {
  name = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/left(hand|arm|upperarm|lowerarm)/.test(name)) return 'Left Arm';
  if (/right(hand|arm|upperarm|lowerarm)/.test(name)) return 'Right Arm';
  if (/left(foot|leg|upperleg|lowerleg)/.test(name)) return 'Left Leg';
  if (/right(foot|leg|upperleg|lowerleg)/.test(name)) return 'Right Leg';
  if (/torso|upper|lower|waist/.test(name)) return 'Torso';
  if (/head|face/.test(name)) return 'Head';
  if (/root|humanoid|hrp/.test(name)) return 'HumanoidRootPart';
  return 'HumanoidRootPart';
}

function partForBody(inst) {
  let p = inst;
  let guard = 0;
  const seen = new Set();
  while (p && guard++ < 64 && !seen.has(p)) {
    seen.add(p);
    const n = String(p.className || '');
    if (/^(Part|MeshPart|WedgePart|CornerWedgePart|TrussPart|UnionOperation|NegateOperation|VehicleSeat|Seat|SpawnLocation|BasePart)$/i.test(n)) return p;
    p = p.parent;
  }
  return inst && inst.parent;
}

function textureIdFrom(value) {
  if (value && typeof value === 'object') {
    if (value.uri != null) return textureIdFrom(value.uri);
    if (value.value != null) return textureIdFrom(value.value);
    if (value.url != null) return textureIdFrom(value.url);
  }
  const s = String(value == null ? '' : value);
  let m = s.match(/id=(\d+)/i) || s.match(/rbxassetid:\/\/(\d+)/i) || s.match(/(\d{5,})/);
  return m ? Number(m[1]) : 0;
}

function wantsTypedProps(className) {
  return /^(ParticleEmitter|Attachment|Part|MeshPart|BasePart|WedgePart|CornerWedgePart|TrussPart|UnionOperation|NegateOperation|VehicleSeat|Seat|SpawnLocation)$/i.test(String(className || ''));
}

function vec3FromAny(v) {
  if (v == null) return '0, 0, 0';
  if (typeof v === 'string') {
    const n = v.split(/[,\s]+/).map(Number).filter(function (x) { return Number.isFinite(x); });
    if (n.length >= 3) return n[0] + ', ' + n[1] + ', ' + n[2];
    return v;
  }
  return (Number(v.x) || 0) + ', ' + (Number(v.y) || 0) + ', ' + (Number(v.z) || 0);
}

function particleExtrasFromInst(inst) {
  const base = partForBody(inst);
  let partSize = '0, 0, 0';
  let position = '0, 0, 0';
  let cur = inst;
  let guard = 0;
  const seen = new Set();
  while (cur && guard++ < 64 && !seen.has(cur)) {
    seen.add(cur);
    const props = cur.props || {};
    if (partSize === '0, 0, 0' && props.Size) partSize = vec3FromAny(props.Size);
    if (String(cur.className || '') === 'Attachment' && props.Position) {
      position = vec3FromAny(props.Position);
    }
    cur = cur.parent;
  }
  return {
    body: bodyPartFromName(base && base.name),
    partSize: partSize,
    position: position
  };
}

function parseSstrChunk(data) {
  const out = [];
  if (!data || data.length < 8) return out;
  const count = data.readUInt32LE(4);
  let off = 8;
  for (let i = 0; i < count && off + 4 <= data.length; i++) {
    if (off + 16 + 4 <= data.length) off += 16;
    if (off + 4 > data.length) break;
    const len = data.readInt32LE(off);
    off += 4;
    if (len < 0 || off + len > data.length) break;
    out.push(data.slice(off, off + len).toString('utf8'));
    off += len;
  }
  return out;
}

function fmtSeqNum(n, digits) {
  n = Number(n);
  if (!Number.isFinite(n)) n = 0;
  const d = digits == null ? 4 : digits;
  let s = n.toFixed(d);
  if (d === 4) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}

function numSeqToStr(kps, digits) {
  if (!kps || !kps.length) return digits === 2 ? '0.00,0.00' : '0.0000';
  const vals = kps.map(function (k) { return k && typeof k === 'object' ? k.v : k; });
  const d = digits == null ? 4 : digits;
  const join = d === 2 ? ',' : ',';
  return vals.map(function (v) { return fmtSeqNum(v, d); }).join(join);
}

function saneNum(n, fallback) {
  n = Number(n);
  if (!Number.isFinite(n) || Math.abs(n) > 1e7) return fallback != null ? fallback : 0;
  return n;
}

function numRangeToStr(nr) {
  if (!nr || typeof nr !== 'object') {
    if (typeof nr === 'number') return Number(saneNum(nr, 0)).toFixed(2) + ', ' + Number(saneNum(nr, 0)).toFixed(2);
    return '0.00, 0.00';
  }
  const a = saneNum(nr.min != null ? nr.min : nr[0], 0);
  const b = saneNum(nr.max != null ? nr.max : nr[1], a);
  return Number(a).toFixed(2) + ', ' + Number(b).toFixed(2);
}

function parseAttributesBlob(raw) {
  const out = {};
  if (raw == null) return out;
  let buf;
  if (Buffer.isBuffer(raw)) buf = raw;
  else if (typeof raw === 'string') {
    if (!raw) return out;
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length >= 8) {
      try { buf = Buffer.from(raw, 'base64'); } catch (e) { buf = Buffer.from(raw, 'binary'); }
    } else buf = Buffer.from(raw, 'binary');
  } else return out;
  if (buf.length < 8) return out;
  try {
    let off = 0;
    const count = buf.readUInt32LE(off); off += 4;
    if (count > 256) return out;
    for (let i = 0; i < count && off + 5 <= buf.length; i++) {
      const nlen = buf.readUInt32LE(off); off += 4;
      if (nlen < 0 || nlen > 200 || off + nlen + 1 > buf.length) break;
      const name = buf.slice(off, off + nlen).toString('utf8');
      off += nlen;
      const typeId = buf[off]; off += 1;
      let value = null;
      if (typeId === 0x02) {
        if (off + 4 > buf.length) break;
        const sl = buf.readUInt32LE(off); off += 4;
        if (off + sl > buf.length) break;
        value = buf.slice(off, off + sl).toString('utf8');
        off += sl;
      } else if (typeId === 0x03) {
        value = !!buf[off]; off += 1;
      } else if (typeId === 0x04) {
        if (off + 4 > buf.length) break;
        value = buf.readInt32LE(off); off += 4;
      } else if (typeId === 0x05) {
        if (off + 4 > buf.length) break;
        value = buf.readFloatLE(off); off += 4;
      } else if (typeId === 0x06) {
        if (off + 8 > buf.length) break;
        value = buf.readDoubleLE(off); off += 8;
      } else if (typeId === 0x11) {
        if (off + 12 > buf.length) break;
        value = { x: buf.readFloatLE(off), y: buf.readFloatLE(off + 4), z: buf.readFloatLE(off + 8) };
        off += 12;
      } else {
        break;
      }
      if (name) out[name] = value;
    }
  } catch (e) {}
  function scanNum(name) {
    if (out[name] != null) return;
    const needle = Buffer.from(name);
    let idx = buf.indexOf(needle);
    while (idx >= 4) {
      const nlen = buf.readUInt32LE(idx - 4);
      if (nlen === name.length && idx + name.length < buf.length) {
        const typeId = buf[idx + name.length];
        const o = idx + name.length + 1;
        if (typeId === 4 && o + 4 <= buf.length) out[name] = buf.readInt32LE(o);
        else if (typeId === 5 && o + 4 <= buf.length) out[name] = buf.readFloatLE(o);
        else if (typeId === 6 && o + 8 <= buf.length) out[name] = buf.readDoubleLE(o);
        return;
      }
      idx = buf.indexOf(needle, idx + 1);
    }
  }
  scanNum('EmitCount');
  scanNum('EmitDuration');
  scanNum('EmitDelay');
  return out;
}

function clamp255(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 255;
  if (n < 0) return 0;
  if (n > 255) return 255;
  return Math.round(n);
}

function colorSeqToStr(kps) {
  function chan(v) {
    v = Number(v);
    if (!Number.isFinite(v)) return 255;
    if (v >= 0 && v <= 1) return Math.round(v * 255);
    return clamp255(v);
  }
  function col(c) {
    if (!c || typeof c !== 'object') return '255,255,255';
    if (c.r == null && c.g == null && c.b == null && c.v != null) {
      const g = chan(c.v);
      return g + ',' + g + ',' + g;
    }
    return chan(c.r) + ',' + chan(c.g) + ',' + chan(c.b);
  }
  if (!Array.isArray(kps) || !kps.length) return '255,255,255 255,255,255';
  const first = col(kps[0]);
  const last = col(kps[kps.length - 1]);
  if (last === '0,0,0' && first !== '0,0,0') return first + ' ' + first;
  return first + ' ' + last;
}

function saneZ(n) {
  n = Number(n);
  if (!Number.isFinite(n) || Math.abs(n) > 50) return 0;
  return n;
}

function saneSpread(v) {
  const x = saneNum(v && v.x, 0);
  const y = saneNum(v && v.y, 0);
  const yy = Math.abs(y) < 0.05 && Math.abs(x) >= 1 ? 0 : y;
  return x + ', ' + yy + ', 0';
}

function accelComp(n) {
  n = Number(n);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return 0;
  if (Math.abs(n) >= 1) {
    const r = Math.round(n);
    return Math.abs(n - r) < 0.2 ? r : Number(n.toFixed(3));
  }
  // Studio stores tiny studs/s^2; JJS plugin exports tens so specks fall.
  return Math.round(n * 100);
}

function vec3Str(v) {
  if (!v) return '0, 0, 0';
  return accelComp(v.x) + ', ' + accelComp(v.y) + ', ' + accelComp(v.z);
}

function defaultParticle(over) {
  return Object.assign({
    ACCELERATION: '0, 0, 0',
    'BODY PART': 'HumanoidRootPart',
    BRIGHTNESS: 1,
    CANCEL: false,
    'CANCEL ON INTERRUPT': false,
    'CANCEL TAG': '',
    'CLIENT SIDED': false,
    COLOR: '255,255,255 255,255,255',
    DRAG: 0,
    DURATION: 5,
    'EMISSION DIRECTION': 'Top',
    'EMIT COUNT': 0,
    'FLIPBOOK FRAMERATE': '1, 1',
    'FLIPBOOK MODE': 'OneShot',
    'FLIPBOOK SIZE': '0',
    K_NAME: 'PARTICLE',
    'LAST HIT': -1,
    LIFETIME: '0, 0',
    'LIGHT EMISSION': 0,
    'LIGHT INFLUENCE': 0,
    'LOCK TO PART': false,
    'ORIENTATION TYPE': 'FacingCamera',
    'PART SIZE': '0, 0, 0',
    POSITION: '0, 0, 0',
    'PROJECTILE TAG': '',
    RATE: 20,
    'ROT SPEED': '0, 0',
    ROTATION: '0, 0',
    'RUN ON SERVER': false,
    SHAPE: 'Box',
    'SHAPE INOUT': 'Outward',
    'SHAPE PARTIAL': 1,
    SIZE: '0, 0',
    SPEED: '0, 0',
    'SPREAD ANGLE': '0, 0, 0',
    SQUASH: '0, 0',
    TEXTURE: 0,
    TRANSPARENCY: '0, 0',
    ZOFFSET: 0
  }, over || {});
}

function flipbookSizeFromLayout(layout) {
  const name = enumName(PE_FLIP_LAYOUT, layout, 'None');
  if (name === 'Grid2x2') return '2, 2';
  if (name === 'Grid4x4') return '4, 4';
  if (name === 'Grid8x8') return '8, 8';
  return '1, 1';
}

const flipbookImageCache = {};

function textureIdDigits(tex) {
  return String(tex == null ? '' : tex).replace(/\D/g, '');
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf) {
  try {
    if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    let off = 8;
    let w = 0;
    let h = 0;
    let depth = 8;
    let ctype = 6;
    const parts = [];
    while (off + 12 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.slice(off + 4, off + 8).toString('ascii');
      if (off + 12 + len > buf.length) break;
      const data = buf.slice(off + 8, off + 8 + len);
      off += 12 + len;
      if (type === 'IHDR') {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
        depth = data[8];
        ctype = data[9];
      } else if (type === 'IDAT') {
        parts.push(data);
      } else if (type === 'IEND') {
        break;
      }
    }
    if (!w || !h || w > 4096 || h > 4096 || depth !== 8) return null;
    const raw = zlib.inflateSync(Buffer.concat(parts));
    const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 4 ? 2 : ctype === 0 ? 1 : 0;
    if (!bpp) return null;
    const stride = w * bpp;
    const rgba = Buffer.alloc(w * h * 4);
    let src = 0;
    const prev = Buffer.alloc(stride);
    const row = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      const filt = raw[src++];
      raw.copy(row, 0, src, src + stride);
      src += stride;
      if (filt === 1) {
        for (let i = 0; i < stride; i++) row[i] = (row[i] + (i >= bpp ? row[i - bpp] : 0)) & 255;
      } else if (filt === 2) {
        for (let i = 0; i < stride; i++) row[i] = (row[i] + prev[i]) & 255;
      } else if (filt === 3) {
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? row[i - bpp] : 0;
          row[i] = (row[i] + ((a + prev[i]) >> 1)) & 255;
        }
      } else if (filt === 4) {
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? row[i - bpp] : 0;
          const b = prev[i];
          const c = i >= bpp ? prev[i - bpp] : 0;
          row[i] = (row[i] + paeth(a, b, c)) & 255;
        }
      }
      row.copy(prev, 0, 0, stride);
      for (let x = 0; x < w; x++) {
        const si = x * bpp;
        const di = (y * w + x) * 4;
        if (ctype === 6) {
          rgba[di] = row[si]; rgba[di + 1] = row[si + 1]; rgba[di + 2] = row[si + 2]; rgba[di + 3] = row[si + 3];
        } else if (ctype === 2) {
          rgba[di] = row[si]; rgba[di + 1] = row[si + 1]; rgba[di + 2] = row[si + 2]; rgba[di + 3] = 255;
        } else if (ctype === 4) {
          rgba[di] = row[si]; rgba[di + 1] = row[si]; rgba[di + 2] = row[si]; rgba[di + 3] = row[si + 1];
        } else {
          rgba[di] = row[si]; rgba[di + 1] = row[si]; rgba[di + 2] = row[si]; rgba[di + 3] = 255;
        }
      }
    }
    return { w: w, h: h, rgba: rgba };
  } catch (e) {
    return null;
  }
}

function downsampleRgba(img, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(img.h - 1, Math.floor(y * img.h / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(img.w - 1, Math.floor(x * img.w / size));
      img.rgba.copy(out, (y * size + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
    }
  }
  return { w: size, h: size, rgba: out };
}

function pxEmpty(rgba, i, thr) {
  const a = rgba[i + 3];
  if (a <= thr) return true;
  return (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3 <= thr;
}

function detectFlipbookFromRgba(img) {
  if (!img || !img.rgba || img.w < 16 || img.h < 16) return '1, 1';
  const sample = (img.w === 256 && img.h === 256) ? img : downsampleRgba(img, 256);
  const w = sample.w;
  const h = sample.h;
  const rgba = sample.rgba;
  function stats(n) {
    const cw = (w / n) | 0;
    const ch = (h / n) | 0;
    let ge = 0;
    let gt = 0;
    for (let k = 1; k < n; k++) {
      const x = k * cw;
      for (let y = 0; y < h; y++) {
        ge += pxEmpty(rgba, (y * w + x) * 4, 20) ? 1 : 0;
        ge += pxEmpty(rgba, (y * w + Math.max(x - 1, 0)) * 4, 20) ? 1 : 0;
        gt += 2;
      }
      const y = k * ch;
      for (let x2 = 0; x2 < w; x2++) {
        ge += pxEmpty(rgba, (y * w + x2) * 4, 20) ? 1 : 0;
        ge += pxEmpty(rgba, (Math.max(y - 1, 0) * w + x2) * 4, 20) ? 1 : 0;
        gt += 2;
      }
    }
    let live = 0;
    const step = Math.max(1, (cw / 16) | 0);
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        let fill = 0;
        let tot = 0;
        for (let y = gy * ch; y < gy * ch + ch; y += step) {
          for (let x = gx * cw; x < gx * cw + cw; x += step) {
            tot++;
            if (!pxEmpty(rgba, (y * w + x) * 4, 20)) fill++;
          }
        }
        if (tot && fill / tot > 0.01) live++;
      }
    }
    return { gutter: ge / Math.max(gt, 1), liveR: live / (n * n) };
  }
  let pick = '1, 1';
  const s2 = stats(2);
  const s4 = stats(4);
  const s8 = stats(8);
  if (s2.gutter >= 0.88 && s2.liveR >= 0.9) pick = '2, 2';
  if (s4.gutter >= 0.90 && s4.liveR >= 0.70) pick = '4, 4';
  if (s8.gutter >= 0.90 && s8.liveR >= 0.45) pick = '8, 8';
  return pick;
}

async function fetchTexturePng(assetId) {
  const id = textureIdDigits(assetId);
  if (!id) return null;
  async function grab(url) {
    try {
      const res = await fetch(url, { timeout: 15000, headers: HEADERS, redirect: 'follow' });
      if (!res || !res.ok) return null;
      const raw = res.buffer ? await res.buffer() : Buffer.from(await res.arrayBuffer());
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return buf;
      return null;
    } catch (e) {
      return null;
    }
  }
  try {
    const metaRes = await fetch('https://thumbnails.roblox.com/v1/assets?assetIds=' + id + '&size=420x420&format=Png', {
      timeout: 15000,
      headers: HEADERS
    });
    const meta = metaRes && metaRes.ok ? await metaRes.json().catch(function () { return null; }) : null;
    const thumb = meta && meta.data && meta.data[0] && meta.data[0].imageUrl;
    if (thumb) {
      const png = await grab(thumb);
      if (png) return png;
    }
  } catch (e) {}
  return await grab('https://assetdelivery.roblox.com/v1/asset/?id=' + id);
}

async function resolveFlipbookFromTexture(assetId) {
  const id = textureIdDigits(assetId);
  if (!id) return '1, 1';
  if (Object.prototype.hasOwnProperty.call(flipbookImageCache, id)) return flipbookImageCache[id];
  flipbookImageCache[id] = '1, 1';
  try {
    const png = await fetchTexturePng(id);
    const decoded = png ? decodePngRgba(png) : null;
    const size = decoded ? detectFlipbookFromRgba(decoded) : '1, 1';
    flipbookImageCache[id] = size;
    return size;
  } catch (e) {
    return '1, 1';
  }
}

async function applyDetectedFlipbooks(particles) {
  const list = particles || [];
  const pending = {};
  list.forEach(function (p) {
    const id = textureIdDigits(p && p.TEXTURE);
    if (!id) return;
    const cur = String(p['FLIPBOOK SIZE'] || '1, 1');
    if (cur !== '1, 1' && cur !== '0' && cur !== '1,1') return;
    pending[id] = true;
  });
  const ids = Object.keys(pending);
  const limit = 8;
  for (let i = 0; i < ids.length; i += limit) {
    const slice = ids.slice(i, i + limit);
    await Promise.all(slice.map(function (id) { return resolveFlipbookFromTexture(id); }));
  }
  list.forEach(function (p) {
    const id = textureIdDigits(p && p.TEXTURE);
    if (!id) return;
    const cur = String(p['FLIPBOOK SIZE'] || '1, 1');
    if (cur !== '1, 1' && cur !== '0' && cur !== '1,1') return;
    if (flipbookImageCache[id]) p['FLIPBOOK SIZE'] = flipbookImageCache[id];
  });
  return list;
}

function flipbookSizeFromProps(props) {
  props = props || {};
  const fromLayout = flipbookSizeFromLayout(props.FlipbookLayout);
  // FlipbookLayout token is authoritative when set.
  // FlipbookSizeX/Y stay at default 1 even on grid layouts.
  if (fromLayout && fromLayout !== '1, 1') return fromLayout;
  return '1, 1';
}

function spreadToStr(v) {
  const x = saneNum(v && (v.x != null ? v.x : v[0]), 0);
  const y = saneNum(v && (v.y != null ? v.y : v[1]), 0);
  return Number(x).toFixed(2) + ', ' + Number(y).toFixed(2) + ', 0.00';
}

function particleFromProps(props, extra) {
  extra = extra || {};
  const attrs = Object.assign(
    {},
    parseAttributesBlob(props.AttributesSerialize),
    parseAttributesBlob(extra.attributes),
    extra.attrs || {}
  );
  const rawEmit = attrs.EmitCount != null ? Number(attrs.EmitCount) : (props.EmitCount != null ? Number(props.EmitCount) : NaN);
  const rawDur = attrs.EmitDuration != null ? Number(attrs.EmitDuration) : (attrs.Duration != null ? Number(attrs.Duration) : 0);
  const rateNum = Number(props.Rate);
  const life = props.Lifetime || {};
  const avgLife = ((Number(life.min) || 0) + (Number(life.max) || 0)) / 2;
  let emitCount = Number.isFinite(rawEmit) && rawEmit > 0 ? Math.round(rawEmit) : 0;
  if (emitCount <= 0) {
    // VFX Forge default EmitCount is 1 and always calls Emit(count).
    // Plugin JJS lines use DURATION 0, so emit 0 is invisible.
    if (Number.isFinite(rateNum) && rateNum >= 0.05) {
      emitCount = Math.round(rateNum * Math.min(avgLife > 0 ? avgLife : 0.2, 0.25));
      if (emitCount < 1) emitCount = 1;
      if (emitCount > 15) emitCount = 15;
    } else {
      emitCount = 1;
    }
  }
  const duration = 0;
  const spread = props.SpreadAngle || { x: 0, y: 0 };
  const z = (function () {
    let v = Number(props.ZOffset);
    if (!Number.isFinite(v)) return 0;
    if (v < -2) return -1;
    if (v > 6) return 6;
    if (Math.abs(v) < 0.05) return 0;
    return Number(v.toFixed(3));
  })();
  return defaultParticle({
    ACCELERATION: vec3Str(props.Acceleration),
    BRIGHTNESS: (function () {
      const b = Number(props.Brightness);
      if (!Number.isFinite(b)) return 1;
      if (Math.abs(b) < 1e-6) return 0;
      if (b < 0) return 0;
      return b;
    })(),
    COLOR: colorSeqToStr(props.Color),
    DRAG: props.Drag != null ? props.Drag : 0,
    DURATION: 0,
    'EMISSION DIRECTION': enumName(EMISSION_DIR, props.EmissionDirection, 'Top'),
    'EMIT COUNT': Number.isFinite(emitCount) ? Math.round(emitCount) : 0,
    'FLIPBOOK FRAMERATE': numRangeToStr(props.FlipbookFramerate || { min: 1, max: 1 }),
    'FLIPBOOK MODE': enumName(PE_FLIP_MODE, props.FlipbookMode, 'OneShot'),
    'FLIPBOOK SIZE': flipbookSizeFromProps(props),
    LIFETIME: numRangeToStr(props.Lifetime),
    'LIGHT EMISSION': (function () {
      const v = Number(props.LightEmission);
      if (!Number.isFinite(v) || v < 0 || v > 2) return 0;
      return v;
    })(),
    'LIGHT INFLUENCE': (function () {
      const v = Number(props.LightInfluence);
      if (!Number.isFinite(v) || v < 0 || v > 2) return 0;
      return v;
    })(),
    'LOCK TO PART': !!props.LockedToPart,
    'ORIENTATION TYPE': enumName(PE_ORIENT, props.Orientation, 'FacingCamera'),
    'PART SIZE': extra.partSize || '0, 0, 0',
    POSITION: extra.position || '0, 0, 0',
    RATE: (function () {
      const r = Number(props.Rate);
      if (!Number.isFinite(r) || r < 0 || r > 100000) return 0;
      if (r > 0 && r < 1e-6) return 0;
      return r;
    })(),
    'ROT SPEED': numRangeToStr(props.RotSpeed),
    ROTATION: numRangeToStr(props.Rotation),
    'RUN ON SERVER': true,
    SIZE: numSeqToStr(props.Size, 4),
    SPEED: numRangeToStr(props.Speed),
    'SPREAD ANGLE': spreadToStr(spread),
    SQUASH: numSeqToStr(props.Squash, 2),
    TEXTURE: textureIdFrom(props.Texture != null ? props.Texture : props.TextureId),
    TRANSPARENCY: numSeqToStr(props.Transparency, 2),
    ZOFFSET: Number.isFinite(z) && Math.abs(z) <= 200 ? z : 0
  });
}

function buildJjsJson(particles, fileName) {
  const skillData = {
    Req: {},
    Line: {},
    Prop: {},
    Branch: {
      converted: {
        Req: {},
        Line: particles || []
      }
    }
  };
  const skill = {
    ADD: false,
    NAME: String(fileName || 'converted').replace(/\.[^.]+$/, ''),
    K_NAME: 'SKILL',
    KEY: 1,
    COOLDOWN: 0,
    DATA: JSON.stringify(skillData),
    'TOOL TIP': ''
  };
  return JSON.stringify([skill]);
}

function deinterleave(buf, off, count, size) {
  if (!buf || off + count * size > buf.length) return null;
  const out = Buffer.alloc(count * size);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < size; j++) out[i * size + j] = buf[off + j * count + i];
  }
  return out;
}

function floatScore(v) {
  if (!Number.isFinite(v)) return -1;
  const a = Math.abs(v);
  if (a === 0) return 2;
  if (a > 1e7 || a < 1e-8) return 0;
  if (a >= 0.001 && a <= 10000) return 4;
  if (a <= 1e6) return 1;
  return 0;
}

function rotatedFloatAt(buf, index) {
  function from(u) {
    const tmp = Buffer.alloc(4);
    tmp.writeUInt32LE(rotateI32(u) >>> 0);
    return tmp.readFloatLE(0);
  }
  let le = NaN;
  let be = NaN;
  try { le = from(buf.readUInt32LE(index)); } catch (e) {}
  try { be = from(buf.readUInt32BE(index)); } catch (e) {}
  const sL = floatScore(le);
  const sB = floatScore(be);
  if (sB > sL) return be;
  if (sL > sB) return le;
  if (sB >= 0) return be;
  if (sL >= 0) return le;
  return 0;
}

function rotatedU32At(buf, index) {
  // Token/enum arrays are byte-interleaved raw integers, NOT rotate-encoded.
  // After deinterleave the value sits in the last byte ([0,0,0,N] => N).
  let rawBe = 0;
  let rawLe = 0;
  try { rawBe = buf.readUInt32BE(index) >>> 0; } catch (e) {}
  try { rawLe = buf.readUInt32LE(index) >>> 0; } catch (e) {}
  if (rawBe <= 32) return rawBe;
  if (rawLe <= 32) return rawLe;
  const hi = buf[index];
  const lo = buf[index + 3];
  if (hi <= 32) return hi;
  if (lo <= 32) return lo;
  let le = 0;
  let be = 0;
  try { le = rotateI32(rawLe) >>> 0; } catch (e) {}
  try { be = rotateI32(rawBe) >>> 0; } catch (e) {}
  if (le <= 32) return le;
  if (be <= 32) return be;
  return rawBe <= rawLe ? rawBe : rawLe;
}

function parseTypedProp(data, typeId, start, count, sharedStrings) {
  const values = new Array(count);
  sharedStrings = sharedStrings || [];
  try {
    if (typeId === 1) return readStringArray(data, start, count);
    if (typeId === 2) {
      for (let i = 0; i < count; i++) values[i] = !!data[start + i];
      return values;
    }
    if (typeId === 4) {
      const raw = deinterleave(data, start, count, 4);
      for (let i = 0; i < count; i++) {
        const inter = raw ? rotatedFloatAt(raw, i * 4) : NaN;
        const seq = rotatedFloatAt(data, start + i * 4);
        const okI = Number.isFinite(inter) && Math.abs(inter) < 1000000;
        const okS = Number.isFinite(seq) && Math.abs(seq) < 1000000;
        if (okI && Math.abs(inter) >= 1e-8) values[i] = inter;
        else if (okS && Math.abs(seq) >= 1e-8) values[i] = seq;
        else if (okI) values[i] = inter;
        else if (okS) values[i] = seq;
        else values[i] = 0;
      }
      return values;
    }
    if (typeId === 5) {
      const raw = deinterleave(data, start, count, 8);
      if (!raw) return values;
      for (let i = 0; i < count; i++) values[i] = raw.readDoubleLE(i * 8);
      return values;
    }
    if (typeId === 0x0c) {
      const raw = deinterleave(data, start, count, 12);
      if (!raw) return values;
      for (let i = 0; i < count; i++) {
        values[i] = [{
          t: 0,
          r: rotatedFloatAt(raw, i * 12),
          g: rotatedFloatAt(raw, i * 12 + 4),
          b: rotatedFloatAt(raw, i * 12 + 8),
          e: 0
        }];
      }
      return values;
    }
    if (typeId === 0x0d) {
      const raw = deinterleave(data, start, count, 8);
      if (!raw) return values;
      for (let i = 0; i < count; i++) values[i] = { x: rotatedFloatAt(raw, i * 8), y: rotatedFloatAt(raw, i * 8 + 4) };
      return values;
    }
    if (typeId === 0x0e) {
      const raw = deinterleave(data, start, count, 12);
      if (!raw) return values;
      for (let i = 0; i < count; i++) {
        values[i] = {
          x: rotatedFloatAt(raw, i * 12),
          y: rotatedFloatAt(raw, i * 12 + 4),
          z: rotatedFloatAt(raw, i * 12 + 8)
        };
      }
      return values;
    }
    if (typeId === 0x12) {
      const raw = deinterleave(data, start, count, 4);
      if (!raw) return values;
      for (let i = 0; i < count; i++) values[i] = rotatedU32At(raw, i * 4);
      return values;
    }
    if (typeId === 3) {
      const raw = deinterleave(data, start, count, 4);
      if (!raw) return values;
      for (let i = 0; i < count; i++) {
        let be = 0, le = 0;
        try { be = rotateI32(raw.readUInt32BE(i * 4)); } catch (e) {}
        try { le = rotateI32(raw.readUInt32LE(i * 4)); } catch (e) {}
        if (Math.abs(be) <= 100000 && (Math.abs(le) > 100000 || Math.abs(be) < Math.abs(le) || Math.abs(be) <= 32)) values[i] = be;
        else values[i] = le;
      }
      return values;
    }
    if (typeId === 0x17) {
      for (let i = 0; i < count; i++) {
        const o = start + i * 8;
        if (o + 8 > data.length) break;
        values[i] = { min: data.readFloatLE(o), max: data.readFloatLE(o + 4) };
      }
      return values;
    }
    if (typeId === 0x15) {
      let off = start;
      for (let i = 0; i < count; i++) {
        if (off + 4 > data.length) break;
        const n = data.readUInt32LE(off);
        off += 4;
        const kps = [];
        for (let k = 0; k < n && off + 12 <= data.length; k++) {
          kps.push({ t: data.readFloatLE(off), v: data.readFloatLE(off + 4), e: data.readFloatLE(off + 8) });
          off += 12;
        }
        values[i] = kps;
      }
      return values;
    }
    if (typeId === 0x16) {
      let off = start;
      for (let i = 0; i < count; i++) {
        if (off + 4 > data.length) break;
        const n = data.readUInt32LE(off);
        off += 4;
        const kps = [];
        for (let k = 0; k < n && off + 20 <= data.length; k++) {
          kps.push({
            t: data.readFloatLE(off),
            r: data.readFloatLE(off + 4),
            g: data.readFloatLE(off + 8),
            b: data.readFloatLE(off + 12),
            e: data.readFloatLE(off + 16)
          });
          off += 20;
        }
        values[i] = kps;
      }
      return values;
    }
    if (typeId === 0x1a) {
      for (let i = 0; i < count; i++) {
        const o = start + i * 3;
        if (o + 3 > data.length) break;
        values[i] = [{ t: 0, r: data[o] / 255, g: data[o + 1] / 255, b: data[o + 2] / 255, e: 0 }];
      }
      return values;
    }
    if (typeId === 0x1d || typeId === 0x1b) {
      const out = [];
      let off = start;
      for (let i = 0; i < count; i++) {
        if (off + 4 > data.length) break;
        const len = data.readInt32LE(off);
        off += 4;
        if (len < 0 || off + len > data.length) break;
        out[i] = data.slice(off, off + len);
        off += len;
      }
      return out;
    }
    if (typeId === 0x1c) {
      const raw = deinterleave(data, start, count, 4);
      if (!raw) return values;
      for (let i = 0; i < count; i++) {
        const idx = rotatedU32At(raw, i * 4);
        values[i] = sharedStrings[idx] != null ? sharedStrings[idx] : idx;
      }
      return values;
    }
    if (typeId === 0x22 || typeId === 0x23) {
      return readStringArray(data, start, count);
    }
    if (typeId === 0x21 || typeId === 0x24 || typeId === 0x25 || typeId === 0x26) {
      const strs = readStringArray(data, start, count);
      if (strs && strs.length) return strs;
      let off = start;
      for (let i = 0; i < count && off < data.length; i++) {
        const srcType = data[off];
        off += 1;
        if (srcType === 1 || srcType === 2) {
          const s = readLenString(data, off);
          if (!s) break;
          values[i] = s.value;
          off = s.offset;
        } else {
          values[i] = '';
        }
      }
      return values;
    }
  } catch (e) {}
  return values;
}

function xmlTagValue(block, tag, name) {
  const re = new RegExp('<' + tag + ' name="' + name + '"[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
  const m = re.exec(block);
  return m ? decodeXml(m[1]).trim() : null;
}

function parseXmlNumberSeq(text) {
  const nums = String(text || '').trim().split(/\s+/).map(Number).filter(function (n) { return Number.isFinite(n); });
  const kps = [];
  for (let i = 0; i + 2 < nums.length; i += 3) kps.push({ t: nums[i], v: nums[i + 1], e: nums[i + 2] });
  return kps;
}

function parseXmlColorSeq(text) {
  const nums = String(text || '').trim().split(/\s+/).map(Number).filter(function (n) { return Number.isFinite(n); });
  const kps = [];
  for (let i = 0; i + 4 < nums.length; i += 5) {
    kps.push({ t: nums[i], r: nums[i + 1], g: nums[i + 2], b: nums[i + 3], e: nums[i + 4] });
  }
  return kps;
}

function parseXmlVec(text) {
  const inner = String(text || '');
  const x = /<X>([^<]+)<\/X>/i.exec(inner);
  const y = /<Y>([^<]+)<\/Y>/i.exec(inner);
  const z = /<Z>([^<]+)<\/Z>/i.exec(inner);
  if (x || y) return { x: Number(x && x[1]) || 0, y: Number(y && y[1]) || 0, z: Number(z && z[1]) || 0 };
  const parts = inner.replace(/<[^>]+>/g, ' ').trim().split(/[\s,]+/).map(Number);
  return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
}

function parseXmlRange(text) {
  const inner = String(text || '');
  const min = /<(?:Min|min)>([^<]+)<\//i.exec(inner);
  const max = /<(?:Max|max)>([^<]+)<\//i.exec(inner);
  if (min || max) return { min: Number(min && min[1]) || 0, max: Number(max && max[1]) || 0 };
  const parts = inner.replace(/<[^>]+>/g, ' ').trim().split(/[\s,]+/).map(Number);
  return { min: parts[0] || 0, max: parts[1] != null ? parts[1] : parts[0] || 0 };
}

function parseXmlPropsInto(inst, chunk) {
  if (!chunk || !inst) return;
  const name = xmlTagValue(chunk, 'string', 'Name');
  if (name) {
    inst.name = name;
    inst.props.Name = name;
  }
  const pairs = [
    ['Content', 'Texture'], ['string', 'Texture'],
    ['float', 'Brightness'], ['float', 'Drag'], ['float', 'Rate'],
    ['float', 'LightEmission'], ['float', 'LightInfluence'],
    ['float', 'ShapePartial'], ['float', 'ZOffset'],
    ['token', 'EmissionDirection'], ['token', 'Orientation'],
    ['token', 'Shape'], ['token', 'ShapeInOut'],
    ['token', 'FlipbookLayout'], ['token', 'FlipbookMode'],
    ['int', 'FlipbookSizeX'], ['int', 'FlipbookSizeY'],
    ['BinaryString', 'AttributesSerialize'],
    ['ColorSequence', 'Color'], ['NumberSequence', 'Size'],
    ['NumberSequence', 'Transparency'], ['NumberSequence', 'Squash'],
    ['NumberRange', 'Lifetime'], ['NumberRange', 'Speed'],
    ['NumberRange', 'RotSpeed'], ['NumberRange', 'Rotation'],
    ['NumberRange', 'FlipbookFramerate'],
    ['Vector3', 'Acceleration'], ['Vector2', 'SpreadAngle'],
    ['Vector3', 'Size'], ['Vector3', 'Position']
  ];
  pairs.forEach(function (pair) {
    const raw = xmlTagValue(chunk, pair[0], pair[1]);
    if (raw == null || raw === '') return;
    if (pair[0] === 'float' || pair[0] === 'int') inst.props[pair[1]] = Number(raw);
    else if (pair[0] === 'BinaryString') {
      try { inst.props[pair[1]] = Buffer.from(String(raw).replace(/\s+/g, ''), 'base64'); }
      catch (e) { inst.props[pair[1]] = raw; }
    }
    else if (pair[0] === 'ColorSequence') inst.props[pair[1]] = parseXmlColorSeq(raw);
    else if (pair[0] === 'NumberSequence') inst.props[pair[1]] = parseXmlNumberSeq(raw);
    else if (pair[0] === 'NumberRange') inst.props[pair[1]] = parseXmlRange(raw);
    else if (pair[0] === 'Vector3' || pair[0] === 'Vector2') inst.props[pair[1]] = parseXmlVec(raw);
    else inst.props[pair[1]] = raw;
  });
  if (/name="LockedToPart"[^>]*>\s*true/i.test(chunk)) inst.props.LockedToPart = true;
}

function parseXmlItemAt(text, start) {
  const gt = text.indexOf('>', start);
  if (gt === -1) return { inst: null, end: start };
  const header = text.slice(start, gt + 1);
  const classM = /class="([^"]+)"/i.exec(header);
  const refM = /referent="([^"]+)"/i.exec(header);
  const inst = {
    className: (classM && classM[1]) || 'Instance',
    referent: refM && refM[1],
    name: (classM && classM[1]) || 'Instance',
    props: {},
    children: [],
    parent: null
  };
  if (/\/>\s*$/.test(header)) return { inst: inst, end: gt + 1 };
  let i = gt + 1;
  while (i < text.length) {
    const open = text.indexOf('<Item', i);
    const close = text.indexOf('</Item>', i);
    if (close === -1) {
      parseXmlPropsInto(inst, text.slice(i));
      return { inst: inst, end: text.length };
    }
    if (open !== -1 && open < close) {
      parseXmlPropsInto(inst, text.slice(i, open));
      const child = parseXmlItemAt(text, open);
      if (child.inst) {
        child.inst.parent = inst;
        inst.children.push(child.inst);
      }
      i = child.end;
    } else {
      parseXmlPropsInto(inst, text.slice(i, close));
      return { inst: inst, end: close + 7 };
    }
  }
  return { inst: inst, end: i };
}

function parseXmlTree(text) {
  const roots = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf('<Item', i);
    if (start === -1) break;
    const parsed = parseXmlItemAt(text, start);
    if (parsed.inst) roots.push(parsed.inst);
    i = parsed.end;
  }
  return roots;
}

function collectXmlEmitters(roots) {
  const emitters = [];
  function walk(inst) {
    if (!inst) return;
    if (inst.className === 'ParticleEmitter') {
      const base = partForBody(inst);
      const particle = particleFromProps(inst.props || {}, particleExtrasFromInst(inst));
      inst.particle = particle;
      emitters.push({ particle: particle, inst: inst, host: topHostOf(inst), name: inst.name });
    }
    (inst.children || []).forEach(walk);
  }
  roots.forEach(walk);
  return emitters;
}

function parseXmlParticles(text) {
  const particles = [];
  const rows = [];
  const re = /<Item[^>]*class="ParticleEmitter"[^>]*>([\s\S]*?)<\/Item>/gi;
  let m;
  while ((m = re.exec(text))) {
    const block = m[1];
    const name = xmlTagValue(block, 'string', 'Name') || 'ParticleEmitter';
    const before = text.slice(Math.max(0, m.index - 2500), m.index);
    const partName = (before.match(/<string name="Name">([^<]*)<\/string>/g) || []).pop();
    const partMatch = partName ? />([^<]*)<\/string>/.exec(partName) : null;
    const props = {
      Name: name,
      Texture: xmlTagValue(block, 'Content', 'Texture') || xmlTagValue(block, 'string', 'Texture') || '',
      Brightness: Number(xmlTagValue(block, 'float', 'Brightness')),
      Drag: Number(xmlTagValue(block, 'float', 'Drag')),
      Rate: Number(xmlTagValue(block, 'float', 'Rate')),
      LightEmission: Number(xmlTagValue(block, 'float', 'LightEmission')),
      LightInfluence: Number(xmlTagValue(block, 'float', 'LightInfluence')),
      ShapePartial: Number(xmlTagValue(block, 'float', 'ShapePartial')),
      ZOffset: Number(xmlTagValue(block, 'float', 'ZOffset')),
      LockedToPart: /name="LockedToPart"[^>]*>\s*true/i.test(block),
      EmissionDirection: xmlTagValue(block, 'token', 'EmissionDirection'),
      Orientation: xmlTagValue(block, 'token', 'Orientation'),
      Shape: xmlTagValue(block, 'token', 'Shape'),
      ShapeInOut: xmlTagValue(block, 'token', 'ShapeInOut'),
      FlipbookLayout: xmlTagValue(block, 'token', 'FlipbookLayout'),
      FlipbookMode: xmlTagValue(block, 'token', 'FlipbookMode'),
      Color: parseXmlColorSeq(xmlTagValue(block, 'ColorSequence', 'Color') || ''),
      Size: parseXmlNumberSeq(xmlTagValue(block, 'NumberSequence', 'Size') || ''),
      Transparency: parseXmlNumberSeq(xmlTagValue(block, 'NumberSequence', 'Transparency') || ''),
      Squash: parseXmlNumberSeq(xmlTagValue(block, 'NumberSequence', 'Squash') || ''),
      Lifetime: parseXmlRange(xmlTagValue(block, 'NumberRange', 'Lifetime') || ''),
      Speed: parseXmlRange(xmlTagValue(block, 'NumberRange', 'Speed') || ''),
      RotSpeed: parseXmlRange(xmlTagValue(block, 'NumberRange', 'RotSpeed') || ''),
      Rotation: parseXmlRange(xmlTagValue(block, 'NumberRange', 'Rotation') || ''),
      FlipbookFramerate: parseXmlRange(xmlTagValue(block, 'NumberRange', 'FlipbookFramerate') || ''),
      Acceleration: parseXmlVec(xmlTagValue(block, 'Vector3', 'Acceleration') || ''),
      SpreadAngle: parseXmlVec(xmlTagValue(block, 'Vector2', 'SpreadAngle') || xmlTagValue(block, 'Vector3', 'SpreadAngle') || '')
    };
    if (!Number.isFinite(props.Brightness)) delete props.Brightness;
    if (!Number.isFinite(props.Drag)) delete props.Drag;
    if (!Number.isFinite(props.Rate)) delete props.Rate;
    const particle = particleFromProps(props, {
      body: bodyPartFromName(partMatch && partMatch[1]),
      partSize: vec3FromAny(props.Size),
      position: vec3FromAny(props.Position)
    });
    particles.push(particle);
    rows.push({
      id: String(particle.TEXTURE || name),
      name: name,
      type: 'Particle',
      typeId: 0,
      prop: 'ParticleEmitter',
      className: 'ParticleEmitter',
      path: 'ParticleEmitter/' + name,
      particle: particle
    });
  }
  return { particles: particles, rows: rows };
}

function rotateI32(u) {
  u = u >>> 0;
  return ((u >>> 1) ^ (-(u & 1))) | 0;
}

function readInterleavedI32(buf, off, count) {
  const raw = deinterleave(buf, off, count, 4);
  if (!raw) return { values: [], offset: off };
  const values = [];
  for (let i = 0; i < count; i++) {
    let u = 0;
    try { u = raw.readUInt32BE(i * 4); } catch (e) { u = raw.readUInt32LE(i * 4); }
    values.push(rotateI32(u));
  }
  return { values: values, offset: off + count * 4 };
}

function readReferents(buf, off, count) {
  const r = readInterleavedI32(buf, off, count);
  let acc = 0;
  const refs = [];
  for (let i = 0; i < r.values.length; i++) {
    acc = (acc + r.values[i]) | 0;
    refs.push(acc);
  }
  return { refs: refs, offset: r.offset };
}

function isWorldService(name) {
  return /^(Workspace|Lighting|ReplicatedStorage|ReplicatedFirst|ServerStorage|ServerScriptService|StarterGui|StarterPack|StarterPlayer|StarterPlayerScripts|StarterCharacterScripts|Players|Teams|SoundService|Chat|Terrain|Camera|Game|DataModel|Lighting|CSGDictionaryService)$/i.test(String(name || ''));
}

function isFolderLike(inst) {
  if (!inst) return false;
  const n = String(inst.className || '');
  return /^(Folder|Configuration|Actor|WorldModel)$/i.test(n);
}

function isGroupContainer(inst) {
  if (!inst) return false;
  if (isWorldService(inst.className) || isWorldService(inst.name)) return false;
  if (isFolderLike(inst)) return true;
  return /^Model$/i.test(String(inst.className || ''));
}

function isSolidHost(inst) {
  if (!inst || isFolderLike(inst) || isWorldService(inst.className) || isWorldService(inst.name)) return false;
  const n = String(inst.className || '');
  if (/^(Attachment|ParticleEmitter)$/i.test(n)) return false;
  return /^(Model|Tool|Accessory|Accoutrement|Part|MeshPart|WedgePart|CornerWedgePart|TrussPart|UnionOperation|NegateOperation|VehicleSeat|Seat|SpawnLocation|BasePart)$/i.test(n) || !!n;
}

function topHostOf(inst) {
  if (!inst) return null;
  let cur = inst;
  let guard = 0;
  const seen = new Set();
  while (cur && (cur.className === 'Attachment' || cur.className === 'ParticleEmitter') && cur.parent && guard++ < 64 && !seen.has(cur)) {
    seen.add(cur);
    cur = cur.parent;
  }
  while (cur && isFolderLike(cur) && cur.parent && !isWorldService(cur.parent.className) && guard++ < 64 && !seen.has(cur)) {
    seen.add(cur);
    cur = cur.parent;
  }
  if (!isSolidHost(cur)) {
    let p = inst;
    while (p && guard++ < 64 && !seen.has(p)) {
      seen.add(p);
      if (isSolidHost(p)) return p;
      p = p.parent;
    }
    return inst;
  }
  let last = cur;
  while (last.parent && isSolidHost(last.parent) && !isFolderLike(last.parent) && !isWorldService(last.parent.className) && !isWorldService(last.parent.name) && guard++ < 64 && !seen.has(last.parent)) {
    seen.add(last);
    last = last.parent;
  }
  return last;
}

function instKey(inst) {
  if (!inst) return 'none';
  if (inst.ref != null) return 'r:' + inst.ref;
  if (inst.referent) return 'x:' + inst.referent;
  return 'n:' + String(inst.className || '') + ':' + String(inst.name || '');
}

function folderPathFromRoot(inst) {
  const folders = [];
  let p = inst;
  let guard = 0;
  const seen = new Set();
  while (p && guard++ < 64 && !seen.has(p)) {
    seen.add(p);
    if (isWorldService(p.className) || isWorldService(p.name)) break;
    if (isGroupContainer(p)) folders.push(p);
    p = p.parent;
  }
  folders.reverse();
  return folders;
}

function collectNodeParticles(node) {
  const out = [];
  (node.particles || []).forEach(function (p) { out.push(p); });
  (node.children || []).forEach(function (c) {
    collectNodeParticles(c).forEach(function (p) { out.push(p); });
  });
  return out;
}

function unwrapSingleFolders(node) {
  if (!node || !node.children) return node;
  function folderKids(n) {
    return (n.children || []).filter(function (c) { return c.type === 'ParticleFolder'; });
  }
  while (
    node.children.length === 1 &&
    node.children[0].type === 'ParticleFolder' &&
    folderKids(node.children[0]).length >= 1
  ) {
    node.children = node.children[0].children || [];
  }
  if (
    node.children.length === 1 &&
    node.children[0].type === 'ParticleFolder' &&
    folderKids(node.children[0]).length === 0
  ) {
    node.children = node.children[0].children || [];
  }
  return node;
}

function stampTree(node, counter) {
  node.id = String(counter.n++);
  (node.children || []).forEach(function (c) {
    c.parentId = node.id;
    stampTree(c, counter);
  });
}

function indexTree(node, map) {
  map[node.id] = node;
  (node.children || []).forEach(function (c) { indexTree(c, map); });
}

function buildParticleTree(emitters) {
  const root = {
    id: 'root',
    name: 'Root',
    className: 'Folder',
    type: 'ParticleFolder',
    children: [],
    particles: []
  };
  const seen = new Map();
  function childOf(parent, inst, type) {
    const key = parent.id + '|' + type + '|' + instKey(inst);
    if (seen.has(key)) return seen.get(key);
    const node = {
      name: (inst && (inst.name || inst.className)) || (type === 'ParticleFolder' ? 'Folder' : 'Model'),
      className: (inst && inst.className) || (type === 'ParticleFolder' ? 'Folder' : 'Model'),
      type: type,
      typeId: 0,
      path: [inst && inst.className, inst && inst.name].filter(Boolean).join('/'),
      children: [],
      particles: []
    };
    parent.children.push(node);
    seen.set(key, node);
    return node;
  }
  (emitters || []).forEach(function (row) {
    const inst = row.inst;
    const boxes = folderPathFromRoot(inst);
    let node = root;
    boxes.forEach(function (folder) {
      node = childOf(node, folder, 'ParticleFolder');
    });
    const part = partForBody(inst);
    const inner = boxes.length ? boxes[boxes.length - 1] : null;
    if (part && (!inner || instKey(part) !== instKey(inner))) {
      const hostNode = childOf(node, part, 'ParticleHost');
      if (row.particle) hostNode.particles.push(row.particle);
    } else if (row.particle) {
      node.particles.push(row.particle);
    }
  });
  unwrapSingleFolders(root);
  function rollup(node) {
    (node.children || []).forEach(rollup);
    const own = (node.particles || []).length;
    let child = 0;
    (node.children || []).forEach(function (c) { child += Number(c.count) || 0; });
    node.count = own + child;
    node.children.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'ParticleFolder' ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
  }
  rollup(root);
  stampTree(root, { n: 1 });
  return root;
}

function groupParticleHosts(emitters) {
  const tree = buildParticleTree(emitters);
  return tree.children || [];
}

function parseBinaryPlace(buf) {
  const chunks = listChunks(buf);
  const classes = {};
  chunks.forEach(function (chunk) {
    if (chunk.name !== 'INST') return;
    const data = chunk.data;
    if (data.length < 10) return;
    const classIndex = data.readUInt32LE(0);
    const cn = readLenString(data, 4);
    if (!cn) return;
    let off = cn.offset;
    if (off >= data.length) return;
    off += 1;
    if (off + 4 > data.length) return;
    const count = data.readUInt32LE(off);
    off += 4;
    const refs = readReferents(data, off, count);
    const instances = (refs.refs || []).map(function (ref) {
      return { ref: ref, className: cn.value, name: cn.value, props: {}, children: [], parent: null };
    });
    while (instances.length < count) {
      instances.push({ ref: instances.length, className: cn.value, name: cn.value, props: {}, children: [], parent: null });
    }
    classes[classIndex] = { className: cn.value, count: count, names: [], sources: [], referents: refs.refs, instances: instances };
  });

  const sharedStrings = [];
  chunks.forEach(function (chunk) {
    if (chunk.name !== 'SSTR') return;
    parseSstrChunk(chunk.data).forEach(function (s) { sharedStrings.push(s); });
  });

  chunks.forEach(function (chunk) {
    if (chunk.name !== 'PROP') return;
    const data = chunk.data;
    if (data.length < 6) return;
    const classIndex = data.readUInt32LE(0);
    const pn = readLenString(data, 4);
    if (!pn) return;
    const typeId = data[pn.offset];
    const cls = classes[classIndex] || { className: 'Instance', count: 1, names: [], sources: [] };
    if (!classes[classIndex]) classes[classIndex] = cls;
    const values = (typeId === 1) ? readStringArray(data, pn.offset + 1, cls.count || 64) : [];
    if (pn.value === 'Name') {
      cls.names = values;
      (cls.instances || []).forEach(function (inst, i) {
        if (values[i]) inst.name = values[i];
      });
    }
    if (pn.value === 'Source') cls.sources = values;
    cls['prop_' + pn.value] = values;
    if (!cls.typed) cls.typed = {};
    if (wantsTypedProps(cls.className) || typeId === 1 || typeId === 0x1c || typeId === 0x22 || typeId === 0x23 || typeId === 0x24 || typeId === 0x25 || typeId === 0x26) {
      cls.typed[pn.value] = parseTypedProp(data, typeId, pn.offset + 1, cls.count || 1, sharedStrings);
    }
    // skipped idsInText scan in studio parser
    if (cls.instances && cls.typed && cls.typed[pn.value]) {
      cls.instances.forEach(function (inst, i) {
        const arr = cls.typed[pn.value];
        inst.props[pn.value] = arr[i] != null ? arr[i] : arr[0];
      });
    }
  });

  const byRef = {};
  Object.keys(classes).forEach(function (idx) {
    (classes[idx].instances || []).forEach(function (inst) {
      byRef[inst.ref] = inst;
      byRef[String(inst.ref)] = inst;
    });
  });
  chunks.forEach(function (chunk) {
    if (chunk.name !== 'PRNT') return;
    const data = chunk.data;
    if (data.length < 5) return;
    let off = 1;
    const count = data.readUInt32LE(off);
    off += 4;
    const children = readReferents(data, off, count);
    const parents = readReferents(data, children.offset, count);
    for (let i = 0; i < count; i++) {
      const child = byRef[children.refs[i]];
      const pref = parents.refs[i];
      const parent = pref === -1 ? null : byRef[pref];
      if (!child) continue;
      child.parent = parent || null;
      if (parent) parent.children.push(child);
    }
  });

  const rows = [];
  const seen = {};
  const scripts = [];
  const particles = [];
  Object.keys(classes).forEach(function (idx) {
    const cls = classes[idx];
    const scriptClass = /^(Script|LocalScript|ModuleScript)$/.test(cls.className);
    if (scriptClass && cls.sources && cls.sources.length) {
      for (let i = 0; i < cls.sources.length; i++) {
        const src = String(cls.sources[i] || '').trim();
        if (!src) continue;
        const nm = sanitizeFilename(cls.names[i] || (cls.className + '_' + (i + 1)));
        scripts.push({ name: nm + '.lua', data: Buffer.from(src, 'utf8'), kind: cls.className });
      }
    }
    if (cls.className !== 'ParticleEmitter') {
      Object.keys(cls).forEach(function (key) {
        if (key.indexOf('ids_') !== 0) return;
        const prop = key.slice(4);
        if (prop === 'Source' || prop === 'Name' || prop === 'Texture') return;
        const typed = typeFromContext(prop, cls.className);
        (cls[key] || []).forEach(function (id) {
          if (seen[id + typed.type]) return;
          seen[id + typed.type] = true;
          const instName = cls.names && cls.names.length ? cls.names[0] : '';
          const inst = instName || (cls.className + ' ' + prop);
          rows.push({
            id: id,
            name: inst,
            type: typed.type,
            typeId: typed.typeId,
            prop: prop,
            className: cls.className,
            path: [cls.className, inst].filter(Boolean).join('/')
          });
        });
      });
    }
    if (cls.className === 'ParticleEmitter') {
      const n = (cls.instances && cls.instances.length) || cls.count || 1;
      for (let i = 0; i < n; i++) {
        const inst = (cls.instances && cls.instances[i]) || { name: (cls.names && cls.names[i]) || 'ParticleEmitter', className: 'ParticleEmitter', parent: null };
        const props = inst.props || {};
        Object.keys(cls.typed || {}).forEach(function (key) {
          if (props[key] != null) return;
          const arr = cls.typed[key] || [];
          props[key] = arr[i] != null ? arr[i] : arr[0];
        });
        const particle = particleFromProps(props, particleExtrasFromInst(inst));
        particles.push(particle);
        inst.particle = particle;
        inst._peRow = { particle: particle, inst: inst, host: topHostOf(inst), name: inst.name };
      }
    }
  });
  const peRows = [];
  Object.keys(classes).forEach(function (idx) {
    (classes[idx].instances || []).forEach(function (inst) {
      if (inst._peRow) peRows.push(inst._peRow);
    });
  });
  const tree = buildParticleTree(peRows);
  return { rows: rows, scripts: scripts, particles: particles, hosts: tree.children || [], tree: tree };
}

function parseXmlPlace(buf) {
  const text = buf.toString('utf8');
  const rows = [];
  const seen = {};
  const scripts = [];
  let idx = 0;
  while ((idx = text.indexOf('name="Source"', idx)) !== -1) {
    const before = text.slice(Math.max(0, idx - 3000), idx);
    const after = text.slice(idx, idx + 200000);
    const classM = /class="(Script|LocalScript|ModuleScript)"[\s\S]*$/.exec(before);
    const nameMatches = before.match(/<string name="Name">([^<]*)<\/string>/g) || [];
    const lastName = nameMatches.length ? />([^<]*)<\/string>/.exec(nameMatches[nameMatches.length - 1]) : null;
    const srcM = /name="Source">(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:ProtectedString|string)>/i.exec(after);
    const src = decodeXml(srcM ? srcM[1] : '').trim();
    if (src && (classM || src.indexOf('function') !== -1 || src.indexOf('local ') !== -1)) {
      scripts.push({
        name: sanitizeFilename((lastName && lastName[1]) || ((classM && classM[1]) || 'Script') + '_' + (scripts.length + 1)) + '.lua',
        data: Buffer.from(src, 'utf8'),
        kind: (classM && classM[1]) || 'Script'
      });
    }
    idx += 12;
  }
  const urlRe = /<(?:Content|string|token) name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:Content|string|token)>/gi;
  let p;
  while ((p = urlRe.exec(text))) {
    const ids = idsInText(p[2]);
    if (!ids.length) continue;
    const typed = typeFromContext(p[1], '');
    ids.forEach(function (id) {
      if (seen[id + typed.type]) return;
      seen[id + typed.type] = true;
      rows.push({
        id: id,
        name: p[1] + ' ' + id,
        type: typed.type,
        typeId: typed.typeId,
        prop: p[1],
        className: '',
        path: p[1] || 'Content'
      });
    });
  }
  idsInText(text).forEach(function (id) {
    if (seen[id + 'Content'] || seen[id + 'Audio'] || seen[id + 'Image'] || seen[id + 'Mesh'] || seen[id + 'Animation'] || seen[id + 'Decal']) return;
    seen[id + 'Content'] = true;
    rows.push({ id: id, name: id, type: 'Content', typeId: 0, prop: '', className: '' });
  });
  const xmlTree = parseXmlTree(text);
  const emitters = collectXmlEmitters(xmlTree);
  const particles = emitters.map(function (row) { return row.particle; });
  const particleTree = buildParticleTree(emitters);
  return { rows: rows, scripts: scripts, particles: particles, hosts: particleTree.children || [], tree: particleTree };
}

function ensureHosts(parsed, fallbackName) {
  parsed.particles = parsed.particles || [];
  parsed.tree = parsed.tree || { id: 'root', name: 'Root', className: 'Folder', type: 'ParticleFolder', children: parsed.hosts || [], particles: parsed.particles.slice() };
  parsed.hosts = (parsed.tree && parsed.tree.children) || parsed.hosts || [];
  if (!parsed.hosts.length && parsed.particles.length) {
    parsed.hosts = [{
      id: '1',
      number: 1,
      name: fallbackName || 'Model',
      className: 'Model',
      type: 'ParticleHost',
      typeId: 0,
      path: 'Model',
      particles: parsed.particles.slice(),
      count: parsed.particles.length,
      children: []
    }];
    parsed.tree.children = parsed.hosts;
  }
  return parsed;
}

function parsePlace(buf, fileName) {
  let parsed;
  if (isXmlRbxl(buf)) parsed = parseXmlPlace(buf);
  else {
    parsed = parseBinaryPlace(buf);
    if (!parsed.rows.length && !parsed.scripts.length && !(parsed.particles && parsed.particles.length) && !(parsed.hosts && parsed.hosts.length)) {
      parsed = parseXmlPlace(buf);
    }
  }
  return ensureHosts(parsed, fileName);
}


root.JJSParser = {
  lz4Block: lz4Block,
  listChunks: listChunks,
  parsePlace: parsePlace,
  collectNodeParticles: collectNodeParticles,
  Buffer: Buffer
};
})(typeof window !== 'undefined' ? window : globalThis);
