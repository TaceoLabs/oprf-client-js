/**
 * High-level client: generateChallengeRequest, verifyDlogEquality, distributedOprf.
 */

import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
  DLogCommitmentsShamir,
  dlogEqualityVerify,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
  type BlindingFactor,
  type DLogEqualityProof,
  type DLogProofShareShamir,
} from '@taceo/oprf-core';
import type { AffinePoint } from '@noble/curves/abstract/curve.js';
import { OprfClientError } from './errors.js';
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

export interface DistributedOprfOptions<Auth = unknown> {
  /** Protocol version for WebSocket query param (default "1.0.0"). */
  protocolVersion?: string;
  /** Auth payload sent in OprfRequest (must be JSON-serializable). */
  auth?: Auth;
}

/**
 * Full distributed OPRF: blind → init sessions → challenge → finish → verify → unblind → finalize.
 */
export async function distributedOprf(
  services: string[],
  module: string,
  threshold: number,
  query: bigint,
  domainSeparator: bigint,
  options: DistributedOprfOptions = {}
): Promise<VerifiableOprfOutput> {
  const blindingFactor: BlindingFactor = randomBlindingFactor();
  const blindedRequest = blindQuery(query, blindingFactor);

  const requestId = crypto.randomUUID();
  const auth = options.auth ?? ({} as unknown);
  const sessions = await initSessions(
    services,
    module,
    threshold,
    {
      request_id: requestId,
      blinded_query: blindedRequest,
      auth,
    },
    { protocolVersion: options.protocolVersion }
  );

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
  const proofShares = await finishSessions(sessions, challenge);

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
