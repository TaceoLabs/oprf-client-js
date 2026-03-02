import { describe, it, expect } from 'vitest';
import { VERSION, encodeToCurve } from '../src/index.js';

describe('core', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.0.0');
  });
});

describe('encodeToCurve', () => {
  const expectedX =
    1368536874988764403285491466492470225763829673979223271328990939656695174872n;
  const expectedY =
    5918944744409897789209151589310931911112404737084812644826989226820698253694n;

  it('encodes input 42 to expected point (KAT from Rust test_encode_to_curve)', () => {
    const point = encodeToCurve(42n);
    expect(point.x).toBe(expectedX);
    expect(point.y).toBe(expectedY);
  });

  it('returns a point on the curve', () => {
    const point = encodeToCurve(42n);
    point.assertValidity();
  });

  it('succeeds for a few random-looking inputs', () => {
    for (const input of [0n, 1n, 12345n, 2n ** 200n]) {
      const point = encodeToCurve(input);
      point.assertValidity();
    }
  });
});
