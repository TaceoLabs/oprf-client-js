/**
 * Generic Poseidon2 permutation.
 * Based on https://eprint.iacr.org/2023/323 and the Rust crate poseidon2.
 */

import type { IField } from '@noble/curves/abstract/modular';

export type Fr = bigint;

/** Poseidon2 parameters for a fixed state size T. */
export interface Poseidon2Params {
  readonly T: number;
  readonly D: number;
  readonly ROUNDS_F: number;
  readonly ROUNDS_P: number;
  readonly matInternalDiagM1: readonly Fr[];
  readonly roundConstantsExternal: readonly (readonly Fr[])[];
  readonly roundConstantsInternal: readonly Fr[];
}

function sboxSingle(F: IField<Fr>, input: Fr, D: number): Fr {
  switch (D) {
    case 3: {
      const input2 = F.sqr(input);
      return F.mul(input, input2);
    }
    case 5: {
      const input2 = F.sqr(input);
      const input4 = F.sqr(input2);
      return F.mul(input, input4);
    }
    case 7: {
      const input2 = F.sqr(input);
      const input4 = F.sqr(input2);
      return F.mul(F.mul(input, input4), input2);
    }
    default:
      return F.pow(input, BigInt(D));
  }
}

function sbox(F: IField<Fr>, state: Fr[], D: number): void {
  for (let i = 0; i < state.length; i++) {
    state[i] = sboxSingle(F, state[i], D);
  }
}

/**
 * Hardcoded 4x4 MDS matmul (paper formula) - exact port from Rust matmul_m4:
 * | 5 7 1 3 |
 * | 4 6 1 1 |
 * | 1 3 5 7 |
 * | 1 1 4 6 |
 * Rust: t_0 = A+B, t_1 = C+D, t_2 = 2B+C+D, t_3 = A+B+2D, t_4 = 4*t_1+t_3, t_5 = 4*t_0+t_2, t_6 = t_3+t_5, t_7 = t_2+t_4
 *       input[0]=t_6, input[1]=t_5, input[2]=t_7, input[3]=t_4
 */
function matmulM4(F: IField<Fr>, input: Fr[]): void {
  const t_0 = F.add(input[0], input[1]);
  const t_1 = F.add(input[2], input[3]);
  const t_2 = F.add(F.add(input[1], input[1]), t_1);
  const t_3 = F.add(F.add(input[3], input[3]), t_0);
  const t_4 = F.add(F.add(F.add(t_1, t_1), F.add(t_1, t_1)), t_3);
  const t_5 = F.add(F.add(F.add(t_0, t_0), F.add(t_0, t_0)), t_2);
  const t_6 = F.add(t_3, t_5);
  const t_7 = F.add(t_2, t_4);
  input[0] = t_6;
  input[1] = t_5;
  input[2] = t_7;
  input[3] = t_4;
}

function matmulExternal(F: IField<Fr>, state: Fr[], T: number): void {
  switch (T) {
    case 2: {
      const sum = F.add(state[0], state[1]);
      state[0] = F.add(state[0], sum);
      state[1] = F.add(state[1], sum);
      return;
    }
    case 3: {
      const sum = F.add(F.add(state[0], state[1]), state[2]);
      state[0] = F.add(state[0], sum);
      state[1] = F.add(state[1], sum);
      state[2] = F.add(state[2], sum);
      return;
    }
    case 4:
      matmulM4(F, state);
      return;
    case 8:
    case 12:
    case 16:
    case 20:
    case 24: {
      const chunks = T / 4;
      for (let c = 0; c < chunks; c++) {
        const base = c * 4;
        const block = [
          state[base],
          state[base + 1],
          state[base + 2],
          state[base + 3],
        ];
        matmulM4(F, block);
        state[base] = block[0];
        state[base + 1] = block[1];
        state[base + 2] = block[2];
        state[base + 3] = block[3];
      }
      const stored: Fr[] = [F.ZERO, F.ZERO, F.ZERO, F.ZERO];
      for (let l = 0; l < 4; l++) {
        let s = state[l];
        for (let j = 1; j < chunks; j++) {
          s = F.add(s, state[4 * j + l]);
        }
        stored[l] = s;
      }
      for (let i = 0; i < T; i++) {
        state[i] = F.add(state[i], stored[i % 4]);
      }
      return;
    }
    default:
      throw new Error(`Invalid state size T=${T}`);
  }
}

function matmulInternal(
  F: IField<Fr>,
  state: Fr[],
  T: number,
  matInternalDiagM1: readonly Fr[]
): void {
  switch (T) {
    case 2: {
      const sum = F.add(state[0], state[1]);
      state[0] = F.add(state[0], sum);
      state[1] = F.add(F.add(state[1], state[1]), sum);
      return;
    }
    case 3: {
      const sum = F.add(F.add(state[0], state[1]), state[2]);
      state[0] = F.add(state[0], sum);
      state[1] = F.add(state[1], sum);
      state[2] = F.add(F.add(state[2], state[2]), sum);
      return;
    }
    default: {
      // Rust: let sum = input.iter().sum(); for (s, m): *s *= m; *s += sum.
      // Use copy of state for sum so we use pre-update values exactly as Rust.
      const stateCopy = state.slice();
      const sum = stateCopy.reduce((acc, s) => F.add(acc, s), F.ZERO);
      for (let i = 0; i < T; i++) {
        state[i] = F.add(F.mul(stateCopy[i], matInternalDiagM1[i]), sum);
      }
    }
  }
}

/**
 * Poseidon2 permutation in place.
 * Structure: matmul_external → ROUNDS_F/2 external rounds → ROUNDS_P internal rounds → ROUNDS_F/2 external rounds.
 */
export function permutationInPlace(
  F: IField<Fr>,
  state: Fr[],
  params: Poseidon2Params
): void {
  const {
    T,
    D,
    ROUNDS_F,
    ROUNDS_P,
    matInternalDiagM1,
    roundConstantsExternal,
    roundConstantsInternal,
  } = params;

  if (state.length !== T) {
    throw new Error(`State length ${state.length} does not match T=${T}`);
  }

  matmulExternal(F, state, T);

  const halfF = ROUNDS_F / 2;
  // Match Rust: round_constants_external.iter().take(ROUNDS_F/2) then .by_ref() remainder
  for (let r = 0; r < halfF; r++) {
    const rc = roundConstantsExternal[r];
    for (let i = 0; i < T; i++) {
      state[i] = F.add(state[i], rc[i]);
    }
    sbox(F, state, D);
    matmulExternal(F, state, T);
  }

  for (let r = 0; r < ROUNDS_P; r++) {
    const rc = roundConstantsInternal[r];
    state[0] = F.add(state[0], rc);
    state[0] = sboxSingle(F, state[0], D);
    matmulInternal(F, state, T, matInternalDiagM1);
  }

  for (let r = halfF; r < ROUNDS_F; r++) {
    const rc = roundConstantsExternal[r];
    for (let i = 0; i < T; i++) {
      state[i] = F.add(state[i], rc[i]);
    }
    sbox(F, state, D);
    matmulExternal(F, state, T);
  }
}

/**
 * Poseidon2 permutation; returns a new state array.
 */
export function permutation(
  F: IField<Fr>,
  state: readonly Fr[],
  params: Poseidon2Params
): Fr[] {
  const out = state.slice();
  permutationInPlace(F, out, params);
  return out;
}
