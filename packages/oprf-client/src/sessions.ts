/**
 * Session management: initSessions (parallel connect, collect by epoch to threshold),
 * finishSessions (send challenge, collect proof shares). Mirrors Rust oprf-client sessions.
 */

import {
  DLogCommitmentsShamir,
  type PartialDLogCommitmentsShamir,
  type DLogProofShareShamir,
} from '@taceo/oprf-core';
import { NodeError } from './errors.js';
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

interface EpochBucket {
  ws: WebSocketSession[];
  partyIds: number[];
  commitments: PartialDLogCommitmentsShamir[];
  oprfPublicKeys: AffinePointLike[];
}

function oprfPublicKeyToAffine(k: OprfPublicKeyWithEpoch): AffinePointLike {
  return k.key;
}

function toNodeError(err: unknown): NodeError {
  if (err && err instanceof NodeError) {
    return err;
  }
  return new NodeError('Unknown', {
    reason: String(err),
    cause: err instanceof Error ? err : undefined,
  });
}

/**
 * Open WebSockets to each service in parallel, send oprfRequest, collect OprfResponse.
 * Services must be pre-built WS URLs (see toOprfUri / toOprfUriMany).
 * Responses are processed as they arrive and grouped by epoch; as soon as an epoch has
 * threshold responses with distinct party_id, those sessions are returned (sorted by party_id)
 * without waiting for the remaining services, and every other open session is closed.
 * On failure: closes all opened sessions and throws NodeError[] (caller wraps via aggregateError).
 */
export function initSessions<Auth>(
  services: string[],
  threshold: number,
  oprfRequest: OprfRequest<Auth>
): Promise<OprfSessions> {
  const requestWire = {
    request_id: oprfRequest.request_id,
    blinded_query: affineToWire(oprfRequest.blinded_query),
    auth: oprfRequest.auth,
  };

  return new Promise<OprfSessions>((resolve, reject) => {
    const epochMap = new Map<number, EpochBucket>();
    const nodeErrors: NodeError[] = [];
    // Every session we managed to open, so none is left dangling once we are done.
    const opened = new Set<WebSocketSession>();
    let pending = services.length;
    let done = false;

    const closeAllExcept = (keep: ReadonlySet<WebSocketSession>) => {
      for (const session of opened) {
        if (!keep.has(session)) session.close();
      }
    };

    const onSettled = () => {
      pending--;
      if (pending === 0 && !done) {
        // Not enough responses — throw collected node errors for caller to aggregate
        done = true;
        closeAllExcept(new Set());
        reject(nodeErrors);
      }
    };

    const onResponse = (
      session: WebSocketSession,
      response: Awaited<ReturnType<WebSocketSession['readOprfResponse']>>
    ) => {
      const epoch = response.oprf_pub_key_with_epoch.epoch;
      let bucket = epochMap.get(epoch);
      if (!bucket) {
        bucket = { ws: [], partyIds: [], commitments: [], oprfPublicKeys: [] };
        epochMap.set(epoch, bucket);
      }
      if (bucket.partyIds.includes(response.party_id)) {
        session.close();
        return;
      }
      bucket.ws.push(session);
      bucket.partyIds.push(response.party_id);
      bucket.commitments.push(response.commitments);
      bucket.oprfPublicKeys.push(
        oprfPublicKeyToAffine(response.oprf_pub_key_with_epoch)
      );

      if (bucket.ws.length >= threshold) {
        done = true;
        // close every session we won't use, including ones still waiting for a response
        closeAllExcept(new Set(bucket.ws));
        const chosen = bucket;
        const order = chosen.partyIds
          .map((id, i) => ({ id, i }))
          .sort((a, b) => a.id - b.id);
        resolve({
          ws: order.map(({ i }) => chosen.ws[i]!),
          partyIds: order.map(({ id }) => id),
          commitments: order.map(({ i }) => chosen.commitments[i]!),
          oprfPublicKeys: order.map(({ i }) => chosen.oprfPublicKeys[i]!),
          epoch,
        });
      }
    };

    if (pending === 0) {
      done = true;
      reject(nodeErrors);
      return;
    }

    for (const service of services) {
      const run = async () => {
        const session = await WebSocketSession.connect(service);
        opened.add(session);
        if (done) {
          // threshold already reached (or failed) while this one was connecting
          session.close();
          return;
        }
        session.send(requestWire);
        const response = await session.readOprfResponse();
        if (done) {
          session.close();
          return;
        }
        onResponse(session, response);
      };
      run().then(onSettled, (err: unknown) => {
        if (!done) nodeErrors.push(toNodeError(err));
        onSettled();
      });
    }
  });
}

/**
 * Send the same challenge to each session, read proof share, then close.
 * Returns proof shares in the same order as sessions.ws.
 * Errors bubble up as NodeError (thrown from ws methods).
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
