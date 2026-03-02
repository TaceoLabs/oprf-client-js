import { encodeToCurve } from './encodeToCurve.js';
import { babyjubjub } from '@noble/curves/misc';
import { bn254 } from '@taceo/poseidon2';

const Fp = babyjubjub.Point.Fp;

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
  const betaInv = Fp.inv(blindingFactor);
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
