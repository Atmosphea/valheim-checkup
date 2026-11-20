// Synthetic .fch builder, ported from scripts/test.cjs so P42 and edge-case strings can be tested
// without personal data. Character name is always "Fixture".
const crypto = require('node:crypto');

const i = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const f = n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; };
const str = s => { const b = Buffer.from(s), a = []; let n = b.length; do { a.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n); return Buffer.concat([Buffer.from(a), b]); };
const dict = o => Buffer.concat([i(Object.keys(o).length), ...Object.entries(o).flatMap(([k, v]) => [str(k), f(v)])]);

/**
 * @param {{latest?: boolean, name?: string, eat?: object, skills?: {id:number,level:number,xp:number}[]}} opts
 */
function fixture({ latest = false, name = 'Fixture', eat = { '$item_honeyglazedchicken': 17 }, skills = [{ id: 102, level: 33.5, xp: 16.5 }] } = {}) {
  const skillBytes = [i(2), i(skills.length), ...skills.flatMap(s => [i(s.id), f(s.level), f(s.xp)])];
  const player = Buffer.concat([i(latest ? 34 : 33), f(25), f(25), f(0), f(0), str(''), f(0), i(latest ? 110 : 109), Buffer.alloc(2), ...Array.from({ length: 7 }, () => i(0)), i(0), str(''), str(''), Buffer.alloc(24), i(0), i(0), ...skillBytes, i(0), f(0), f(0), f(0), i(0), ...(latest ? [i(2), i(12), i(3), i(-42), i(7), i(1), i(99), i(-1234)] : [])]);
  const buckets = Array.from({ length: 10 }, () => Buffer.concat([Buffer.alloc(205 * 4), dict({}), dict({}), dict({}), i(5), ...Array.from({ length: 5 }, () => dict({})), dict({}), dict({}), dict({}), dict(eat), dict({})]));
  const body = Buffer.concat([i(latest ? 47 : 46), i(205), i(10), ...buckets, Buffer.from([0]), i(0), str(name), Buffer.alloc(8), str(''), Buffer.from([0]), Buffer.alloc(8), Buffer.from([1]), i(player.length), player]);
  return Buffer.concat([i(body.length), body, i(64), crypto.createHash('sha512').update(body).digest()]);
}

function damaged() { const b = fixture(); b[100] ^= 1; return b; }
function profile48() {
  const b = fixture(); b.writeInt32LE(48, 4);
  crypto.createHash('sha512').update(b.subarray(4, 4 + b.readInt32LE(0))).digest().copy(b, b.length - 64);
  return b;
}

module.exports = { fixture, damaged, profile48 };
