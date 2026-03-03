import { encodeToCurve } from './encodeToCurve.js';
import { Fq, babyjubjub } from './babyjubjub.js';
import { bn254 } from '@taceo/poseidon2';

export function blindQuery(
  query: bigint,
  blindingFactor: bigint
): ReturnType<typeof babyjubjub.Point.fromAffine> {
  const point = encodeToCurve(query);
  return point.multiply(blindingFactor);
}

export function finalizeQuery(
  query: bigint,
  response: ReturnType<typeof babyjubjub.Point.fromAffine>,
  blindingFactor: bigint,
  domainSeparator: bigint
): bigint {
  // unblind the response
  const betaInv = Fq.inv(blindingFactor);
  const responseUnblinded = response.multiply(betaInv);
  const responseUnblindedAffine = responseUnblinded.toAffine();
  // compute the second hash in the TwoHashDH construction
  const hashInput = [
    domainSeparator,
    query,
    responseUnblindedAffine.x,
    responseUnblindedAffine.y,
  ];
  const hash = bn254.t4.permutation(hashInput)[1];
  return hash;
}
