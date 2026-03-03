/**
 * Wire and API types for OPRF client.
 * Matches nullifier-oracle-service oprf-types (OprfRequest, OprfResponse, etc.).
 */

import type { AffinePoint } from '@noble/curves/abstract/curve';
import type { PartialDLogEqualityCommitments } from '@taceolabs/oprf-client-core';

/** Affine point as JSON (bigint as string for serialization). */
export interface AffinePointWire {
  x: string;
  y: string;
}

/** OPRF public key with epoch (wire shape). */
export interface OprfPublicKeyWithEpochWire {
  key: AffinePointWire;
  epoch: number;
}

/** Client request sent to server (wire shape). */
export interface OprfRequestWire<Auth = unknown> {
  request_id: string;
  blinded_query: AffinePointWire;
  auth: Auth;
}

/** Server response (wire shape). */
export interface OprfResponseWire {
  commitments: PartialDLogEqualityCommitmentsWire;
  party_id: number;
  oprf_pub_key_with_epoch: OprfPublicKeyWithEpochWire;
}

/** Per-party commitments (wire shape; points as x,y strings). */
export interface PartialDLogEqualityCommitmentsWire {
  c: AffinePointWire;
  d1: AffinePointWire;
  d2: AffinePointWire;
  e1: AffinePointWire;
  e2: AffinePointWire;
}

/** DLog proof share (wire: single scalar as string). */
export interface DLogProofShareShamirWire {
  value: string;
}

/** DLogCommitmentsShamir wire (server expects snake_case: contributing_parties). */
export interface DLogCommitmentsShamirWire {
  c: AffinePointWire;
  d1: AffinePointWire;
  d2: AffinePointWire;
  e1: AffinePointWire;
  e2: AffinePointWire;
  contributing_parties: number[];
}

/** OprfPublicKeyWithEpoch (internal: affine points). */
export interface OprfPublicKeyWithEpoch {
  key: AffinePoint<bigint>;
  epoch: number;
}

/** OprfRequest (internal: affine for blinded_query). */
export interface OprfRequest<Auth = unknown> {
  request_id: string;
  blinded_query: AffinePoint<bigint>;
  auth: Auth;
}

/** OprfResponse (internal: affine points). */
export interface OprfResponse {
  commitments: PartialDLogEqualityCommitments;
  party_id: number;
  oprf_pub_key_with_epoch: OprfPublicKeyWithEpoch;
}

export function wireToAffine(w: AffinePointWire): AffinePoint<bigint> {
  return { x: BigInt(w.x), y: BigInt(w.y) };
}

export function affineToWire(p: AffinePoint<bigint>): AffinePointWire {
  return { x: p.x.toString(), y: p.y.toString() };
}

export function wireToCommitments(
  w: PartialDLogEqualityCommitmentsWire
): PartialDLogEqualityCommitments {
  return {
    c: wireToAffine(w.c),
    d1: wireToAffine(w.d1),
    d2: wireToAffine(w.d2),
    e1: wireToAffine(w.e1),
    e2: wireToAffine(w.e2),
  };
}

export function commitmentsToWire(
  c: PartialDLogEqualityCommitments
): PartialDLogEqualityCommitmentsWire {
  return {
    c: affineToWire(c.c),
    d1: affineToWire(c.d1),
    d2: affineToWire(c.d2),
    e1: affineToWire(c.e1),
    e2: affineToWire(c.e2),
  };
}

export function wireToOprfResponse(w: OprfResponseWire): OprfResponse {
  return {
    commitments: wireToCommitments(w.commitments),
    party_id: w.party_id,
    oprf_pub_key_with_epoch: {
      key: wireToAffine(w.oprf_pub_key_with_epoch.key),
      epoch: w.oprf_pub_key_with_epoch.epoch,
    },
  };
}

export function wireToProofShare(w: DLogProofShareShamirWire): {
  value: bigint;
} {
  return { value: BigInt(w.value) };
}

export function proofShareToWire(p: {
  value: bigint;
}): DLogProofShareShamirWire {
  return { value: p.value.toString() };
}

/** Convert DLogCommitmentsShamir (data) to wire shape for server. */
export function challengeToWire(data: {
  c: AffinePoint<bigint>;
  d1: AffinePoint<bigint>;
  d2: AffinePoint<bigint>;
  e1: AffinePoint<bigint>;
  e2: AffinePoint<bigint>;
  contributingParties: number[];
}): DLogCommitmentsShamirWire {
  return {
    c: affineToWire(data.c),
    d1: affineToWire(data.d1),
    d2: affineToWire(data.d2),
    e1: affineToWire(data.e1),
    e2: affineToWire(data.e2),
    contributing_parties: data.contributingParties,
  };
}
