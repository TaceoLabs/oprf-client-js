import { describe, it, expect } from 'vitest';
import {
  dlogEqualityProof,
  dlogEqualityVerify,
  InvalidProofError,
  encodeToCurve,
  G,
  Fr,
} from '../src/index.js';

describe('dlogEquality', () => {
  it('proves and verifies with B = G (generator)', () => {
    const x = 12345n;
    const B = G;
    const A = G.multiply(x);
    const C = B.multiply(x);
    const D = G;

    const proof = dlogEqualityProof(B.toAffine(), x);
    expect(() =>
      dlogEqualityVerify(
        proof,
        A.toAffine(),
        B.toAffine(),
        C.toAffine(),
        D.toAffine()
      )
    ).not.toThrow();
  });

  it('proves and verifies: valid proof passes', () => {
    const x = 12345n;
    const B = encodeToCurve(42n);
    const A = G.multiply(x);
    const C = B.multiply(x);
    const D = G;

    const proof = dlogEqualityProof(B.toAffine(), x);
    expect(proof.e).toBeDefined();
    expect(proof.s).toBeDefined();
    expect(Fr.isValid(proof.s)).toBe(true);

    expect(() =>
      dlogEqualityVerify(
        proof,
        A.toAffine(),
        B.toAffine(),
        C.toAffine(),
        D.toAffine()
      )
    ).not.toThrow();
  });

  it('verify fails when B is wrong (same proof, different B)', () => {
    const x = 12345n;
    const B = encodeToCurve(42n);
    const B2 = encodeToCurve(99n);
    const A = G.multiply(x);
    const C = B.multiply(x);
    const D = G;

    const proof = dlogEqualityProof(B.toAffine(), x);
    expect(() =>
      dlogEqualityVerify(
        proof,
        A.toAffine(),
        B2.toAffine(),
        C.toAffine(),
        D.toAffine()
      )
    ).toThrow(InvalidProofError);
  });

  it('verify fails when s is tampered (s >= r)', () => {
    const x = 12345n;
    const B = encodeToCurve(42n);
    const A = G.multiply(x);
    const C = B.multiply(x);
    const D = G;

    const proof = dlogEqualityProof(B.toAffine(), x);
    const badProof = {
      ...proof,
      s: proof.s + Fr.ORDER,
    };
    expect(() =>
      dlogEqualityVerify(
        badProof,
        A.toAffine(),
        B.toAffine(),
        C.toAffine(),
        D.toAffine()
      )
    ).toThrow(InvalidProofError);
  });

  it('verify fails when e is tampered', () => {
    const x = 12345n;
    const B = encodeToCurve(42n);
    const A = G.multiply(x);
    const C = B.multiply(x);
    const D = G;

    const proof = dlogEqualityProof(B.toAffine(), x);
    const badProof = { ...proof, e: proof.e + 1n };
    expect(() =>
      dlogEqualityVerify(
        badProof,
        A.toAffine(),
        B.toAffine(),
        C.toAffine(),
        D.toAffine()
      )
    ).toThrow(InvalidProofError);
  });

  it('accepts affine points for proof and verify', () => {
    const x = 7n;
    const B = encodeToCurve(1n);
    const aAffine = G.multiply(x).toAffine();
    const bAffine = B.toAffine();
    const cAffine = B.multiply(x).toAffine();
    const dAffine = G.toAffine();

    const proof = dlogEqualityProof({ x: bAffine.x, y: bAffine.y }, x);
    expect(() =>
      dlogEqualityVerify(
        proof,
        { x: aAffine.x, y: aAffine.y },
        { x: bAffine.x, y: bAffine.y },
        { x: cAffine.x, y: cAffine.y },
        { x: dAffine.x, y: dAffine.y }
      )
    ).not.toThrow();
  });
});
