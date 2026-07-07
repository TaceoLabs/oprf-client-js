import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSocketSession } from '../src/ws.js';
import { initSessions } from '../src/sessions.js';
import { distributedOprf, randomBlindingFactor } from '../src/index.js';
import { NodeError } from '../src/errors.js';

describe('ConnectOptions threading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initSessions passes opts to WebSocketSession.connect', async () => {
    const connectSpy = vi
      .spyOn(WebSocketSession, 'connect')
      .mockRejectedValue(new NodeError('WsError', { reason: 'stubbed' }));

    const opts = { followRedirects: true };
    await expect(
      initSessions(
        ['wss://a.example.com/api/m/oprf'],
        1,
        { request_id: 'r', blinded_query: { x: 0n, y: 1n }, auth: undefined },
        opts
      )
    ).rejects.toBeDefined();

    expect(connectSpy).toHaveBeenCalledWith(
      'wss://a.example.com/api/m/oprf',
      opts
    );
  });

  it('distributedOprf passes opts down to WebSocketSession.connect', async () => {
    const connectSpy = vi
      .spyOn(WebSocketSession, 'connect')
      .mockRejectedValue(new NodeError('WsError', { reason: 'stubbed' }));

    const opts = { followRedirects: true };
    await expect(
      distributedOprf(
        ['wss://a.example.com/api/m/oprf'],
        1,
        1n,
        randomBlindingFactor(),
        0n,
        undefined,
        opts
      )
    ).rejects.toBeDefined();

    expect(connectSpy).toHaveBeenCalledWith(
      'wss://a.example.com/api/m/oprf',
      opts
    );
  });
});
