// tiny-stack-vm-01 entry: an interpreter of make.fun's tiny stack ISA (the kit's ISA.md), one run over a whole set.
// node main.ts reads /input/<id>/program.bin with /input/<id>/input.bin and writes /output/<id>/stdout.bin (the bytes
// the program wrote, at most 65536) and /output/<id>/exit.txt (its exit code in decimal, a trap's code included),
// creating /output/<id>/ itself. MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for the mounts outside a container.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// The opcode table, laid out as the kit's OPS table: opcode byte -> (immediate bytes << 4) | (pops << 2) | pushes,
// with -1 for a byte that names no opcode (trap 5). Each group is the opcode and its three fields in hex.
const T = new Int8Array(256).fill(-1);
for (const g of '00000 01101 02401 03010 04012 05022 06023 07033 10021 11021 12021 13021 14021 15021 16021 17011 18021 19021 1A021 1B011 1C021 1D021 1E021 20021 21021 22021 30200 31210 32210 33200 34000 40011 41020 50010 51010 52001 53010'.split(' ')) T[parseInt(g, 16) >> 12] = (parseInt(g[2], 16) << 4) | (parseInt(g[3], 16) << 2) | parseInt(g[4], 16);
// One program to its end, as [output bytes, output length, exit code]: a trap ends it at once, its code is the exit
// code, the output written before it is kept and the instruction that trapped writes nothing of its own.
const run = (P, X) => {
const n = P.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
let sp = 0, cp = 0, pc = 0, st = 0, ol = 0, ip = 0;
const F = (c) => [out, ol, c];
for (;;) {
if (st === 1e6) return F(10);
if (pc < 0 || pc >= n) return F(9);
const o = P[pc], t = T[o];
if (t < 0) return F(5);
const im = t >> 4, po = (t >> 2) & 3, pu = t & 3;
if (pc + im >= n) return F(9);
st++;
const nx = pc + 1 + im;
if (sp < po) return F(2);
if (sp - po + pu > 256) return F(3);
pc = nx;
switch (o) {
case 0: return F(0);
case 1: D[sp++] = (P[nx - 1] << 24) >> 24; break;
case 2: D[sp++] = P[nx - 4] | (P[nx - 3] << 8) | (P[nx - 2] << 16) | (P[nx - 1] << 24); break;
case 3: sp--; break;
case 4: D[sp] = D[sp - 1]; sp++; break;
case 5: { const q = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = q; break; }
case 6: D[sp] = D[sp - 2]; sp++; break;
case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
case 0x30: case 0x31: case 0x32: {
// JMP (0x30) has no operand; JZ and JNZ pop one. pc is already past the immediate, so the offset is relative to it.
const rel = ((P[nx - 2] | (P[nx - 1] << 8)) << 16) >> 16;
let go = true;
if (o !== 0x30) { const v = D[--sp]; go = o === 0x31 ? v === 0 : v !== 0; }
if (go) pc = nx + rel;
break;
}
case 0x33: if (cp === 64) return F(7); C[cp++] = nx; pc = P[nx - 2] | (P[nx - 1] << 8); break;
case 0x34: if (cp === 0) return F(8); pc = C[--cp]; break;
case 0x40: { const a = D[sp - 1]; if (a < 0 || a > 255) return F(6); D[sp - 1] = M[a]; break; }
case 0x41: { const a = D[sp - 1], v = D[sp - 2]; if (a < 0 || a > 255) return F(6); sp -= 2; M[a] = v; break; }
case 0x50: { const s = '' + D[sp - 1]; if (ol + s.length > 65536) return F(11); sp--; for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i); break; }
case 0x51: if (ol >= 65536) return F(11); out[ol++] = D[--sp] & 255; break;
case 0x52: D[sp++] = ip < X.length ? X[ip++] : -1; break;
case 0x53: return F(D[--sp] & 255);
default: {
// Every remaining opcode is binary and leaves one value. Each of ISA.md's hard rules is its own line: wrapping
// multiplication, truncated signed division, the dividend's sign for MOD, the unsigned DIVU/MODU/LTU, low 5 bits for
// shifts, and the -2147483648 / -1 and % -1 special cases.
const b = D[sp - 1], a = D[sp - 2];
let r;
switch (o) {
case 0x10: r = a + b | 0; break;
case 0x11: r = a - b | 0; break;
case 0x12: r = Math.imul(a, b); break;
case 0x13: if (b === 0) return F(4); r = a === -2147483648 && b === -1 ? a : a / b | 0; break;
case 0x14: if (b === 0) return F(4); r = b === -1 ? 0 : a % b | 0; break;
case 0x15: if (b === 0) return F(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
case 0x16: if (b === 0) return F(4); r = (a >>> 0) % (b >>> 0) | 0; break;
case 0x18: r = a & b; break;
case 0x19: r = a | b; break;
case 0x1a: r = a ^ b; break;
case 0x1c: r = a << (b & 31); break;
case 0x1d: r = a >> (b & 31); break;
case 0x1e: r = a >>> (b & 31) | 0; break;
case 0x20: r = a === b ? 1 : 0; break;
case 0x21: r = a < b ? 1 : 0; break;
default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
}
sp -= 2;
D[sp++] = r;
break;
}
}
}
};
// An instance whose input.bin is missing reads as empty, so one bad instance cannot fail the whole set.
const rd = (p) => { try { return readFileSync(p); } catch { return new Uint8Array(0); } };
for (const id of readdirSync(I).sort()) {
const [out, ol, ex] = run(rd(join(I, id, 'program.bin')), rd(join(I, id, 'input.bin')));
mkdirSync(join(O, id), { recursive: true });
writeFileSync(join(O, id, 'stdout.bin'), out.subarray(0, ol));
writeFileSync(join(O, id, 'exit.txt'), ex + '\n');
}
