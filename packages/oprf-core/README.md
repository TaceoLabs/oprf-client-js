# @taceo/oprf-core

Threshold OPRF client core: BabyJubJub curve, hash-to-curve, Chaum-Pedersen ZKP, and FROST-style distributed proofs.

This package provides the cryptographic primitives for building oblivious pseudo-random function (OPRF) clients in the TACEO threshold OPRF protocol.

## Installation

```bash
pnpm add @taceo/oprf-core
```

## Usage

### Basic OPRF Operations

```ts
import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
} from '@taceo/oprf-core';

// 1. Generate a random blinding factor
const beta = randomBlindingFactor();

// 2. Blind the query before sending to server
const query = 12345n;
const blindedQuery = blindQuery(query, beta);

// 3. [Server evaluates OPRF and returns blindedResponse]

// 4. Unblind the server response
const prepared = prepareBlindingFactor(beta);
const unblinded = unblindResponse(blindedResponse, prepared);

// 5. Finalize the OPRF output
const domainSeparator = 0n;
const output = finalizeOutput(domainSeparator, query, unblinded);
```

### Hash-to-Curve

```ts
import { encodeToCurve } from '@taceo/oprf-core';

// Maps a field element to a BabyJubJub curve point
const point = encodeToCurve(12345n);
```

### DLog Equality Proofs (Chaum-Pedersen)

```ts
import {
  dlogEqualityProof,
  dlogEqualityVerify,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
} from '@taceo/oprf-core';

// Prove that log_G(pk) = log_B(R) without revealing the secret
const proof = dlogEqualityProof(secretKey, baseG, publicKey, baseB, responseR);
dlogEqualityVerify(proof, publicKey, baseB, responseR, baseG);
```

### Distributed DLog (FROST-style)

```ts
import {
  DLogCommitmentsShamir,
  DLogSessionShamir,
} from '@taceo/oprf-core';

// Combine commitments from multiple parties
const combined = DLogCommitmentsShamir.combineCommitments(
  commitments,
  contributingParties
);

// Combine proof shares into a single verifiable proof
const proof = combined.combineProofs(requestId, proofShares, publicKey, base);
```

### Shamir Secret Sharing

```ts
import { lagrangeFromCoeff, reconstruct } from '@taceo/oprf-core';

// Compute Lagrange coefficients for interpolation
const coeffs = lagrangeFromCoeff(contributingParties);

// Reconstruct a secret from shares
const secret = reconstruct(shares, contributingParties);
```

## API

### OPRF Operations (`oprfClient`)

- **`randomBlindingFactor(): BlindingFactor`** — sample random non-zero scalar
- **`prepareBlindingFactor(beta): PreparedBlindingFactor`** — compute inverse for unblinding
- **`blindQuery(query, beta): AffinePoint`** — blind query as `encode_to_curve(query) × β`
- **`unblindResponse(response, prepared): AffinePoint`** — unblind as `response × β⁻¹`
- **`finalizeOutput(domainSeparator, query, unblinded): bigint`** — hash via Poseidon2 (2Hash-DH)
- **`finalizeQuery(query, response, beta, domainSeparator): bigint`** — convenience: unblind + finalize

### Curve & Field

- **`babyjubjub`** — BabyJubJub twisted Edwards curve from `@noble/curves`
- **`G`** — prime-order subgroup generator
- **`Fr`** — scalar field (subgroup order)
- **`Fq`** — base field
- **`BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE`** — generator as affine point
- **`encodeToCurve(input): Point`** — hash-to-curve via Elligator2 + rational map
- **`babyJubJubAffineToCompressedBytes(point): Uint8Array`** — compressed serialization

### DLog Equality

- **`dlogEqualityProof(...): DLogEqualityProof`** — create Chaum-Pedersen proof
- **`dlogEqualityVerify(...): void`** — verify proof (throws `InvalidProofError`)
- **`challengeHash(...): bigint`** — Fiat-Shamir challenge via Blake3

### Distributed DLog (Shamir)

- **`DLogCommitmentsShamir`** — combines partial commitments from threshold parties
- **`DLogSessionShamir`** — manages a distributed proof session
- **`lagrangeFromCoeff(parties): bigint[]`** — Lagrange interpolation coefficients
- **`reconstruct(shares, parties): bigint`** — reconstruct secret from shares

## License

MIT
