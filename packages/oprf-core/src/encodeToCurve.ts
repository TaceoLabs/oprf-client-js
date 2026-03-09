/**
 * encode_to_curve for BabyJubJub – maps a field element to a point on the curve.
 * Based on [mappings.rs](https://github.com/TaceoLabs/...) and [RFC9380](https://www.rfc-editor.org/rfc/rfc9380.html).
 */

import { FpLegendre } from '@noble/curves/abstract/modular.js';
import { bn254_Fr } from '@noble/curves/bn254.js';
import { babyjubjub } from '@noble/curves/misc.js';
import { bn254 } from '@taceo/poseidon2';

const HASH_TO_FIELD_DS = 'OPRF_HashToField_BabyJubJub';
const J = 168698n;
const Z = 5n;

const Fp = babyjubjub.Point.Fp;
const ORDER = Fp.ORDER;
const ONE = 1n;
const ZERO = 0n;

// p - 2 for inv0 (Fermat little theorem: x^{-1} = x^{p-2} mod p)
const ORDER_MINUS_2 =
  21888242871839275222246405745257275088548364400416034343698204186575808495615n;

/** Bytes to field element: big-endian integer mod p (Rust from_be_bytes_mod_order). */
function bytesToFieldBe(bytes: Uint8Array): bigint {
  let n = ZERO;
  for (let i = 0; i < bytes.length; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  return n % ORDER;
}

let cachedDs: bigint | null = null;

/** Domain separator for hash_to_field as a field element. Uses same field as Poseidon (bn254_Fr). */
function getHashToFieldDs(): bigint {
  if (cachedDs !== null) return cachedDs;
  const bytes = new TextEncoder().encode(HASH_TO_FIELD_DS);
  const n = bytesToFieldBe(bytes);
  cachedDs = bn254_Fr.create(n);
  return cachedDs;
}

function select<T>(lhs: T, rhs: T, choice: boolean): T {
  return choice ? lhs : rhs;
}

/** True iff x is a square (Legendre symbol 0 or 1). */
function isSquare(x: bigint): boolean {
  const v = FpLegendre(Fp, x);
  return v === 0 || v === 1;
}

/** Inverse mod p, or 0 if x === 0. */
function inv0(x: bigint): bigint {
  return Fp.pow(x, ORDER_MINUS_2);
}

/** sgn0: true if x is odd (as integer in [0, p)). */
function sgn0(x: bigint): boolean {
  return (x & 1n) === 1n;
}

/**
 * Hash input to a single field element using Poseidon2 (RFC9380 hash_to_field style).
 * State: [domain_sep, input, 0]; returns output[1].
 */
function hashToField(input: bigint): bigint {
  const ds = getHashToFieldDs();
  const in0 = bn254_Fr.create(input);
  const state = [ds, in0, ZERO] as const;
  const output = bn254.t3.permutation(state);
  return output[1]!;
}

/**
 * Elligator2 map to Montgomery curve point (s, t).
 * Curve: K*t^2 = s^3 + J*s^2 + s, K=1 for BabyJubJub.
 */
function mapToCurveElligator2(input: bigint): [bigint, bigint] {
  const c1 = Fp.create(J);
  const z = Fp.create(Z);

  let tv1 = Fp.mul(Fp.sqr(Fp.create(input)), z);
  const e = Fp.is0(Fp.add(tv1, ONE));
  tv1 = select(ZERO, tv1, e);

  let x1 = Fp.add(tv1, ONE);
  x1 = inv0(x1);
  x1 = Fp.mul(Fp.neg(c1), x1);

  let gx1 = Fp.add(x1, c1);
  gx1 = Fp.add(Fp.mul(gx1, Fp.sqr(x1)), x1);

  const x2 = Fp.neg(Fp.add(x1, c1));
  const gx2 = Fp.mul(tv1, gx1);

  const e2 = isSquare(gx1);
  const x = select(x1, x2, e2);
  const y2 = select(gx1, gx2, e2);

  const yRaw = Fp.sqrt(y2);
  if (yRaw === undefined) throw new Error('y2 should be a square');
  const y = yRaw;

  const e3 = sgn0(y);
  const yFinal = select(Fp.neg(y), y, e2 != e3);
  return [x, yFinal];
}

/**
 * Rational map from Montgomery (s, t) to Twisted Edwards (v, w).
 */
function rationalMapMontToTwistedEdwards(
  s: bigint,
  t: bigint
): [bigint, bigint] {
  const sNorm = Fp.create(s);
  const tNorm = Fp.create(t);

  const tv1 = Fp.add(sNorm, ONE);
  let tv2 = Fp.mul(tv1, tNorm);
  tv2 = inv0(tv2);

  let v = Fp.mul(tv1, tv2);
  v = Fp.mul(v, sNorm);

  let w = Fp.mul(tv2, tNorm);
  const tv1b = Fp.sub(sNorm, ONE);
  w = Fp.mul(w, tv1b);

  const e = Fp.is0(tv2);
  w = select(ONE, w, e);
  return [v, w];
}

/**
 * Map field element to a point on the Twisted Edwards curve (affine (v, w)).
 */
function mapToCurveTwistedEdwards(input: bigint): {
  x: bigint;
  y: bigint;
} {
  const [s, t] = mapToCurveElligator2(input);
  const [v, w] = rationalMapMontToTwistedEdwards(s, t);
  return { x: v, y: w };
}

/**
 * Encode a field element to a point on BabyJubJub in the prime-order subgroup.
 * Pipeline: hash_to_field → map_to_curve (Elligator2 + rational map) → clearCofactor.
 *
 * @param input - Field element (BN254 scalar field, e.g. bigint in [0, p))
 * @returns Edwards point in the prime-order subgroup (same as noble's EdwardsPoint)
 */
export function encodeToCurve(
  input: bigint
): ReturnType<typeof babyjubjub.Point.fromAffine> {
  const u = hashToField(input);
  const { x: v, y: w } = mapToCurveTwistedEdwards(u);
  const P = babyjubjub.Point.fromAffine({ x: v, y: w });
  return P.clearCofactor();
}
