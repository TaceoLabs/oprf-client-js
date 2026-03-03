import { describe, it, expect } from 'vitest';
import {
  generateChallengeRequest,
  OprfClientError,
  isOprfClientError,
  initSessions,
} from '../src/index.js';
import {
  DLogCommitmentsShamir,
  partialCommitments,
  type PartialDLogCommitmentsShamir,
} from '@taceolabs/oprf-client-core';
import { encodeToCurve } from '@taceolabs/oprf-client-core';

describe('oprf-client', () => {
  it('isOprfClientError identifies OprfClientError', () => {
    const err = new OprfClientError('NonUniqueServices', 'test');
    expect(isOprfClientError(err)).toBe(true);
    expect(isOprfClientError(new Error('other'))).toBe(false);
  });

  it('initSessions rejects duplicate services', async () => {
    const services = ['http://a', 'http://a'];
    await expect(
      initSessions(services, 'test', 1, {
        request_id: crypto.randomUUID(),
        blinded_query: encodeToCurve(1n).toAffine(),
        auth: {},
      })
    ).rejects.toThrow(OprfClientError);
    await expect(
      initSessions(services, 'test', 1, {
        request_id: crypto.randomUUID(),
        blinded_query: encodeToCurve(1n).toAffine(),
        auth: {},
      })
    ).rejects.toMatchObject({ code: 'NonUniqueServices' });
  });

  it('generateChallengeRequest combines commitments and orders by party', () => {
    const b = encodeToCurve(42n).toAffine();
    const commitments: PartialDLogCommitmentsShamir[] = [];
    const partyIds = [2, 0, 1];
    for (let i = 0; i < 3; i++) {
      const xShare =
        BigInt(100 + i) %
        2736030358979909402780800718157159386076813972158567259209894962496324057351n;
      const { commitments: c } = partialCommitments(b, xShare);
      commitments.push(c);
    }
    const sessions = {
      ws: [],
      partyIds,
      commitments,
      oprfPublicKeys: [b, b, b],
      epoch: 0,
    } as unknown as import('../src/sessions.js').OprfSessions;
    const challenge = generateChallengeRequest(sessions);
    expect(challenge).toBeInstanceOf(DLogCommitmentsShamir);
    expect(challenge.getContributingParties()).toEqual(
      partyIds.map((id) => id + 1)
    );
    expect(challenge.blindedResponse()).toBeDefined();
  });
});
