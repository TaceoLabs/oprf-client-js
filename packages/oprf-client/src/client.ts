/**
 * High-level client: generateChallengeRequest, verifyDlogEquality, distributedOprf.
 */

import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  prepareBlindingFactor,
  DLogCommitmentsShamir,
  dlogEqualityVerify,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
  type BlindingFactor,
  type DLogEqualityProof,
  type DLogProofShareShamir,
} from '@taceo/oprf-core';
import { randomBytes } from '@noble/hashes/utils.js';
import type { AffinePoint } from '@noble/curves/abstract/curve.js';
import {
  OprfClientError,
  aggregateError,
  isNodeError,
  type NodeError,
} from './errors.js';
import type { OprfSessions } from './sessions.js';
import { initSessions, finishSessions } from './sessions.js';

export type { OprfSessions };

export interface VerifiableOprfOutput {
  output: bigint;
  dlogProof: DLogEqualityProof;
  blindedRequest: AffinePoint<bigint>;
  blindedResponse: AffinePoint<bigint>;
  unblindedResponse: AffinePoint<bigint>;
  oprfPublicKey: AffinePoint<bigint>;
  epoch: number;
}

/**
 * Build challenge from sessions: contributingParties = party_id + 1 per party, then combineCommitments.
 */
export function generateChallengeRequest(
  sessions: OprfSessions
): DLogCommitmentsShamir {
  const contributingParties = sessions.partyIds.map((id) => id + 1);
  return DLogCommitmentsShamir.combineCommitments(
    sessions.commitments,
    contributingParties
  );
}

/**
 * Combine proof shares, verify DLog proof. Throws OprfClientError if invalid.
 */
export function verifyDlogEquality(
  requestId: string,
  oprfPublicKey: AffinePoint<bigint>,
  blindedRequest: AffinePoint<bigint>,
  proofShares: DLogProofShareShamir[],
  challenge: DLogCommitmentsShamir
): DLogEqualityProof {
  const blindedResponse = challenge.blindedResponse();
  const proof = challenge.combineProofs(
    requestId,
    proofShares,
    oprfPublicKey,
    blindedRequest
  );
  try {
    dlogEqualityVerify(
      proof,
      oprfPublicKey,
      blindedRequest,
      blindedResponse,
      BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE
    );
  } catch {
    throw new OprfClientError(
      'InvalidDLogProof',
      'DLog proof could not be verified'
    );
  }
  return proof;
}

/**
 * Full distributed OPRF: blind → init sessions → challenge → finish → verify → unblind → finalize.
 * Services must be pre-built WS URLs (use toOprfUri / toOprfUriMany).
 */
export async function distributedOprf(
  services: string[],
  threshold: number,
  query: bigint,
  blindingFactor: BlindingFactor,
  domainSeparator: bigint,
  auth?: unknown,
): Promise<VerifiableOprfOutput> {
  if (new Set(services).size !== services.length) {
    throw new OprfClientError('NonUniqueServices', 'Services must be unique');
  }

  const blindedRequest = blindQuery(query, blindingFactor);
  const requestId = generateRequestId();

  let sessions: OprfSessions;
  try {
    sessions = await initSessions(services, threshold, {
      request_id: requestId,
      blinded_query: blindedRequest,
      auth,
    });
  } catch (err) {
    // initSessions throws NodeError[] on threshold failure
    if (Array.isArray(err) && err.every(isNodeError)) {
      throw aggregateError(threshold, err as NodeError[]);
    }
    throw err;
  }

  const firstKey = sessions.oprfPublicKeys[0]!;
  for (const key of sessions.oprfPublicKeys) {
    if (key.x !== firstKey.x || key.y !== firstKey.y) {
      throw new OprfClientError(
        'InconsistentOprfPublicKeys',
        'OPRF nodes returned different public keys'
      );
    }
  }
  const oprfPublicKey = firstKey;

  const challenge = generateChallengeRequest(sessions);

  let proofShares: DLogProofShareShamir[];
  try {
    proofShares = await finishSessions(sessions, challenge);
  } catch (err) {
    // finishSessions throws NodeError (from ws methods)
    if (isNodeError(err)) {
      throw new OprfClientError(
        'CannotFinishSession',
        `Failed to finish session: ${err.message}`,
        { cause: err }
      );
    }
    throw err;
  }

  const dlogProof = verifyDlogEquality(
    requestId,
    oprfPublicKey,
    blindedRequest,
    proofShares,
    challenge
  );

  const blindedResponse = challenge.blindedResponse();
  const prepared = prepareBlindingFactor(blindingFactor);
  const unblindedResponse = unblindResponse(blindedResponse, prepared);
  const output = finalizeOutput(domainSeparator, query, unblindedResponse);

  return {
    output,
    dlogProof,
    blindedRequest,
    blindedResponse,
    unblindedResponse,
    oprfPublicKey,
    epoch: sessions.epoch,
  };
}

function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  // Fallback for environments without randomUUID
  const bytes = randomBytes(16)
  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
