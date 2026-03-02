/**
 * Chaum-Pedersen discrete logarithm equality proof over BabyJubJub.
 * Proves knowledge of x such that A = x·D and C = x·B without revealing x.
 * Matches nullifier-oracle-service oprf-core/src/dlog_equality.rs.
 */

import { AffinePoint } from '@noble/curves/abstract/curve';
import { bn254_Fr } from '@noble/curves/bn254';
import { babyjubjub } from '@noble/curves/misc';
import { bn254 } from '@taceo/poseidon2';

const DLOG_DS = 'DLOG Equality Proof';

const Fp = babyjubjub.Point.Fp;
const Fn = babyjubjub.Point.Fn;
const ZERO = 0n;

/** BabyJubJub subgroup order (scalar modulus r). */
export const SCALAR_ORDER = babyjubjub.Point.CURVE().n;

/** Chaum-Pedersen proof: challenge e (base field), response s (scalar). */
export interface DLogEqualityProof {
  e: bigint;
  s: bigint;
}

/** Thrown when proof verification fails. */
export class InvalidProofError extends Error {
  constructor(reason?: string) {
    super(reason ? `Invalid DLogProof: ${reason}` : 'Invalid DLogProof');
    this.name = 'InvalidProofError';
  }
}

let cachedDlogDs: bigint | null = null;

/** Domain separator as base-field element (from_be_bytes_mod_order). */
function getDlogDs(): bigint {
  if (cachedDlogDs !== null) return cachedDlogDs;
  const bytes = new TextEncoder().encode(DLOG_DS);
  let n = ZERO;
  for (let i = 0; i < bytes.length; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  cachedDlogDs = n % Fp.ORDER;
  return cachedDlogDs;
}

/** Map base-field element to scalar (mod r). Equivalent to Rust convert_base_to_scalar. */
function convertBaseToScalar(f: bigint): bigint {
  return Fn.create(f);
}

/** Fiat-Shamir challenge: H(DS, a, b, c, d, r1, r2) via Poseidon2 t16, output state[1]. */
function challengeHash(
  a: AffinePoint<bigint>,
  b: AffinePoint<bigint>,
  c: AffinePoint<bigint>,
  d: AffinePoint<bigint>,
  r1: AffinePoint<bigint>,
  r2: AffinePoint<bigint>
): bigint {
  const ds = getDlogDs();
  const state = [
    ds,
    a.x,
    a.y,
    b.x,
    b.y,
    c.x,
    c.y,
    d.x,
    d.y,
    r1.x,
    r1.y,
    r2.x,
    r2.y,
    ZERO,
    ZERO,
    ZERO,
  ].map((v) => bn254_Fr.create(v));
  return bn254.t16.permutation(state)[1]!;
}

/** Generator G (BabyJubJub standard base point). */
const G = babyjubjub.Point.BASE;

/** Sample uniform random scalar in [0, r) using crypto.getRandomValues. */
function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let n = ZERO;
  for (let i = 0; i < 32; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  return Fn.create(n);
}

/**
 * Create a Chaum-Pedersen proof that C = x·B and A = x·D share the same dlog x.
 * D is the generator G. Caller supplies B and secret x; A = G·x, C = B·x.
 *
 * @param b - Base point B (affine or Point)
 * @param x - Secret scalar (should be in [0, r))
 * @returns Proof { e, s } verifiable with (A, B, C, D) where A = G·x, C = B·x, D = G
 */
export function dlogEqualityProof(
  b: AffinePoint<bigint>,
  x: bigint
): DLogEqualityProof {
  const B = babyjubjub.Point.fromAffine(b);
  const xNorm = Fn.create(x);
  const k = randomScalar();
  const R1 = G.multiplyUnsafe(k);
  const R2 = B.multiplyUnsafe(k);
  const A = G.multiplyUnsafe(xNorm);
  const C = B.multiplyUnsafe(xNorm);
  const D = G;
  const e = challengeHash(
    A.toAffine(),
    B.toAffine(),
    C.toAffine(),
    D.toAffine(),
    R1.toAffine(),
    R2.toAffine()
  );
  const eScalar = convertBaseToScalar(e);
  const s = Fn.create(k + eScalar * xNorm);
  return { e, s };
}

/**
 * Verify a Chaum-Pedersen proof that A = x·D and C = x·B for the same x.
 *
 * @param proof - { e, s }
 * @param a - Point A = x·D
 * @param b - Point B
 * @param c - Point C = x·B
 * @param d - Point D (generator)
 * @throws InvalidProofError if verification fails
 */
export function dlogEqualityVerify(
  proof: DLogEqualityProof,
  a: AffinePoint<bigint>,
  b: AffinePoint<bigint>,
  c: AffinePoint<bigint>,
  d: AffinePoint<bigint>
): void {
  const A = babyjubjub.Point.fromAffine(a);
  const B = babyjubjub.Point.fromAffine(b);
  const C = babyjubjub.Point.fromAffine(c);
  const D = babyjubjub.Point.fromAffine(d);

  for (const p of [A, B, C, D]) {
    try {
      p.assertValidity();
    } catch {
      throw new InvalidProofError();
    }
    if (p.is0()) throw new InvalidProofError();
    if (!p.isTorsionFree()) throw new InvalidProofError();
  }

  if (proof.s >= SCALAR_ORDER) throw new InvalidProofError();
  if (proof.s < 0) throw new InvalidProofError();

  const eScalar = convertBaseToScalar(proof.e);
  const R1Prime = D.multiplyUnsafe(proof.s).subtract(A.multiplyUnsafe(eScalar));
  const R2Prime = B.multiplyUnsafe(proof.s).subtract(C.multiplyUnsafe(eScalar));
  if (R1Prime.is0() || R2Prime.is0()) throw new InvalidProofError();

  const eComputed = challengeHash(
    A.toAffine(),
    B.toAffine(),
    C.toAffine(),
    D.toAffine(),
    R1Prime.toAffine(),
    R2Prime.toAffine()
  );
  if (eComputed !== proof.e) throw new InvalidProofError();
}
