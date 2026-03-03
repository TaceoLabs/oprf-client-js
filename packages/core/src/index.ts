/**
 * @taceolabs/oprf-client-core – OPRF client core package.
 */

export const VERSION = '0.0.0';

export { encodeToCurve } from './encodeToCurve.js';
export {
  dlogEqualityProof,
  dlogEqualityVerify,
  challengeHash,
  convertBaseToScalar,
  InvalidProofError,
  type DLogEqualityProof,
} from './dlogEquality.js';
export {
  partialCommitments,
  combineTwoNonceRandomness,
  combineProofs,
  type CombineProofsOptions,
  type PartialDLogEqualityCommitments,
  type DLogEqualityCommitmentsData,
  type DLogEqualityProofShare,
  type DLogEqualitySession,
} from './ddlogEquality.js';
export {
  DLogCommitmentsShamir,
  DLogSessionShamir,
  type DLogShareShamir,
  type PartialDLogCommitmentsShamir,
  type DLogProofShareShamir,
} from './ddlogEqualityShamir.js';
export {
  lagrangeFromCoeff,
  singleLagrangeFromCoeff,
  evaluatePoly,
  reconstruct,
} from './shamir.js';

export { G, Fr, Fq, babyjubjub } from './babyjubjub.js';
