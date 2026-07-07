/**
 * Best-effort HTTP redirect resolution for WebSocket URLs.
 * The standard WebSocket API fails on 3xx handshake responses, so we
 * pre-resolve the final location with a plain GET before connecting.
 */

/**
 * Resolve HTTP redirects for a ws(s) URL via a pre-flight fetch.
 * Converts ws→http / wss→https, fetches with redirect following, and maps
 * the final response.url back to the ws scheme. The final response status
 * is irrelevant (e.g. 426 Upgrade Required is fine) — only response.url
 * is used, verbatim. Never throws: on fetch failure or a missing
 * response.url, returns the input unchanged.
 *
 * TLS downgrade guard: if the input was `wss://` but the redirect chain
 * resolves to an insecure `http://` URL, the downgrade is rejected and the
 * original `wss://` URL is returned unchanged. A `ws://` input may resolve
 * to either scheme (an upgrade to `wss://` is fine).
 */
export async function resolveWsUrl(wsUrl: string): Promise<string> {
  const isSecure = /^wss:\/\//.test(wsUrl);
  const httpUrl = wsUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
  try {
    const response = await fetch(httpUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    try {
      await response.body?.cancel();
    } catch {
      // best-effort cleanup only
    }
    if (!response.url) {
      return wsUrl;
    }
    if (isSecure && /^http:\/\//.test(response.url)) {
      // Never downgrade a secure request to an insecure endpoint.
      return wsUrl;
    }
    return response.url
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');
  } catch {
    return wsUrl;
  }
}
