/**
 * Session management: init_sessions (parallel connect, collect by epoch to threshold),
 * finish_sessions (send challenge, collect proof shares). Mirrors Rust oprf-client sessions.
 */

import {
  DLogCommitmentsShamir,
  type PartialDLogCommitmentsShamir,
  type DLogProofShareShamir,
} from '@taceo/oprf-client-core';
import { OprfClientError } from './errors.js';
import type { OprfRequest, OprfPublicKeyWithEpoch } from './types.js';
import { affineToWire, challengeToWire } from './types.js';
import { WebSocketSession } from './ws.js';

export interface OprfSessions {
  readonly ws: WebSocketSession[];
  readonly partyIds: number[];
  readonly commitments: PartialDLogCommitmentsShamir[];
  readonly oprfPublicKeys: AffinePointLike[];
  readonly epoch: number;
}

/** Internal: we only need key as affine for verification. */
interface AffinePointLike {
  x: bigint;
  y: bigint;
}

function oprfPublicKeyToAffine(k: OprfPublicKeyWithEpoch): AffinePointLike {
  return k.key;
}

/**
 * Open WebSockets to each service in parallel, send oprfRequest, collect OprfResponse.
 * Group by epoch; when an epoch has >= threshold responses with distinct party_id, return those sessions (sorted by party_id).
 * Fails with NotEnoughOprfResponses if threshold not met.
 */
export async function initSessions<Auth>(
  services: string[],
  module: string,
  threshold: number,
  oprfRequest: OprfRequest<Auth>,
  config: { protocolVersion?: string } = {}
): Promise<OprfSessions> {
  const dedup = [...new Set(services)].sort();
  if (dedup.length !== services.length) {
    throw new OprfClientError('NonUniqueServices', 'Services must be unique');
  }

  const requestWire = {
    request_id: oprfRequest.request_id,
    blinded_query: affineToWire(oprfRequest.blinded_query),
    auth: oprfRequest.auth,
  };

  const results = await Promise.allSettled(
    dedup.map(async (service) => {
      const session = await WebSocketSession.connect(service, module, config);
      await session.send(requestWire);
      const response = await session.readOprfResponse();
      return { session, response };
    })
  );

  const epochMap = new Map<
    number,
    {
      ws: WebSocketSession[];
      partyIds: number[];
      commitments: PartialDLogCommitmentsShamir[];
      oprfPublicKeys: AffinePointLike[];
    }
  >();
  const errors = new Map<string, unknown>();

  for (let i = 0; i < results.length; i++) {
    const service = dedup[i]!;
    const r = results[i]!;
    if (r.status === 'rejected') {
      errors.set(service, r.reason);
      continue;
    }
    const { session, response } = r.value;
    const epoch = response.oprf_pub_key_with_epoch.epoch;
    let bucket = epochMap.get(epoch);
    if (!bucket) {
      bucket = { ws: [], partyIds: [], commitments: [], oprfPublicKeys: [] };
      epochMap.set(epoch, bucket);
    }
    if (bucket.partyIds.includes(response.party_id)) {
      session.close();
      continue;
    }
    bucket.ws.push(session);
    bucket.partyIds.push(response.party_id);
    bucket.commitments.push(response.commitments);
    bucket.oprfPublicKeys.push(
      oprfPublicKeyToAffine(response.oprf_pub_key_with_epoch)
    );

    if (bucket.ws.length >= threshold) {
      // close other sessions that we won't use
      for (let j = i + 1; j < results.length; j++) {
        const r2 = results[j];
        if (r2.status === 'rejected') {
          continue;
        }
        r2.value?.session.close();
      }
      break;
    }
  }

  for (const [epoch, bucket] of epochMap) {
    if (bucket.ws.length >= threshold) {
      for (const [otherEpoch, otherBucket] of epochMap) {
        if (otherEpoch !== epoch) {
          for (const ws of otherBucket.ws) ws.close();
        }
      }
      const order = bucket.partyIds
        .map((id, i) => ({ id, i }))
        .sort((a, b) => a.id - b.id);
      return {
        ws: order.map(({ i }) => bucket.ws[i]!),
        partyIds: order.map(({ id }) => id),
        commitments: order.map(({ i }) => bucket.commitments[i]!),
        oprfPublicKeys: order.map(({ i }) => bucket.oprfPublicKeys[i]!),
        epoch,
      };
    }
  }

  throw new OprfClientError(
    'NotEnoughOprfResponses',
    `Could not reach ${threshold} responses`,
    { errors: Object.fromEntries(errors) }
  );
}

/**
 * Send the same challenge to each session, read proof share, then close.
 * Returns proof shares in the same order as sessions.ws.
 */
export async function finishSessions(
  sessions: OprfSessions,
  challenge: DLogCommitmentsShamir
): Promise<DLogProofShareShamir[]> {
  const wire = challengeToWire(challenge.data);
  const results = await Promise.all(
    sessions.ws.map(async (session) => {
      await session.sendChallenge(wire);
      const share = await session.readProofShare();
      session.close();
      return { value: share.value };
    })
  );
  return results;
}
