# @taceo/oprf-client

## 0.9.1

### Patch Changes

- 83d7380: Send `request_id` as query parameter when opening the WebSocket so nodes can share one trace per OPRF request.
- 7fee7d7: Update `@noble/curves` to 2.4 and `@noble/hashes` to 2.4; fix BabyJubJub scalar field order for the corrected curve parameters in noble-curves ≥ 2.2.
- Updated dependencies [7fee7d7]
  - @taceo/oprf-core@0.4.1
