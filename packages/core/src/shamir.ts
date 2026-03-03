/**
 * Lagrange interpolation and polynomial evaluation over BabyJubJub scalar field.
 * Matches nullifier-oracle-service oprf-core/src/shamir.rs.
 * Uses the prime subgroup order (curve.n / 8).
 */

import { Fr } from './babyjubjub.js';

/**
 * Lagrange coefficient for party myId at 0 for the set of party indices.
 * L_i(0) = prod_{j != i} (j / (j - i)) in the scalar field.
 */
export function singleLagrangeFromCoeff(
  myId: number,
  partyIds: number[]
): bigint {
  let num = 1n;
  let den = 1n;
  const i_ = Fr.create(BigInt(myId));
  for (const j of partyIds) {
    if (myId !== j) {
      const j_ = Fr.create(BigInt(j));
      num = Fr.mul(num, j_);
      den = Fr.mul(den, Fr.sub(j_, i_));
    }
  }
  const denInv = Fr.inv(den);
  if (denInv === undefined)
    throw new Error('shamir: denominator not invertible');
  return Fr.mul(num, denInv);
}

/**
 * Lagrange coefficients for each party in partyIds (at 0).
 * Same order as partyIds.
 */
export function lagrangeFromCoeff(partyIds: number[]): bigint[] {
  return partyIds.map((id) => singleLagrangeFromCoeff(id, partyIds));
}

/**
 * Evaluate polynomial at x. Coefficients low to high degree (poly[0] + poly[1]*x + ...).
 */
export function evaluatePoly(coefficients: bigint[], x: bigint): bigint {
  if (coefficients.length === 0)
    throw new Error('evaluatePoly: empty coefficients');
  const xNorm = Fr.create(x);
  let eval_ = Fr.create(coefficients[coefficients.length - 1]!);
  for (let i = coefficients.length - 2; i >= 0; i--) {
    eval_ = Fr.add(Fr.mul(eval_, xNorm), Fr.create(coefficients[i]!));
  }
  return eval_;
}

/**
 * Reconstruct secret from shares using Lagrange coefficients: sum_i share[i] * lagrange[i].
 */
export function reconstruct(shares: bigint[], lagrange: bigint[]): bigint {
  if (shares.length !== lagrange.length)
    throw new Error('reconstruct: length mismatch');
  let res = 0n;
  for (let i = 0; i < shares.length; i++) {
    res = Fr.add(res, Fr.mul(Fr.create(shares[i]!), Fr.create(lagrange[i]!)));
  }
  return res;
}
