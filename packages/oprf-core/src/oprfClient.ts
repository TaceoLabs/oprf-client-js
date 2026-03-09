import type { AffinePoint } from '@noble/curves/abstract/curve.js';
import { encodeToCurve } from './encodeToCurve.js';
import { Fr, babyjubjub, randomScalar } from './babyjubjub.js';
import { bn254 } from '@taceo/poseidon2';

/** Blinding factor (scalar in Fr). Use randomBlindingFactor() or prepareBlindingFactor for unblinding. */
export type BlindingFactor = bigint;

/** Prepared blinding factor (inverse in Fr) for unblinding server response. */
export type PreparedBlindingFactor = bigint;

/** Sample a random blinding factor in Fr (non-zero). */
export function randomBlindingFactor(): BlindingFactor {
  let beta: bigint;
  do {
    beta = randomScalar();
  } while (beta === 0n);
  return beta;
}

/** Prepare blinding factor for unblinding (returns inverse in Fr). */
export function prepareBlindingFactor(
  beta: BlindingFactor
): PreparedBlindingFactor {
  return Fr.inv(beta);
}

/**
 * Blinds a query for the OPRF server: B = encode_to_curve(query) * beta.
 * Returns the blinded point in affine form (for OprfRequest.blinded_query).
 */
export function blindQuery(
  query: bigint,
  blindingFactor: BlindingFactor
): AffinePoint<bigint> {
  const point = encodeToCurve(query);
  const blinded = point.multiply(blindingFactor);
  return blinded.toAffine();
}

/**
 * Unblinds the server response: unblinded = blinded_response * beta_inv.
 */
export function unblindResponse(
  blindedResponse: AffinePoint<bigint>,
  preparedBlindingFactor: PreparedBlindingFactor
): AffinePoint<bigint> {
  const P = babyjubjub.Point.fromAffine(blindedResponse);
  const unblinded = P.multiply(preparedBlindingFactor);
  return unblinded.toAffine();
}

/**
 * Finalize OPRF output: H(domainSeparator, query, unblinded.x, unblinded.y), returns state[1].
 * 2Hash-DH construction.
 */
export function finalizeOutput(
  domainSeparator: bigint,
  query: bigint,
  unblindedPoint: AffinePoint<bigint>
): bigint {
  const hashInput = [
    domainSeparator,
    query,
    unblindedPoint.x,
    unblindedPoint.y,
  ];
  return bn254.t4.permutation(hashInput)[1]!;
}

/**
 * Full finalize: unblind then hash. Convenience for callers that have blinded response and raw beta.
 */
export function finalizeQuery(
  query: bigint,
  blindedResponse: AffinePoint<bigint>,
  blindingFactor: BlindingFactor,
  domainSeparator: bigint
): bigint {
  const prepared = prepareBlindingFactor(blindingFactor);
  const unblinded = unblindResponse(blindedResponse, prepared);
  return finalizeOutput(domainSeparator, query, unblinded);
}
