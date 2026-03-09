/**
 * URI construction helpers for OPRF service endpoints.
 */

import { DEFAULT_PROTOCOL_VERSION } from './ws.js';

/**
 * Build a WebSocket URL for a single OPRF service.
 * http → ws, https → wss. Appends /api/{auth}/oprf?version={protocolVersion}.
 */
export function toOprfUri(
  service: string,
  auth: string,
  protocolVersion: string = DEFAULT_PROTOCOL_VERSION
): string {
  const base = service
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/$/, '');
  return `${base}/api/${auth}/oprf?version=${protocolVersion}`;
}
