/**
 * @taceolabs/oprf-client-core – OPRF client core package.
 */

export const VERSION = '0.0.0';

export { encodeToCurve } from './encodeToCurve.js';
export {
  dlogEqualityProof,
  dlogEqualityVerify,
  SCALAR_ORDER,
  InvalidProofError,
  type DLogEqualityProof,
} from './dlogEquality.js';
