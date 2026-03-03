/**
 * @taceolabs/oprf-client – WebSocket client for TACEO OPRF service.
 */

export {
  distributedOprf,
  generateChallengeRequest,
  verifyDlogEquality,
  type VerifiableOprfOutput,
  type OprfSessions,
} from './client.js';
export { initSessions, finishSessions } from './sessions.js';
export type {
  OprfRequest,
  OprfResponse,
  OprfPublicKeyWithEpoch,
} from './types.js';
export { OprfClientError, isOprfClientError } from './errors.js';
export type { OprfClientErrorCode } from './errors.js';
