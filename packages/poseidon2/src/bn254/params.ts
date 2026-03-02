/**
 * BN254 Poseidon2 parameters (round constants and MDS diagonal).
 * Constants are extracted from the Rust taceo-poseidon2 crate via scripts/extract-params-from-rust.mjs.
 * Do not copy constants by hand; run the script after any Rust param changes.
 */

import type { IField } from '@noble/curves/abstract/modular';
import type { Poseidon2Params } from '../perm.js';
import {
  T2_MAT,
  T2_EXT_RC,
  T2_INT_RC,
  T3_MAT,
  T3_EXT_RC,
  T3_INT_RC,
  T4_MAT,
  T4_EXT_RC,
  T4_INT_RC,
  T8_MAT,
  T8_EXT_RC,
  T8_INT_RC,
  T12_MAT,
  T12_EXT_RC,
  T12_INT_RC,
  T16_MAT,
  T16_EXT_RC,
  T16_INT_RC,
} from './params-generated.js';

type Fr = bigint;

function parseConstants<F extends IField<Fr>>(
  F: F,
  strings: readonly string[]
): Fr[] {
  return strings.map((s) => F.create(BigInt(s)));
}

function buildParams(
  F: IField<Fr>,
  T: number,
  D: number,
  ROUNDS_F: number,
  ROUNDS_P: number,
  matDiagStr: readonly string[],
  externalRcStr: readonly (readonly string[])[],
  internalRcStr: readonly string[]
): Poseidon2Params {
  return {
    T,
    D,
    ROUNDS_F,
    ROUNDS_P,
    matInternalDiagM1: parseConstants(F, matDiagStr),
    roundConstantsExternal: externalRcStr.map((row) => parseConstants(F, row)),
    roundConstantsInternal: parseConstants(F, internalRcStr),
  };
}

const D = 5;
const ROUNDS_F = 8;

export function getParamsT2(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 2, D, ROUNDS_F, 56, T2_MAT, T2_EXT_RC, T2_INT_RC);
}

export function getParamsT3(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 3, D, ROUNDS_F, 56, T3_MAT, T3_EXT_RC, T3_INT_RC);
}

export function getParamsT4(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 4, D, ROUNDS_F, 56, T4_MAT, T4_EXT_RC, T4_INT_RC);
}

export function getParamsT8(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 8, D, ROUNDS_F, 57, T8_MAT, T8_EXT_RC, T8_INT_RC);
}

export function getParamsT12(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 12, D, ROUNDS_F, 57, T12_MAT, T12_EXT_RC, T12_INT_RC);
}

export function getParamsT16(F: IField<Fr>): Poseidon2Params {
  return buildParams(F, 16, D, ROUNDS_F, 57, T16_MAT, T16_EXT_RC, T16_INT_RC);
}
