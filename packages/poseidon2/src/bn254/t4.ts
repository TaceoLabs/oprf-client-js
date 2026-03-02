import { bn254_Fr } from '@noble/curves/bn254';
import {
  permutation as perm,
  permutationInPlace as permInPlace,
} from '../perm.js';
import { getParamsT4 } from './params.js';

const params = getParamsT4(bn254_Fr);

/** Poseidon2 permutation for state size t=4 over BN254. Returns new state. */
export function permutation(state: readonly bigint[]): bigint[] {
  if (state.length !== 4) throw new Error('State must have length 4');
  return perm(bn254_Fr, state, params);
}

/** Poseidon2 permutation for state size t=4 over BN254. Mutates state in place. */
export function permutationInPlace(state: bigint[]): void {
  if (state.length !== 4) throw new Error('State must have length 4');
  permInPlace(bn254_Fr, state, params);
}
