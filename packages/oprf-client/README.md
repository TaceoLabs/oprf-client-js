# @taceo/oprf-client

WebSocket client for distributed threshold OPRF over a network of TACEO service nodes.

This package provides high-level APIs for interacting with threshold OPRF services, handling the full protocol flow including session management, challenge generation, proof verification, and output finalization.

## Installation

```bash
pnpm add @taceo/oprf-client
```

## Usage

### Full Distributed OPRF

Services must be pre-built WebSocket URLs. Use `toOprfUri` to construct them from base URLs.

```ts
import { distributedOprf, toOprfUri } from '@taceo/oprf-client';

const bases = [
  'http://node1.example.com',
  'http://node2.example.com',
  'http://node3.example.com',
];

const services = bases.map((s) => toOprfUri(s, 'my-module'));

const result = await distributedOprf(
  services,
  2, // threshold
  12345n, // query
  0n, // domain separator
  { auth: { api_key: 'secret' } }
);

console.log(result.output); // OPRF output (bigint)
console.log(result.dlogProof); // Chaum-Pedersen proof
console.log(result.epoch); // Key epoch from servers
```

### Building Service URLs

```ts
import { toOprfUri } from '@taceo/oprf-client';

// http → ws, https → wss; appends /api/{module}/oprf?version={protocolVersion}
const url = toOprfUri('https://node1.example.com', 'my-module');
// → 'wss://node1.example.com/api/my-module/oprf?version=1.0.0'

// Custom protocol version
const urlV2 = toOprfUri('https://node1.example.com', 'my-module', '2.0.0');
```

### Step-by-Step Protocol

```ts
import {
  initSessions,
  finishSessions,
  generateChallengeRequest,
  verifyDlogEquality,
  toOprfUri,
} from '@taceo/oprf-client';
import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
} from '@taceo/oprf-core';

const services = bases.map((s) => toOprfUri(s, module));

// 1. Blind the query
const beta = randomBlindingFactor();
const blindedRequest = blindQuery(query, beta);

// 2. Initialize sessions with service nodes
const sessions = await initSessions(services, threshold, {
  request_id: crypto.randomUUID(),
  blinded_query: blindedRequest,
  auth: {},
});

// 3. Generate challenge from commitments
const challenge = generateChallengeRequest(sessions);

// 4. Finish sessions to get proof shares
const proofShares = await finishSessions(sessions, challenge);

// 5. Verify the combined DLog proof
const proof = verifyDlogEquality(
  requestId,
  sessions.oprfPublicKeys[0],
  blindedRequest,
  proofShares,
  challenge
);

// 6. Unblind and finalize
const blindedResponse = challenge.blindedResponse();
const unblinded = unblindResponse(blindedResponse, prepareBlindingFactor(beta));
const output = finalizeOutput(domainSeparator, query, unblinded);
```

## API

### Main Functions

- **`distributedOprf(services, threshold, query, domainSeparator, options?): Promise<VerifiableOprfOutput>`**

  End-to-end distributed OPRF: blind → init sessions → challenge → finish → verify → unblind → finalize. Services must be pre-built WS URLs (use `toOprfUri`).

- **`toOprfUri(service, auth, protocolVersion?): string`**

  Build a WebSocket URL for a single OPRF service. Converts `http://` → `ws://`, `https://` → `wss://`. Appends `/api/{auth}/oprf?version={protocolVersion}`.

- **`initSessions(services, threshold, request): Promise<OprfSessions>`**

  Connect to service nodes via WebSocket (pre-built WS URLs), send blinded query, receive commitments. On threshold failure throws `NodeError[]` (use `aggregateError` to convert).

- **`finishSessions(sessions, challenge): Promise<DLogProofShareShamir[]>`**

  Send challenge to nodes, receive proof shares.

- **`generateChallengeRequest(sessions): DLogCommitmentsShamir`**

  Combine commitments from sessions into a challenge request.

- **`verifyDlogEquality(requestId, publicKey, blindedRequest, proofShares, challenge): DLogEqualityProof`**

  Combine proof shares and verify the DLog equality proof.

- **`aggregateError(threshold, errors): OprfClientError`**

  Aggregate an array of `NodeError` into a single protocol-level `OprfClientError`.

### Types

```ts
interface VerifiableOprfOutput {
  output: bigint; // Final OPRF output
  dlogProof: DLogEqualityProof; // Combined Chaum-Pedersen proof
  blindedRequest: AffinePoint<bigint>; // Client's blinded query
  blindedResponse: AffinePoint<bigint>; // Combined blinded response
  unblindedResponse: AffinePoint<bigint>;
  oprfPublicKey: AffinePoint<bigint>; // Service public key
  epoch: number; // Key epoch
}

interface DistributedOprfOptions<Auth = unknown> {
  auth?: Auth; // Auth payload for OprfRequest
}
```

### Error Handling

The library uses a two-tier error model:

- **`NodeError`** — per-node error (WebSocket / service level)
- **`OprfClientError`** — protocol-level error (aggregated or logical)

```ts
import {
  OprfClientError,
  isOprfClientError,
  NodeError,
  isNodeError,
  ServiceError,
} from '@taceo/oprf-client';

try {
  const result = await distributedOprf(...);
} catch (err) {
  if (isOprfClientError(err)) {
    switch (err.code) {
      case 'NonUniqueServices':
        // Duplicate service URLs provided
        break;
      case 'ThresholdServiceError':
        // >= threshold nodes returned the same application-level error
        console.log(err.details?.serviceError?.errorCode);
        break;
      case 'Networking':
        // >= threshold nodes had WebSocket / networking errors
        console.log(err.details?.networkingErrors);
        break;
      case 'UnexpectedMessage':
        // >= threshold nodes reported unexpected message format
        break;
      case 'InvalidDLogProof':
        // Proof verification failed
        break;
      case 'InconsistentOprfPublicKeys':
        // Nodes returned different public keys
        break;
      case 'CannotFinishSession':
        // Failed to finish a session with a node
        break;
      case 'NodeErrorDisagreement':
        // Nodes returned differing errors — no consensus reached
        console.log(err.details?.nodeErrors);
        break;
    }
  }
}
```

### Error Codes

#### `OprfClientErrorCode` (protocol-level)

| Code                         | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `NonUniqueServices`          | Duplicate service URLs provided                       |
| `ThresholdServiceError`      | ≥ threshold nodes returned the same application error |
| `Networking`                 | ≥ threshold nodes had WebSocket / networking errors   |
| `UnexpectedMessage`          | ≥ threshold nodes reported unexpected message format  |
| `InvalidDLogProof`           | DLog proof verification failed                        |
| `InconsistentOprfPublicKeys` | Nodes returned different public keys                  |
| `CannotFinishSession`        | Failed to finish session after init                   |
| `NodeErrorDisagreement`      | Nodes returned differing errors, no consensus         |
| `Unknown`                    | Unexpected error                                      |

#### `NodeErrorCode` (per-node)

| Code                | Description                                      |
| ------------------- | ------------------------------------------------ |
| `ServiceError`      | Application-level error in WebSocket close frame |
| `WsError`           | WebSocket connection or transport error          |
| `UnexpectedMessage` | Unexpected message format from a node            |
| `Unknown`           | Unclassified per-node error                      |

## Wire Protocol

- WebSocket endpoint: `/api/{module}/oprf?version={protocolVersion}`
- Use `toOprfUri` to build URLs — `http://` → `ws://`, `https://` → `wss://`
- Messages use JSON with string-serialized BigInts for affine points

## License

MIT
