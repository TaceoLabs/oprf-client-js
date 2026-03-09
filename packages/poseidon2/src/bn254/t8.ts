import { bn254_Fr } from '@noble/curves/bn254.js';
import {
  permutation as perm,
  permutationInPlace as permInPlace,
} from '../perm.js';
import { getParamsT8 } from './params.js';

const params = getParamsT8(bn254_Fr);

/** Poseidon2 permutation for state size t=8 over BN254. Returns new state. */
export function permutation(state: readonly bigint[]): bigint[] {
  if (state.length !== 8) throw new Error('State must have length 8');
  return perm(bn254_Fr, state, params);
}

/** Poseidon2 permutation for state size t=8 over BN254. Mutates state in place. */
export function permutationInPlace(state: bigint[]): void {
  if (state.length !== 8) throw new Error('State must have length 8');
  permInPlace(bn254_Fr, state, params);
}
