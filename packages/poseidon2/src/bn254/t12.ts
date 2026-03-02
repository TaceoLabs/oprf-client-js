import { bn254_Fr } from '@noble/curves/bn254';
import {
  permutation as perm,
  permutationInPlace as permInPlace,
} from '../perm.js';
import { getParamsT12 } from './params.js';

const params = getParamsT12(bn254_Fr);

/** Poseidon2 permutation for state size t=12 over BN254. Returns new state. */
export function permutation(state: readonly bigint[]): bigint[] {
  if (state.length !== 12) throw new Error('State must have length 12');
  return perm(bn254_Fr, state, params);
}

/** Poseidon2 permutation in place for state size t=12 over BN254. */
export function permutationInPlace(state: bigint[]): void {
  if (state.length !== 12) throw new Error('State must have length 12');
  permInPlace(bn254_Fr, state, params);
}
