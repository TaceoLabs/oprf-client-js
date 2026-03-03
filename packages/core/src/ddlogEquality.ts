/**
 * Distributed DLog equality: partial commitments, aggregated commitments,
 * proof-share combination, and two-nonce randomness combiner (FROST-style).
 * Matches nullifier-oracle-service oprf-core/src/ddlog_equality.rs.
 */

import { AffinePoint } from '@noble/curves/abstract/curve';
import { blake3 } from '@noble/hashes/blake3';
import { challengeHash } from './dlogEquality.js';
import type { DLogEqualityProof } from './dlogEquality.js';
import {
  babyjubjub,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
  babyJubJubAffineToCompressedBytes,
  Fr,
  G,
} from './babyjubjub.js';

const FROST_2_NONCE_COMBINER_LABEL = new TextEncoder().encode(
  'FROST_2_NONCE_COMBINER'
);

/** Per-party commitments (c, d1, d2, e1, e2). */
export interface PartialDLogEqualityCommitments {
  c: AffinePoint<bigint>;
  d1: AffinePoint<bigint>;
  d2: AffinePoint<bigint>;
  e1: AffinePoint<bigint>;
  e2: AffinePoint<bigint>;
}

/** Aggregated commitments + contributing party IDs. */
export interface DLogEqualityCommitmentsData {
  c: AffinePoint<bigint>;
  d1: AffinePoint<bigint>;
  d2: AffinePoint<bigint>;
  e1: AffinePoint<bigint>;
  e2: AffinePoint<bigint>;
  contributingParties: number[];
}

/** Proof share (scalar). */
export type DLogEqualityProofShare = bigint;

/** Session state (opaque); consumed by challenge step. */
export interface DLogEqualitySession {
  readonly d: bigint;
  readonly e: bigint;
  readonly blindedQuery: AffinePoint<bigint>;
}

/** Sample scalar in [0, order) for session randomness (prime field). */
function randomScalarInOrder(order: bigint): bigint {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let n = 0n;
  for (let i = 0; i < 48; i++) {
    n = n * 256n + BigInt(bytes[i]!);
  }
  return n % order;
}

/** Parse UUID string to 16 raw bytes (same order as Rust Uuid::as_bytes()). */
function uuidToBytes(sessionId: string): Uint8Array {
  const hex = sessionId.replace(/-/g, '');
  if (hex.length !== 32) throw new Error('uuid: expected 32 hex chars');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Reduce 64 bytes to scalar mod r (from_le_bytes_mod_order). */
function fromLeBytesModOrder(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) {
    n = n + BigInt(bytes[i]!) * 256n ** BigInt(i);
  }
  return Fr.create(n);
}

/**
 * Partial commitments for one party: C = B*x_share, d1=G*d, e1=G*e, d2=B*d, e2=B*e.
 */
export function partialCommitments(
  b: AffinePoint<bigint>,
  xShare: bigint
): {
  session: DLogEqualitySession;
  commitments: PartialDLogEqualityCommitments;
} {
  const B = babyjubjub.Point.fromAffine(b);
  const xNorm = Fr.create(xShare);
  const dShare = randomScalarInOrder(Fr.ORDER);
  const eShare = randomScalarInOrder(Fr.ORDER);
  const d1 = G.multiplyUnsafe(dShare).toAffine();
  const e1 = G.multiplyUnsafe(eShare).toAffine();
  const d2 = B.multiplyUnsafe(dShare).toAffine();
  const e2 = B.multiplyUnsafe(eShare).toAffine();
  const cShare = B.multiplyUnsafe(xNorm).toAffine();
  const session: DLogEqualitySession = {
    d: dShare,
    e: eShare,
    blindedQuery: b,
  };
  const commitments: PartialDLogEqualityCommitments = {
    c: cShare,
    d1,
    d2,
    e1,
    e2,
  };
  return { session, commitments };
}

/**
 * Combine two-nonce randomness: hash label, session_id, parties, points → 64 bytes → b;
 * r1 = d1 + e1*b, r2 = d2 + e2*b.
 */
export function combineTwoNonceRandomness(
  sessionId: string,
  publicKey: AffinePoint<bigint>,
  oprfOutput: AffinePoint<bigint>,
  d1: AffinePoint<bigint>,
  d2: AffinePoint<bigint>,
  e1: AffinePoint<bigint>,
  e2: AffinePoint<bigint>,
  parties: number[]
): { r1: AffinePoint<bigint>; r2: AffinePoint<bigint>; b: bigint } {
  const hasher = blake3.create();
  hasher.update(FROST_2_NONCE_COMBINER_LABEL);
  hasher.update(uuidToBytes(sessionId));
  const partyBuf = new Uint8Array(2);
  for (const party of parties) {
    partyBuf[0] = party & 0xff;
    partyBuf[1] = (party >> 8) & 0xff;
    hasher.update(partyBuf);
  }
  const serializePoint = (p: AffinePoint<bigint>) => {
    hasher.update(babyJubJubAffineToCompressedBytes(p));
  };
  serializePoint(publicKey);
  serializePoint(oprfOutput);
  serializePoint(d1);
  serializePoint(d2);
  serializePoint(e1);
  serializePoint(e2);
  const unreducedB = hasher.xof(64);
  const b = fromLeBytesModOrder(unreducedB);
  const D1 = babyjubjub.Point.fromAffine(d1);
  const E1 = babyjubjub.Point.fromAffine(e1);
  const D2 = babyjubjub.Point.fromAffine(d2);
  const E2 = babyjubjub.Point.fromAffine(e2);
  const r1 = D1.add(E1.multiplyUnsafe(b)).toAffine();
  const r2 = D2.add(E2.multiplyUnsafe(b)).toAffine();
  return { r1, r2, b };
}

/** Options for combineProofs. Use generator for Rust-compatible KAT; default uses RUST_GENERATOR_AFFINE. */
export type CombineProofsOptions =
  | { generator?: AffinePoint<bigint> }
  | undefined;

/**
 * Build aggregated commitments and combine proof shares into a single DLogEqualityProof.
 * Uses RUST_GENERATOR_AFFINE by default for Rust compatibility; pass generator: G.toAffine() for noble curve verify.
 */
export function combineProofs(
  commitments: DLogEqualityCommitmentsData,
  sessionId: string,
  proofShares: DLogEqualityProofShare[],
  a: AffinePoint<bigint>,
  b: AffinePoint<bigint>
): DLogEqualityProof {
  let s = 0n;
  for (const share of proofShares) {
    s = Fr.add(s, Fr.create(share));
  }
  const d = BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE;
  const { r1, r2 } = combineTwoNonceRandomness(
    sessionId,
    a,
    commitments.c,
    commitments.d1,
    commitments.d2,
    commitments.e1,
    commitments.e2,
    commitments.contributingParties
  );
  const e = challengeHash(a, b, commitments.c, d, r1, r2);
  return { e, s };
}
