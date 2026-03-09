import { bn254_Fr } from '@noble/curves/bn254.js';
import {
  permutation as perm,
  permutationInPlace as permInPlace,
} from '../perm.js';
import { getParamsT2 } from './params.js';

const params = getParamsT2(bn254_Fr);

/** Poseidon2 permutation for state size t=2 over BN254. Returns new state. */
export function permutation(state: readonly bigint[]): bigint[] {
  if (state.length !== 2) throw new Error('State must have length 2');
  return perm(bn254_Fr, state, params);
}

/** Poseidon2 permutation for state size t=2 over BN254. Mutates state in place. */
export function permutationInPlace(state: bigint[]): void {
  if (state.length !== 2) throw new Error('State must have length 2');
  permInPlace(bn254_Fr, state, params);
}
