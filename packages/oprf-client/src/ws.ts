/**
 * WebSocket session for a single OPRF service connection.
 * Connects to /api/{module}/oprf, sends/receives JSON messages, handles close frames.
 */

import { OprfClientError } from './errors.js';
import type { OprfResponseWire } from './types.js';
import { wireToOprfResponse } from './types.js';
import type { OprfResponse } from './types.js';
import type { DLogCommitmentsShamirWire } from './types.js';
import { wireToProofShare, type DLogProofShareShamirWire } from './types.js';

/** Default protocol version sent to server (query param; browser cannot set headers). */
export const DEFAULT_PROTOCOL_VERSION = '1.0.0';

function buildWsUrl(
  serviceBase: string,
  module: string,
  version: string
): string {
  const path = `/api/${module}/oprf`;
  const base = serviceBase.replace(/^http/, 'ws');
  const url = new URL(path, base.endsWith('/') ? base.slice(0, -1) : base);
  url.searchParams.set('version', version);
  return url.toString();
}

export interface WebSocketSessionConfig {
  /** Protocol version (sent as query param ?version=). */
  protocolVersion?: string;
}

/**
 * Thin WebSocket session: connect, send JSON, receive JSON, handle close.
 * Uses text (JSON) frames. Browser WebSocket cannot set headers; version is sent as query param.
 */
export class WebSocketSession {
  private ws: WebSocket;
  private readonly service: string;
  private readonly config: Required<WebSocketSessionConfig>;

  private constructor(
    ws: WebSocket,
    service: string,
    config: Required<WebSocketSessionConfig>
  ) {
    this.ws = ws;
    this.service = service;
    this.config = config;
  }

  get serviceUrl(): string {
    return this.service;
  }

  /**
   * Open a new WebSocket to service at /api/{module}/oprf?version=...
   * In browser, custom headers are not supported; version is required in URL.
   */
  static connect(
    serviceBase: string,
    module: string,
    config: WebSocketSessionConfig = {}
  ): Promise<WebSocketSession> {
    const protocolVersion = config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    const url = buildWsUrl(serviceBase, module, protocolVersion);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        resolve(new WebSocketSession(ws, serviceBase, { protocolVersion }));
      };
      ws.onerror = () => {
        reject(new OprfClientError('WsError', `Failed to connect to ${url}`));
      };
    });
  }

  /** Send a JSON-serializable message as text frame. */
  send<T extends object>(msg: T): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new OprfClientError('WsError', 'WebSocket not open');
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Read next message: parse text as JSON, or handle close frame.
   * Rejects with OprfClientError on close (ServerError with reason) or non-text frame.
   */
  private readNext(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        cleanup();
        if (typeof event.data === 'string') {
          resolve(event.data);
        } else {
          reject(
            new OprfClientError(
              'UnexpectedMsg',
              'Expected text frame, got binary'
            )
          );
        }
      };
      const onClose = (event: CloseEvent) => {
        cleanup();
        if (event.code !== 1000 && event.code !== 1005) {
          const reason = event.reason || `Close code ${event.code}`;
          reject(
            new OprfClientError('ServerError', reason, { code: event.code })
          );
        } else {
          reject(new OprfClientError('Eof', 'Connection closed'));
        }
      };
      const cleanup = () => {
        this.ws.removeEventListener('message', onMessage);
        this.ws.removeEventListener('close', onClose);
      };
      this.ws.addEventListener('message', onMessage);
      this.ws.addEventListener('close', onClose);
    });
  }

  /** Read and parse OprfResponse. */
  async readOprfResponse(): Promise<OprfResponse> {
    const raw = await this.readNext();
    try {
      const w = JSON.parse(raw) as OprfResponseWire;
      return wireToOprfResponse(w);
    } catch {
      throw new OprfClientError('UnexpectedMsg', 'Invalid OprfResponse JSON');
    }
  }

  /** Read and parse DLogProofShareShamir. */
  async readProofShare(): Promise<{ value: bigint }> {
    const raw = await this.readNext();
    try {
      const w = JSON.parse(raw) as DLogProofShareShamirWire;
      return wireToProofShare(w);
    } catch {
      throw new OprfClientError('UnexpectedMsg', 'Invalid proof share JSON');
    }
  }

  /** Send challenge (DLogCommitmentsShamir wire). */
  sendChallenge(wire: DLogCommitmentsShamirWire): void {
    this.send(wire);
  }

  /** Gracefully close with normal code. */
  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'success');
    }
  }
}
