# @taceo/oprf-client

WebSocket client for distributed threshold OPRF over a network of TACEO service nodes.

This package provides high-level APIs for interacting with threshold OPRF services, handling the full protocol flow including session management, challenge generation, proof verification, and output finalization.

## Installation

```bash
pnpm add @taceo/oprf-client
```

## Usage

### Full Distributed OPRF

```ts
import { distributedOprf } from '@taceo/oprf-client';

const services = [
  'http://node1.example.com',
  'http://node2.example.com',
  'http://node3.example.com',
];

const result = await distributedOprf(
  services,
  'my-module', // module name
  2, // threshold
  12345n, // query
  0n, // domain separator
  { protocolVersion: '1.0.0' }
);

console.log(result.output); // OPRF output (bigint)
console.log(result.dlogProof); // Chaum-Pedersen proof
console.log(result.epoch); // Key epoch from servers
```

### Step-by-Step Protocol

```ts
import {
  initSessions,
  finishSessions,
  generateChallengeRequest,
  verifyDlogEquality,
} from '@taceo/oprf-client';
import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
} from '@taceo/oprf-core';

// 1. Blind the query
const beta = randomBlindingFactor();
const blindedRequest = blindQuery(query, beta);

// 2. Initialize sessions with service nodes
const sessions = await initSessions(services, module, threshold, {
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

- **`distributedOprf(services, module, threshold, query, domainSeparator, options?): Promise<VerifiableOprfOutput>`**

  End-to-end distributed OPRF: blind → init sessions → challenge → finish → verify → unblind → finalize.

- **`initSessions(services, module, threshold, request, options?): Promise<OprfSessions>`**

  Connect to service nodes via WebSocket, send blinded query, receive commitments.

- **`finishSessions(sessions, challenge): Promise<DLogProofShareShamir[]>`**

  Send challenge to nodes, receive proof shares.

- **`generateChallengeRequest(sessions): DLogCommitmentsShamir`**

  Combine commitments from sessions into a challenge request.

- **`verifyDlogEquality(requestId, publicKey, blindedRequest, proofShares, challenge): DLogEqualityProof`**

  Combine proof shares and verify the DLog equality proof.

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
  protocolVersion?: string; // Default "1.0.0"
  auth?: Auth; // Auth payload for OprfRequest
}
```

### Error Handling

```ts
import { OprfClientError, isOprfClientError } from '@taceo/oprf-client';

try {
  const result = await distributedOprf(...);
} catch (err) {
  if (isOprfClientError(err)) {
    switch (err.code) {
      case 'NonUniqueServices':
        // Duplicate service URLs provided
        break;
      case 'NotEnoughOprfResponses':
        // Fewer than threshold nodes responded
        break;
      case 'InvalidDLogProof':
        // Proof verification failed
        break;
      case 'InconsistentOprfPublicKeys':
        // Nodes returned different public keys
        break;
      case 'WsError':
        // WebSocket connection error
        break;
      case 'ServerError':
        // Server returned an error
        break;
    }
  }
}
```

### Error Codes

| Code                         | Description                          |
| ---------------------------- | ------------------------------------ |
| `NonUniqueServices`          | Duplicate service URLs provided      |
| `NotEnoughOprfResponses`     | Fewer than threshold nodes responded |
| `InvalidDLogProof`           | DLog proof verification failed       |
| `InconsistentOprfPublicKeys` | Nodes returned different public keys |
| `WsError`                    | WebSocket connection failed          |
| `ServerError`                | Server returned an error response    |
| `UnexpectedMsg`              | Unexpected message format            |
| `Eof`                        | Connection closed unexpectedly       |
| `InvalidUri`                 | Invalid service URL                  |

## Wire Protocol

- WebSocket endpoint: `/api/{module}/oprf?version={protocolVersion}`
- HTTP URLs are automatically converted to WebSocket (`http://` → `ws://`)
- Messages use JSON with string-serialized BigInts for affine points

## License

MIT
