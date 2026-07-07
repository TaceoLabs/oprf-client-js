import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSocketSession } from '../src/ws.js';

/** Minimal WebSocket stand-in: records the URL, opens on next microtask. */
class FakeWebSocket {
  static lastUrl: string | undefined;
  static readonly OPEN = 1;
  binaryType = 'blob';
  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(url: string) {
    FakeWebSocket.lastUrl = url;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }
}

describe('WebSocketSession.connect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.lastUrl = undefined;
  });

  it('connects to the resolved URL when followRedirects is true', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const fetchMock = vi.fn().mockResolvedValue({
      url: 'https://new.example.com/api/mod/oprf?version=0.8.0',
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = await WebSocketSession.connect(
      'wss://old.example.com/api/mod/oprf?version=0.8.0',
      { followRedirects: true }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(FakeWebSocket.lastUrl).toBe(
      'wss://new.example.com/api/mod/oprf?version=0.8.0'
    );
    expect(session.serviceUrl).toBe(
      'wss://new.example.com/api/mod/oprf?version=0.8.0'
    );
  });

  it('performs no fetch when followRedirects is not set', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const url = 'wss://old.example.com/api/mod/oprf?version=0.8.0';
    const session = await WebSocketSession.connect(url);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeWebSocket.lastUrl).toBe(url);
    expect(session.serviceUrl).toBe(url);
  });
});
