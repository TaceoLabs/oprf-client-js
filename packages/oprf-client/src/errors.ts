/**
 * Client error types matching the Rust oprf-client Error enum.
 * Two-tier model: NodeError (per-node) and OprfClientError (protocol-level).
 */

// ── ServiceError ─────────────────────────────────────────────────────────────

/**
 * Application-level error received in a WebSocket close frame from a node.
 */
export class ServiceError extends Error {
  readonly errorCode: number;
  readonly msg?: string;

  constructor(errorCode: number, msg?: string) {
    super(msg ?? `Service error ${errorCode}`);
    this.name = 'ServiceError';
    this.errorCode = errorCode;
    this.msg = msg;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

// ── NodeError ─────────────────────────────────────────────────────────────────

export type NodeErrorCode =
  | 'ServiceError'
  | 'WsError'
  | 'UnexpectedMessage'
  | 'Unknown';

/**
 * Per-node error, discriminated by `code`.
 */
export class NodeError extends Error {
  readonly code: NodeErrorCode;
  readonly reason?: string;
  readonly cause?: Error;
  readonly serviceError?: ServiceError;

  constructor(
    code: NodeErrorCode,
    opts: {
      reason?: string;
      cause?: Error;
      serviceError?: ServiceError;
    } = {}
  ) {
    super(opts.reason ?? opts.serviceError?.message ?? code);
    this.name = 'NodeError';
    this.code = code;
    this.reason = opts.reason;
    this.cause = opts.cause;
    this.serviceError = opts.serviceError;
    Object.setPrototypeOf(this, NodeError.prototype);
  }
}

export function isNodeError(err: unknown): err is NodeError {
  return err instanceof NodeError;
}

// ── OprfClientError ───────────────────────────────────────────────────────────

export type OprfClientErrorCode =
  | 'NonUniqueServices'
  | 'InvalidDLogProof'
  | 'InconsistentOprfPublicKeys'
  | 'ThresholdServiceError'
  | 'Networking'
  | 'UnexpectedMessage'
  | 'CannotFinishSession'
  | 'NodeErrorDisagreement'
  | 'Unknown';

export interface OprfClientErrorDetails {
  nodeErrors?: NodeError[];
  serviceError?: ServiceError;
  cause?: NodeError;
  networkingErrors?: Error[];
}

export class OprfClientError extends Error {
  readonly code: OprfClientErrorCode;
  readonly details?: OprfClientErrorDetails;

  constructor(
    code: OprfClientErrorCode,
    message: string,
    details?: OprfClientErrorDetails
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

// ── aggregateError ────────────────────────────────────────────────────────────

/**
 * Aggregate per-node errors into a protocol-level OprfClientError.
 * Mirrors Rust oprf-client aggregate_error logic:
 *  - >= threshold ServiceErrors with same code → ThresholdServiceError
 *  - >= threshold UnexpectedMessage with same reason → UnexpectedMessage
 *  - >= threshold WsErrors → Networking
 *  - Otherwise → NodeErrorDisagreement
 */
export function aggregateError(
  threshold: number,
  errors: NodeError[]
): OprfClientError {
  // Count ServiceError by errorCode
  const serviceErrorCounts = new Map<
    number,
    { count: number; err: ServiceError }
  >();
  for (const e of errors) {
    if (e.code === 'ServiceError' && e.serviceError) {
      const code = e.serviceError.errorCode;
      const existing = serviceErrorCounts.get(code);
      if (existing) {
        existing.count++;
      } else {
        serviceErrorCounts.set(code, { count: 1, err: e.serviceError });
      }
    }
  }
  for (const { count, err } of serviceErrorCounts.values()) {
    if (count >= threshold) {
      return new OprfClientError(
        'ThresholdServiceError',
        `${count} nodes returned service error ${err.errorCode}: ${err.msg ?? ''}`.trim(),
        { serviceError: err }
      );
    }
  }

  // Count UnexpectedMessage by reason
  const unexpectedCounts = new Map<string, number>();
  for (const e of errors) {
    if (e.code === 'UnexpectedMessage') {
      const key = e.reason ?? '';
      unexpectedCounts.set(key, (unexpectedCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [reason, count] of unexpectedCounts) {
    if (count >= threshold) {
      return new OprfClientError(
        'UnexpectedMessage',
        `${count} nodes reported unexpected message: ${reason}`,
        { nodeErrors: errors }
      );
    }
  }

  // Count WsErrors
  const wsErrors = errors.filter((e) => e.code === 'WsError');
  if (wsErrors.length >= threshold) {
    return new OprfClientError(
      'Networking',
      `${wsErrors.length} nodes had networking errors`,
      { networkingErrors: wsErrors.map((e) => e.cause ?? e) }
    );
  }

  // Fallback: disagreement
  return new OprfClientError(
    'NodeErrorDisagreement',
    'Nodes returned disagreeing errors',
    { nodeErrors: errors }
  );
}
