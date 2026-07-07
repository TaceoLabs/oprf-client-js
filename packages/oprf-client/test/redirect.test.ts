import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveWsUrl } from '../src/redirect.js';

describe('resolveWsUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows a redirect and maps https back to wss', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: 'https://new.example.com/api/mod/oprf?version=0.8.0',
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveWsUrl(
      'wss://old.example.com/api/mod/oprf?version=0.8.0'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://old.example.com/api/mod/oprf?version=0.8.0',
      { method: 'GET', redirect: 'follow' }
    );
    expect(resolved).toBe('wss://new.example.com/api/mod/oprf?version=0.8.0');
  });

  it('maps ws to http for the pre-flight and back', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      url: 'http://other.example.com/api/mod/oprf?version=0.8.0',
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveWsUrl(
      'ws://plain.example.com/api/mod/oprf?version=0.8.0'
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://plain.example.com/api/mod/oprf?version=0.8.0',
      { method: 'GET', redirect: 'follow' }
    );
    expect(resolved).toBe('ws://other.example.com/api/mod/oprf?version=0.8.0');
  });

  it('returns the input unchanged when there is no redirect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        url: 'https://same.example.com/api/mod/oprf?version=0.8.0',
      })
    );

    const url = 'wss://same.example.com/api/mod/oprf?version=0.8.0';
    expect(await resolveWsUrl(url)).toBe(url);
  });

  it('falls back to the original URL when fetch rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network error'))
    );

    const url = 'wss://blocked.example.com/api/mod/oprf?version=0.8.0';
    expect(await resolveWsUrl(url)).toBe(url);
  });

  it('falls back to the original URL when response.url is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ url: '' }));

    const url = 'wss://odd.example.com/api/mod/oprf?version=0.8.0';
    expect(await resolveWsUrl(url)).toBe(url);
  });

  it('rejects a secure-to-insecure downgrade and returns the original wss URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        url: 'http://insecure.example.com/api/mod/oprf?version=0.8.0',
      })
    );

    const url = 'wss://secure.example.com/api/mod/oprf?version=0.8.0';
    expect(await resolveWsUrl(url)).toBe(url);
  });
});
