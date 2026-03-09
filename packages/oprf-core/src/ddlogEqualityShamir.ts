/**
 * Shamir secret sharing variant of distributed DLog equality.
 * Matches nullifier-oracle-service oprf-core/src/ddlog_equality/shamir.rs.
 */

import { AffinePoint } from '@noble/curves/abstract/curve';
import {
  combineProofs as combineProofsCore,
  combineTwoNonceRandomness,
  partialCommitments as partialCommitmentsCore,
  type DLogEqualityCommitmentsData,
  type DLogEqualitySession,
  type PartialDLogEqualityCommitments,
} from './ddlogEquality.js';
import { challengeHash, convertBaseToScalar } from './dlogEquality.js';
import type { DLogEqualityProof } from './dlogEquality.js';
import { lagrangeFromCoeff } from './shamir.js';
import {
  babyjubjub,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
  Fr,
} from './babyjubjub.js';

/** Shamir share of the OPRF secret (scalar wrapper). */
export interface DLogShareShamir {
  value: bigint;
}

/** Per-party commitment share (wrapper). */
export type PartialDLogCommitmentsShamir = PartialDLogEqualityCommitments;

/** Proof share (scalar wrapper). */
export interface DLogProofShareShamir {
  value: bigint;
}

/** Aggregated commitments for Shamir DLog equality. */
export class DLogCommitmentsShamir {
  readonly data: DLogEqualityCommitmentsData;

  constructor(data: DLogEqualityCommitmentsData) {
    this.data = data;
  }

  static new(
    c: AffinePoint<bigint>,
    d1: AffinePoint<bigint>,
    d2: AffinePoint<bigint>,
    e1: AffinePoint<bigint>,
    e2: AffinePoint<bigint>,
    parties: number[]
  ): DLogCommitmentsShamir {
    return new DLogCommitmentsShamir({
      c,
      d1,
      d2,
      e1,
      e2,
      contributingParties: parties,
    });
  }

  getContributingParties(): number[] {
    return this.data.contributingParties;
  }

  blindedResponse(): AffinePoint<bigint> {
    return this.data.c;
  }

  /**
   * Combine partial commitments using Lagrange for c and plain sum for d1,d2,e1,e2.
   */
  static combineCommitments(
    commitments: PartialDLogCommitmentsShamir[],
    contributingParties: number[]
  ): DLogCommitmentsShamir {
    const dedup = [...new Set(contributingParties)].sort((a, b) => a - b);
    if (dedup.length !== contributingParties.length) {
      throw new Error('Party IDs must be unique');
    }
    if (commitments.length !== contributingParties.length) {
      throw new Error(
        'Number of commitments must match number of contributing parties'
      );
    }
    const lagrange = lagrangeFromCoeff(contributingParties);
    let c = babyjubjub.Point.ZERO;
    for (let i = 0; i < commitments.length; i++) {
      const P = babyjubjub.Point.fromAffine(commitments[i]!.c);
      c = c.add(P.multiplyUnsafe(Fr.create(lagrange[i]!)));
    }
    let d1 = babyjubjub.Point.ZERO;
    let d2 = babyjubjub.Point.ZERO;
    let e1 = babyjubjub.Point.ZERO;
    let e2 = babyjubjub.Point.ZERO;
    for (const comm of commitments) {
      d1 = d1.add(babyjubjub.Point.fromAffine(comm.d1));
      d2 = d2.add(babyjubjub.Point.fromAffine(comm.d2));
      e1 = e1.add(babyjubjub.Point.fromAffine(comm.e1));
      e2 = e2.add(babyjubjub.Point.fromAffine(comm.e2));
    }
    const data: DLogEqualityCommitmentsData = {
      c: c.toAffine(),
      d1: d1.toAffine(),
      d2: d2.toAffine(),
      e1: e1.toAffine(),
      e2: e2.toAffine(),
      contributingParties,
    };
    return new DLogCommitmentsShamir(data);
  }

  combineProofs(
    sessionId: string,
    proofs: DLogProofShareShamir[],
    a: AffinePoint<bigint>,
    b: AffinePoint<bigint>
  ): DLogEqualityProof {
    return combineProofsCore(
      this.data,
      sessionId,
      proofs.map((p) => p.value),
      a,
      b
    );
  }
}

/** Session wrapper for Shamir (consumed by challenge). */
export class DLogSessionShamir {
  constructor(readonly session: DLogEqualitySession) {}

  static partialCommitments(
    b: AffinePoint<bigint>,
    xShare: DLogShareShamir
  ): { session: DLogSessionShamir; commitments: PartialDLogCommitmentsShamir } {
    const { session, commitments } = partialCommitmentsCore(b, xShare.value);
    return {
      session: new DLogSessionShamir(session),
      commitments,
    };
  }

  challenge(
    sessionId: string,
    xShare: DLogShareShamir,
    a: AffinePoint<bigint>,
    aggregatedCommitments: DLogCommitmentsShamir,
    lagrangeCoefficient: bigint
  ): DLogProofShareShamir {
    const { r1, r2, b } = combineTwoNonceRandomness(
      sessionId,
      a,
      aggregatedCommitments.data.c,
      aggregatedCommitments.data.d1,
      aggregatedCommitments.data.d2,
      aggregatedCommitments.data.e1,
      aggregatedCommitments.data.e2,
      aggregatedCommitments.data.contributingParties
    );
    const d = BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE;
    const e = challengeHash(
      a,
      this.session.blindedQuery,
      aggregatedCommitments.data.c,
      d,
      r1,
      r2
    );
    const eScalar = convertBaseToScalar(e);
    const xNorm = Fr.create(xShare.value);
    const lNorm = Fr.create(lagrangeCoefficient);
    const share = Fr.add(
      Fr.create(this.session.d),
      Fr.add(Fr.mul(b, this.session.e), Fr.mul(lNorm, Fr.mul(eScalar, xNorm)))
    );
    return { value: share };
  }
}
