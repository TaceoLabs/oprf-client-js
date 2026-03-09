# @taceo/poseidon2

Poseidon2 permutation for the BN254 scalar field, with **parity** to the Rust [taceo-poseidon2](https://github.com/TaceoLabs/poseidon2) crate.

Based on [Poseidon2 (eprint.iacr.org/2023/323)](https://eprint.iacr.org/2023/323). Parameters are compatible with the [HorizenLabs parameter script](https://github.com/HorizenLabs/poseidon2/blob/main/poseidon2_rust_params.sage).

## Installation

```bash
pnpm add @taceo/poseidon2
```

## Usage

```ts
import { bn254 } from '@taceo/poseidon2';

// State sizes t=2, t=3, t=4, t=8, t=12, t=16
const state = [0n, 1n, 2n, 3n];
const out = bn254.t4.permutation(state); // returns new array
bn254.t4.permutationInPlace(state); // mutates in place
```

Field elements are BN254 scalar field elements (`bigint` in the range `[0, p)`), we use `@noble/curves`’s `bn254_Fr` internally.

## API

- **`bn254.t2` … `bn254.t16`** — permutation for state size 2, 3, 4, 8, 12, 16
  - **`permutation(state: readonly bigint[]): bigint[]`** — returns new state
  - **`permutationInPlace(state: bigint[]): void`** — mutates state

## License

MIT or Apache 2.0
