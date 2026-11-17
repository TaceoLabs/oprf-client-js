import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSessions } from '../src/sessions.js';
import type { OprfResponseWire } from '../src/types.js';

type Behavior = 'respond' | 'hang' | 'fail';

type Listener = (event: unknown) => void;

/**
 * Minimal WebSocket stand-in. The URL decides how the "node" behaves:
 * ws://<behavior>/<party_id>
 */
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  binaryType = 'blob';
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly url: string;
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    }, 0);
  }

  private get behavior(): Behavior {
    return new URL(this.url).host as Behavior;
  }

  private get partyId(): number {
    return Number(new URL(this.url).pathname.slice(1));
  }

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  private emit(type: string, event: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }

  send(): void {
    if (this.behavior === 'hang') return;
    setTimeout(() => {
      if (this.behavior === 'fail') {
        this.readyState = MockWebSocket.CLOSED;
        this.emit('close', { code: 4002, reason: 'bad request' });
        return;
      }
      const response: OprfResponseWire = {
        commitments: {
          c: ['1', '2'],
          d1: ['1', '2'],
          d2: ['1', '2'],
          e1: ['1', '2'],
          e2: ['1', '2'],
        },
        party_id: this.partyId,
        oprf_pub_key_with_epoch: { key: ['3', '4'], epoch: 0 },
      };
      this.emit('message', { data: JSON.stringify(response) });
    }, 0);
  }

  close(): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => this.emit('close', { code: 1000, reason: '' }), 0);
  }
}

const request = {
  request_id: '00000000-0000-4000-8000-000000000000',
  blinded_query: { x: 5n, y: 6n },
  auth: null,
};

/** Fails instead of hanging the test runner when initSessions never settles. */
function withinMs<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not settle within ${ms}ms`)), ms)
    ),
  ]);
}

function socket(url: string): MockWebSocket {
  return MockWebSocket.instances.find((ws) => ws.url === url)!;
}

describe('initSessions', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns once threshold is reached without waiting for an unresponsive node', async () => {
    const services = ['ws://respond/1', 'ws://hang/2', 'ws://respond/0'];
    const sessions = await withinMs(initSessions(services, 2, request), 1000);
    expect(sessions.partyIds).toEqual([0, 1]);
    expect(sessions.ws.map((s) => s.serviceUrl)).toEqual([
      'ws://respond/0',
      'ws://respond/1',
    ]);
    expect(sessions.epoch).toBe(0);
  });

  it('closes the session of a node that has not answered once threshold is reached', async () => {
    const services = ['ws://respond/0', 'ws://hang/1', 'ws://respond/2'];
    await withinMs(initSessions(services, 2, request), 1000);
    expect(socket('ws://hang/1').readyState).toBe(MockWebSocket.CLOSED);
    expect(socket('ws://respond/0').readyState).toBe(MockWebSocket.OPEN);
    expect(socket('ws://respond/2').readyState).toBe(MockWebSocket.OPEN);
  });

  it('closes opened sessions and throws node errors when threshold cannot be reached', async () => {
    const services = ['ws://respond/0', 'ws://fail/1', 'ws://fail/2'];
    const err = await withinMs(initSessions(services, 2, request), 1000).catch(
      (e: unknown) => e
    );
    expect(Array.isArray(err)).toBe(true);
    expect((err as { code: string }[]).map((e) => e.code)).toEqual([
      'ServiceError',
      'ServiceError',
    ]);
    expect(socket('ws://respond/0').readyState).toBe(MockWebSocket.CLOSED);
  });
});
