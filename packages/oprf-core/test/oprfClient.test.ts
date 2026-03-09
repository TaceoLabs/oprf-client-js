import { describe, it, expect } from 'vitest';
import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
  encodeToCurve,
  Fr,
} from '../src/index.js';

describe('oprfClient', () => {
  it('blindQuery returns affine point', () => {
    const query = 12345n;
    const beta = randomBlindingFactor();
    const blinded = blindQuery(query, beta);
    expect(blinded).toHaveProperty('x');
    expect(blinded).toHaveProperty('y');
    expect(typeof blinded.x).toBe('bigint');
    expect(typeof blinded.y).toBe('bigint');
  });

  it('unblindResponse inverts blind', () => {
    const query = 12345n;
    const beta = randomBlindingFactor();
    const blinded = blindQuery(query, beta);
    const encoded = encodeToCurve(query);
    const scaled = encoded.multiply(beta);
    expect(scaled.toAffine().x).toBe(blinded.x);
    expect(scaled.toAffine().y).toBe(blinded.y);

    const prepared = prepareBlindingFactor(beta);
    const unblinded = unblindResponse(blinded, prepared);
    expect(unblinded.x).toBe(encoded.toAffine().x);
    expect(unblinded.y).toBe(encoded.toAffine().y);
  });

  it('finalizeOutput is deterministic', () => {
    const domainSeparator = 1n;
    const query = 42n;
    const point = encodeToCurve(query).toAffine();
    const out1 = finalizeOutput(domainSeparator, query, point);
    const out2 = finalizeOutput(domainSeparator, query, point);
    expect(out1).toBe(out2);
  });

  it('prepareBlindingFactor returns inverse in Fr', () => {
    const beta = Fr.create(7n);
    const inv = prepareBlindingFactor(beta);
    expect(Fr.mul(beta, inv)).toBe(1n);
  });
});
