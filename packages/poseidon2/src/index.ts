/**
 * Poseidon2 permutation for the BN254 scalar field.
 * Based on https://eprint.iacr.org/2023/323 and compatible with the Rust taceo-poseidon2 crate.
 *
 * This package provides the permutation only (not a hash API).
 */

export { bn254 } from './bn254.js';
export type { Poseidon2Params, Fr } from './perm.js';
export { permutation, permutationInPlace } from './perm.js';
