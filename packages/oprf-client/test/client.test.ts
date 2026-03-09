import { describe, it, expect } from 'vitest';
import {
  generateChallengeRequest,
  OprfClientError,
  isOprfClientError,
  NodeError,
  isNodeError,
  ServiceError,
  aggregateError,
  distributedOprf,
  toOprfUri,
} from '../src/index.js';
import {
  DLogCommitmentsShamir,
  partialCommitments,
  type PartialDLogCommitmentsShamir,
} from '@taceo/oprf-core';
import { encodeToCurve } from '@taceo/oprf-core';

describe('oprf-client', () => {
  it('isOprfClientError identifies OprfClientError', () => {
    const err = new OprfClientError('NonUniqueServices', 'test');
    expect(isOprfClientError(err)).toBe(true);
    expect(isOprfClientError(new Error('other'))).toBe(false);
  });

  it('isNodeError identifies NodeError', () => {
    const err = new NodeError('WsError', { reason: 'test' });
    expect(isNodeError(err)).toBe(true);
    expect(isNodeError(new Error('other'))).toBe(false);
  });

  it('distributedOprf rejects duplicate services', async () => {
    const services = ['ws://a', 'ws://a'];
    await expect(distributedOprf(services, 1, 1n, 0n)).rejects.toMatchObject({
      code: 'NonUniqueServices',
    });
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

describe('aggregateError', () => {
  it('returns ThresholdServiceError when threshold ServiceErrors agree on code', () => {
    const svc = new ServiceError(4002, 'bad request');
    const errors = [
      new NodeError('ServiceError', { serviceError: svc }),
      new NodeError('ServiceError', { serviceError: svc }),
    ];
    const result = aggregateError(2, errors);
    expect(result.code).toBe('ThresholdServiceError');
    expect(result.details?.serviceError?.errorCode).toBe(4002);
  });

  it('returns UnexpectedMessage when threshold nodes agree on reason', () => {
    const errors = [
      new NodeError('UnexpectedMessage', { reason: 'binary frame received' }),
      new NodeError('UnexpectedMessage', { reason: 'binary frame received' }),
    ];
    const result = aggregateError(2, errors);
    expect(result.code).toBe('UnexpectedMessage');
  });

  it('returns Networking when threshold WsErrors', () => {
    const cause = new Error('connect refused');
    const errors = [
      new NodeError('WsError', { cause }),
      new NodeError('WsError', { cause }),
    ];
    const result = aggregateError(2, errors);
    expect(result.code).toBe('Networking');
    expect(result.details?.networkingErrors?.length).toBe(2);
  });

  it('returns NodeErrorDisagreement when no consensus', () => {
    const errors = [
      new NodeError('WsError', { reason: 'conn refused' }),
      new NodeError('UnexpectedMessage', { reason: 'binary frame received' }),
    ];
    const result = aggregateError(2, errors);
    expect(result.code).toBe('NodeErrorDisagreement');
    expect(result.details?.nodeErrors).toHaveLength(2);
  });

  it('ignores Unknown errors for aggregation consensus', () => {
    const errors = [
      new NodeError('Unknown', { reason: 'some unknown' }),
      new NodeError('Unknown', { reason: 'other unknown' }),
    ];
    const result = aggregateError(2, errors);
    // Unknown errors don't match any consensus category
    expect(result.code).toBe('NodeErrorDisagreement');
  });
});

describe('toOprfUri', () => {
  it('converts http to ws', () => {
    expect(toOprfUri('http://localhost:8080', 'mymod')).toBe(
      'ws://localhost:8080/api/mymod/oprf?version=0.8.0'
    );
  });

  it('converts https to wss', () => {
    expect(toOprfUri('https://service.example.com', 'auth')).toBe(
      'wss://service.example.com/api/auth/oprf?version=0.8.0'
    );
  });

  it('trims trailing slash', () => {
    expect(toOprfUri('http://localhost:8080/', 'mod')).toBe(
      'ws://localhost:8080/api/mod/oprf?version=0.8.0'
    );
  });

  it('uses custom client version', () => {
    expect(toOprfUri('http://localhost', 'mod', '2.0.0')).toBe(
      'ws://localhost/api/mod/oprf?version=2.0.0'
    );
  });
});

describe('toOprfUri', () => {
  it('maps multiple services', () => {
    const bases = ['http://a.com', 'https://b.com'];
    const result = bases.map((s) => toOprfUri(s, 'mymod', '1.0.0'));
    expect(result).toEqual([
      'ws://a.com/api/mymod/oprf?version=1.0.0',
      'wss://b.com/api/mymod/oprf?version=1.0.0',
    ]);
  });
});
