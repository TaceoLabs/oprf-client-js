/**
 * @taceo/oprf-client-core – OPRF client core package.
 */

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

export {
  G,
  Fr,
  Fq,
  babyjubjub,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
  type AffinePoint,
} from './babyjubjub.js';
export {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  finalizeQuery,
  randomBlindingFactor,
  prepareBlindingFactor,
  type BlindingFactor,
  type PreparedBlindingFactor,
} from './oprfClient.js';
export { babyJubJubAffineToCompressedBytes } from './babyjubjub.js';
