import { describe, it, expect } from 'vitest';
import {
  lagrangeFromCoeff,
  singleLagrangeFromCoeff,
  evaluatePoly,
  reconstruct,
  Fr,
} from '../src/index.js';
import { babyjubjub } from '@noble/curves/misc.js';

const CURVE_N = babyjubjub.Point.CURVE().n;

describe('shamir', () => {
  it('lagrangeFromCoeff returns coefficients in same order as party IDs', () => {
    const parties = [1, 2, 3];
    const lagrange = lagrangeFromCoeff(parties);
    expect(lagrange).toHaveLength(3);
    for (let i = 0; i < parties.length; i++) {
      expect(singleLagrangeFromCoeff(parties[i]!, parties)).toBe(lagrange[i]);
    }
  });

  it('reconstruct recovers secret from shares with Lagrange', () => {
    const secret = 12345n % CURVE_N;
    const parties = [1, 2, 3];
    const coeffs = [secret, 999n, 888n];
    const shares = parties.map((i) => evaluatePoly(coeffs, BigInt(i)));
    const lagrange = lagrangeFromCoeff(parties);
    const recovered = reconstruct(shares, lagrange);
    expect(recovered).toBe(secret);
  });

  it('evaluatePoly evaluates constant polynomial', () => {
    const c = 7n;
    expect(evaluatePoly([c], 0n)).toBe(c);
    expect(evaluatePoly([c], 100n)).toBe(c);
  });

  it('evaluatePoly evaluates linear polynomial', () => {
    const poly = [3n, 5n];
    expect(evaluatePoly(poly, 0n)).toBe(3n);
    expect(evaluatePoly(poly, 1n)).toBe(3n + 5n);
  });

  it('singleLagrangeFromCoeff for two parties', () => {
    const l1 = singleLagrangeFromCoeff(1, [1, 2]);
    const l2 = singleLagrangeFromCoeff(2, [1, 2]);
    expect(Fr.create(l1 + l2)).toBe(1n);
  });
});
