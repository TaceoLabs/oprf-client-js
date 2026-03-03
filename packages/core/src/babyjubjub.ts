import { babyjubjub } from '@noble/curves/misc';
import { Field } from '@noble/curves/abstract/modular';
import { AffinePoint } from '@noble/curves/abstract/curve';

const CURVE_N = babyjubjub.Point.CURVE().n;
const COFACTOR = 8n;
/** Prime subgroup order so Lagrange denominators (e.g. 2) are invertible. */
const SUBGROUP_SCALAR_ORDER = CURVE_N / COFACTOR;
export const Fr = Field(SUBGROUP_SCALAR_ORDER, 249);
export const Fq = babyjubjub.Point.Fp;

/** Prime-order subgroup generator (matches ark_babyjubjub). */
export const BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE: AffinePoint<bigint> = {
  x: 5299619240641551281634865583518297030282874472190772894086521144482721001553n,
  y: 16950150798460657717958625567821834550301663161624707787222815936182638968203n,
};

export const G = babyjubjub.Point.fromAffine(
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE
);

export { babyjubjub };

const BYTES = 32;

/** Bigint to 32-byte little-endian (reduced mod ORDER). */
function bigintToBytesLE(v: bigint): Uint8Array {
  const reduced = v % Fq.ORDER;
  if (reduced < 0n) throw new Error('expected non-negative');
  const bytes = new Uint8Array(BYTES);
  let x = reduced;
  for (let i = 0; i < BYTES; i++) {
    bytes[i] = Number(x & 0xffn);
    x = x >> 8n;
  }
  return bytes;
}

/** Compare two 32-byte LE arrays: true if a > b lexicographically (index 31 is MSB). */
function compareLE(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = BYTES - 1; i >= 0; i--) {
    if (a[i]! > b[i]!) return true;
    if (a[i]! < b[i]!) return false;
  }
  return false;
}

/**
 * Serialize a BabyJubJub affine point to the same format as taceo-ark-babyjubjub serialize_compressed.
 * Edwards: y in LE; top bit of last byte = 1 when x > -x lexicographically (LE bytes), else 0.
 */
export function babyJubJubAffineToCompressedBytes(
  p: AffinePoint<bigint>
): Uint8Array {
  const y = Fq.create(p.y);
  const x = Fq.create(p.x);
  const negX = Fq.neg(x);
  const yBytes = bigintToBytesLE(y);
  const xBytes = bigintToBytesLE(x);
  const negXBytes = bigintToBytesLE(negX);
  const flag = compareLE(xBytes, negXBytes) ? 1 : 0;
  yBytes[BYTES - 1] = (yBytes[BYTES - 1]! & 0x7f) | (flag << 7);
  return yBytes;
}
