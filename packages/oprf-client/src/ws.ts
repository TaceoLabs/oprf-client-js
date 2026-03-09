/**
 * WebSocket session for a single OPRF service connection.
 * Takes a pre-built WS URL (see uri.ts). Errors are NodeError variants.
 */

import { NodeError, ServiceError } from './errors.js';
import type { OprfResponseWire } from './types.js';
import { wireToOprfResponse } from './types.js';
import type { OprfResponse } from './types.js';
import type { DLogCommitmentsShamirWire } from './types.js';
import { wireToProofShare, type DLogProofShareShamirWire } from './types.js';

/** Default protocol version sent to server (query param; browser cannot set headers). */
export const DEFAULT_PROTOCOL_VERSION = '1.0.0';

/**
 * Thin WebSocket session: connect, send JSON, receive JSON, handle close.
 * Uses text (JSON) frames. Browser WebSocket cannot set headers; version is sent as query param.
 * All errors are thrown as NodeError.
 */
export class WebSocketSession {
  private ws: WebSocket;
  private readonly service: string;

  private constructor(ws: WebSocket, service: string) {
    this.ws = ws;
    this.service = service;
  }

  get serviceUrl(): string {
    return this.service;
  }

  /**
   * Open a new WebSocket to the given pre-built WS URL.
   * Connect errors throw NodeError('WsError', ...).
   */
  static connect(url: string): Promise<WebSocketSession> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(
          new NodeError('WsError', {
            reason: `Failed to construct WebSocket for ${url}`,
            cause: err instanceof Error ? err : undefined,
          })
        );
        return;
      }
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        resolve(new WebSocketSession(ws, url));
      };
      ws.onerror = (event) => {
        reject(
          new NodeError('WsError', {
            reason: `Failed to connect to ${url}`,
            cause: event instanceof ErrorEvent ? event.error : undefined,
          })
        );
      };
    });
  }

  /** Send a JSON-serializable message as text frame. Throws NodeError('WsError') on failure. */
  send<T extends object>(msg: T): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new NodeError('WsError', { reason: 'WebSocket not open' });
    }
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (err) {
      throw new NodeError('WsError', {
        reason: 'Failed to send message',
        cause: err instanceof Error ? err : undefined,
      });
    }
  }

  /**
   * Read next message. Returns text data.
   * Rejects with NodeError on:
   *  - Binary frame → UnexpectedMessage
   *  - Non-normal close → ServiceError
   *  - Normal/1005 close → UnexpectedMessage('Server closed websocket')
   *  - Error event → WsError
   *  - null/end → UnexpectedMessage('Server closed connection')
   */
  private readNext(): Promise<string> {
    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        cleanup();
        if (typeof event.data === 'string') {
          resolve(event.data);
        } else {
          reject(
            new NodeError('UnexpectedMessage', {
              reason: 'binary frame received',
            })
          );
        }
      };
      const onClose = (event: CloseEvent) => {
        cleanup();
        if (event.code !== 1000 && event.code !== 1005) {
          const svcErr = new ServiceError(
            event.code,
            event.reason || undefined
          );
          reject(
            new NodeError('ServiceError', {
              reason: svcErr.message,
              serviceError: svcErr,
            })
          );
        } else {
          reject(
            new NodeError('UnexpectedMessage', {
              reason: 'Server closed websocket',
            })
          );
        }
      };
      const onError = (event: Event) => {
        cleanup();
        reject(
          new NodeError('WsError', {
            reason: 'WebSocket error',
            cause: event instanceof ErrorEvent ? event.error : undefined,
          })
        );
      };
      const cleanup = () => {
        this.ws.removeEventListener('message', onMessage);
        this.ws.removeEventListener('close', onClose);
        this.ws.removeEventListener('error', onError);
      };
      this.ws.addEventListener('message', onMessage);
      this.ws.addEventListener('close', onClose);
      this.ws.addEventListener('error', onError);
    });
  }

  /** Read and parse OprfResponse. Parse errors → NodeError('UnexpectedMessage'). */
  async readOprfResponse(): Promise<OprfResponse> {
    const raw = await this.readNext();
    try {
      const w = JSON.parse(raw) as OprfResponseWire;
      return wireToOprfResponse(w);
    } catch {
      throw new NodeError('UnexpectedMessage', {
        reason: 'Invalid OprfResponse JSON',
      });
    }
  }

  /** Read and parse DLogProofShareShamir. Parse errors → NodeError('UnexpectedMessage'). */
  async readProofShare(): Promise<{ value: bigint }> {
    const raw = await this.readNext();
    try {
      const w = JSON.parse(raw) as DLogProofShareShamirWire;
      return wireToProofShare(w);
    } catch {
      throw new NodeError('UnexpectedMessage', {
        reason: 'Invalid proof share JSON',
      });
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
