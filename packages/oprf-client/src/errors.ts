/**
 * Client error types matching the Rust oprf-client Error enum.
 */

export const OPRF_ERROR_CODES = {
  TIMEOUT: 4001,
  BAD_REQUEST: 4002,
} as const;

export type OprfClientErrorCode =
  | 'NonUniqueServices'
  | 'UnexpectedMsg'
  | 'ServerError'
  | 'Eof'
  | 'NotEnoughOprfResponses'
  | 'InvalidDLogProof'
  | 'InvalidUri'
  | 'WsError'
  | 'InconsistentOprfPublicKeys';

export class OprfClientError extends Error {
  readonly code: OprfClientErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: OprfClientErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OprfClientError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, OprfClientError.prototype);
  }
}

export function isOprfClientError(err: unknown): err is OprfClientError {
  return err instanceof OprfClientError;
}
