/**
 * Poseidon2 over BN254 scalar field.
 * Compatible with HorizenLabs parameter script and the Rust taceo-poseidon2 crate.
 *
 * Usage: import { bn254 } from '@taceolabs/poseidon2'
 *   bn254.t4.permutation(state)
 *   bn254.t4.permutationInPlace(state)
 */

import * as t2 from './bn254/t2.js';
import * as t3 from './bn254/t3.js';
import * as t4 from './bn254/t4.js';
import * as t8 from './bn254/t8.js';
import * as t12 from './bn254/t12.js';
import * as t16 from './bn254/t16.js';

export const bn254 = {
  t2,
  t3,
  t4,
  t8,
  t12,
  t16,
};
